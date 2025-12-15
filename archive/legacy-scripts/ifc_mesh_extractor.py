"""
Extract 3D mesh geometry from IFC models in simple, universal formats.

This script:
1. Iterates through all IfcElement instances with 3D geometry
2. Extracts vertices and faces in world coordinates
3. Exports minimal data (GUID, type, vertices, faces) to JSON and NumPy formats
4. Provides statistics on extraction process

The output can be used for:
- Web visualization (Three.js)
- Analysis (NumPy, NetworkX, matplotlib, Plotly)
- Conversion to other 3D formats (GLTF, OBJ, point clouds)
"""

import argparse
import json
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from multiprocessing import Pool, cpu_count

import ifcopenshell
import ifcopenshell.geom
import numpy as np
from tqdm import tqdm


# Worker function for parallel processing (must be at module level for pickling)
def _process_element_worker(args):
    """
    Worker function to process a single element in parallel.

    Args:
        args: Tuple of (ifc_path, element_guid, verbose)

    Returns:
        Dict with extraction result or None if failed
    """
    ifc_path, element_guid, verbose = args

    try:
        # Each worker loads its own IFC file
        ifc_file = ifcopenshell.open(ifc_path)
        element = ifc_file.by_guid(element_guid)

        # Extract geometry
        settings = ifcopenshell.geom.settings()
        settings.set(settings.USE_WORLD_COORDS, True)
        shape = ifcopenshell.geom.create_shape(settings, element)

        # Get geometry data
        geometry = shape.geometry
        verts = geometry.verts
        faces = geometry.faces

        # Reshape to numpy arrays
        vertices = np.array(verts).reshape(-1, 3)
        faces = np.array(faces).reshape(-1, 3)

        # Validate
        if len(vertices) == 0 or len(faces) == 0:
            return None
        if np.any(np.isnan(vertices)) or np.any(np.isinf(vertices)):
            return None
        if np.any(faces < 0) or np.any(faces >= len(vertices)):
            return None

        return {
            "guid": element_guid,
            "type": element.is_a(),
            "vertices": vertices,
            "faces": faces
        }

    except Exception as e:
        if verbose:
            print(f"  Worker failed for {element_guid}: {e}")
        return None


class IFCMeshExtractor:
    """Extract 3D mesh geometry from IFC models."""

    def __init__(
        self,
        ifc_path: str,
        output_dir: str = "output",
        verbose: bool = False,
        parallel: bool = False,
        num_workers: Optional[int] = None
    ):
        """
        Initialize extractor.

        Args:
            ifc_path: Path to IFC file
            output_dir: Output directory for exported files
            verbose: Enable verbose logging
            parallel: Enable parallel processing (multiprocessing)
            num_workers: Number of worker processes (default: CPU count)
        """
        self.ifc_path = Path(ifc_path)
        self.output_dir = Path(output_dir)
        self.verbose = verbose
        self.parallel = parallel
        self.num_workers = num_workers if num_workers else cpu_count()

        # Validate input
        if not self.ifc_path.exists():
            raise FileNotFoundError(f"IFC file not found: {self.ifc_path}")

        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Statistics
        self.stats = {
            "total_elements": 0,
            "elements_with_geometry": 0,
            "successful_extractions": 0,
            "failed_extractions": 0,
            "skipped_no_representation": 0,
            "total_vertices": 0,
            "total_triangles": 0,
            "element_type_counts": {},
            "failed_guids": [],
            "processing_time_seconds": 0.0
        }

    def load_ifc(self) -> ifcopenshell.file:
        """Load IFC file and validate."""
        print(f"Loading IFC file: {self.ifc_path.name}...")
        ifc_file = ifcopenshell.open(self.ifc_path)
        print(f"✓ IFC loaded: {ifc_file.schema} schema")
        return ifc_file

    def get_elements_with_geometry(
        self,
        ifc_file: ifcopenshell.file
    ) -> List:
        """
        Get all IfcElement instances that have geometric representation.

        Args:
            ifc_file: IFC file object

        Returns:
            List of IFC elements with Representation attribute
        """
        print("Querying elements...")

        # Get all IfcElement instances (physical building elements)
        all_elements = ifc_file.by_type('IfcElement')
        self.stats["total_elements"] = len(all_elements)

        # Filter to elements with geometry
        elements_with_geom = [e for e in all_elements if e.Representation]
        self.stats["elements_with_geometry"] = len(elements_with_geom)
        self.stats["skipped_no_representation"] = (
            self.stats["total_elements"] - self.stats["elements_with_geometry"]
        )

        print(f"✓ Found {len(all_elements)} IfcElement instances")
        print(f"✓ {len(elements_with_geom)} have geometric representation")
        print(f"  Skipped {self.stats['skipped_no_representation']} without geometry")

        return elements_with_geom

    def extract_element_geometry(
        self,
        ifc_file: ifcopenshell.file,
        element
    ) -> Optional[Tuple[np.ndarray, np.ndarray]]:
        """
        Extract mesh geometry for an IFC element.

        Args:
            ifc_file: IFC file object
            element: IFC element instance

        Returns:
            Tuple of (vertices, faces) as numpy arrays, or None if failed
            - vertices: (N, 3) array of XYZ coordinates in world space
            - faces: (M, 3) array of triangle vertex indices
        """
        try:
            # Create geometry settings (world coordinates)
            settings = ifcopenshell.geom.settings()
            settings.set(settings.USE_WORLD_COORDS, True)

            # Extract shape
            shape = ifcopenshell.geom.create_shape(settings, element)

            # Get geometry data
            geometry = shape.geometry
            verts = geometry.verts
            faces = geometry.faces

            # Reshape to numpy arrays
            vertices = np.array(verts).reshape(-1, 3)
            faces = np.array(faces).reshape(-1, 3)

            return vertices, faces

        except Exception as e:
            if self.verbose:
                print(f"  Warning: Failed to extract geometry for {element.GlobalId}: {e}")
            return None

    def validate_geometry(
        self,
        vertices: np.ndarray,
        faces: np.ndarray,
        element_guid: str
    ) -> bool:
        """
        Validate extracted geometry arrays.

        Args:
            vertices: Vertex array (N, 3)
            faces: Face array (M, 3)
            element_guid: Element GUID for error reporting

        Returns:
            True if valid, False otherwise
        """
        errors = []

        # Validate vertices
        if len(vertices) == 0:
            errors.append("No vertices")
        elif vertices.shape[1] != 3:
            errors.append(f"Vertices not Nx3: {vertices.shape}")
        elif np.any(np.isnan(vertices)):
            errors.append("Vertices contain NaN")
        elif np.any(np.isinf(vertices)):
            errors.append("Vertices contain Inf")
        elif np.any(np.abs(vertices) > 1e6):
            errors.append("Vertices have extreme values (>1e6)")

        # Validate faces
        if len(faces) == 0:
            errors.append("No faces")
        elif faces.shape[1] != 3:
            errors.append(f"Faces not Mx3: {faces.shape}")
        elif np.any(faces < 0):
            errors.append("Faces contain negative indices")
        elif np.any(faces >= len(vertices)):
            errors.append("Faces reference invalid vertex indices")

        if errors:
            if self.verbose:
                print(f"⚠ Validation failed for {element_guid}:")
                for error in errors:
                    print(f"    - {error}")
            return False

        return True

    def process(self):
        """Main processing pipeline."""
        print("=" * 80)
        print("IFC Mesh Extractor")
        print("=" * 80)
        print(f"Input: {self.ifc_path}")
        print(f"Output: {self.output_dir}")
        if self.parallel:
            print(f"Mode: Parallel processing ({self.num_workers} workers)")
        else:
            print(f"Mode: Sequential processing")
        print()

        start_time = time.time()

        # Load IFC
        ifc_file = self.load_ifc()

        # Get elements
        elements = self.get_elements_with_geometry(ifc_file)

        if not elements:
            print("No elements with geometry found!")
            return

        # Extract geometry
        print(f"\nExtracting geometry from {len(elements)} elements...")

        if self.parallel:
            extracted_data = self._process_parallel(elements)
        else:
            extracted_data = self._process_sequential(ifc_file, elements)

        # Processing time
        self.stats["processing_time_seconds"] = time.time() - start_time

        # Export results
        if extracted_data:
            print(f"\n✓ Successfully extracted {len(extracted_data)} elements")
            print("Exporting results...")

            self.export_json(extracted_data)
            self.export_numpy(extracted_data)
            self.export_statistics()

            print("\n" + "=" * 80)
            print("EXTRACTION COMPLETE")
            print("=" * 80)
            self.print_statistics()
        else:
            print("\n⚠ No geometry extracted successfully!")

    def _process_sequential(self, ifc_file, elements) -> List[Dict]:
        """Process elements sequentially (single-threaded)."""
        extracted_data = []

        for element in tqdm(elements, desc="Processing elements"):
            # Extract geometry
            result = self.extract_element_geometry(ifc_file, element)

            if result is None:
                self.stats["failed_extractions"] += 1
                self.stats["failed_guids"].append(element.GlobalId)
                continue

            vertices, faces = result

            # Validate geometry
            if not self.validate_geometry(vertices, faces, element.GlobalId):
                self.stats["failed_extractions"] += 1
                self.stats["failed_guids"].append(element.GlobalId)
                continue

            # Store data
            element_type = element.is_a()
            extracted_data.append({
                "guid": element.GlobalId,
                "type": element_type,
                "vertices": vertices,
                "faces": faces
            })

            # Update statistics
            self.stats["successful_extractions"] += 1
            self.stats["total_vertices"] += len(vertices)
            self.stats["total_triangles"] += len(faces)

            # Count by type
            if element_type not in self.stats["element_type_counts"]:
                self.stats["element_type_counts"][element_type] = 0
            self.stats["element_type_counts"][element_type] += 1

        return extracted_data

    def _process_parallel(self, elements) -> List[Dict]:
        """Process elements in parallel using multiprocessing."""
        # Prepare worker arguments
        worker_args = [
            (str(self.ifc_path), element.GlobalId, self.verbose)
            for element in elements
        ]

        print(f"Starting parallel processing with {self.num_workers} workers...")

        # Process in parallel
        with Pool(processes=self.num_workers) as pool:
            results = list(tqdm(
                pool.imap(_process_element_worker, worker_args),
                total=len(worker_args),
                desc="Processing elements"
            ))

        # Filter out None results and update statistics
        extracted_data = []
        for result in results:
            if result is None:
                self.stats["failed_extractions"] += 1
                continue

            extracted_data.append(result)

            # Update statistics
            self.stats["successful_extractions"] += 1
            self.stats["total_vertices"] += len(result["vertices"])
            self.stats["total_triangles"] += len(result["faces"])

            # Count by type
            element_type = result["type"]
            if element_type not in self.stats["element_type_counts"]:
                self.stats["element_type_counts"][element_type] = 0
            self.stats["element_type_counts"][element_type] += 1

        return extracted_data

    def export_json(self, extracted_data: List[Dict]):
        """
        Export geometry data to JSON file.

        Args:
            extracted_data: List of element dictionaries with geometry
        """
        output_path = self.output_dir / f"{self.ifc_path.stem}_geometry.json"

        # Convert numpy arrays to lists for JSON serialization
        json_data = {
            "source_file": str(self.ifc_path.name),
            "coordinate_system": "world_coords",
            "element_count": len(extracted_data),
            "elements": []
        }

        for element_data in extracted_data:
            json_data["elements"].append({
                "guid": element_data["guid"],
                "type": element_data["type"],
                "vertices": element_data["vertices"].tolist(),
                "faces": element_data["faces"].tolist()
            })

        # Write JSON
        with open(output_path, 'w') as f:
            json.dump(json_data, f, indent=2)

        print(f"✓ Saved JSON: {output_path}")

    def export_numpy(self, extracted_data: List[Dict]):
        """
        Export geometry data to NumPy .npz file.

        Args:
            extracted_data: List of element dictionaries with geometry
        """
        output_path = self.output_dir / f"{self.ifc_path.stem}_geometry.npz"

        # Prepare data for NumPy
        arrays_to_save = {
            'guids': np.array([e["guid"] for e in extracted_data]),
            'types': np.array([e["type"] for e in extracted_data]),
            'element_count': np.array([len(extracted_data)])
        }

        # Store vertices and faces as separate arrays per element
        for i, element_data in enumerate(extracted_data):
            arrays_to_save[f'vertices_{i}'] = element_data["vertices"]
            arrays_to_save[f'faces_{i}'] = element_data["faces"]

        # Save compressed
        np.savez_compressed(output_path, **arrays_to_save)

        print(f"✓ Saved NumPy: {output_path}")

    def export_statistics(self):
        """Export processing statistics to JSON file."""
        output_path = self.output_dir / f"{self.ifc_path.stem}_stats.json"

        with open(output_path, 'w') as f:
            json.dump(self.stats, f, indent=2)

        print(f"✓ Saved statistics: {output_path}")

    def print_statistics(self):
        """Print processing statistics to console."""
        print(f"\nSource file: {self.ifc_path.name}")
        print(f"Total IfcElement instances: {self.stats['total_elements']}")
        print(f"Elements with geometry: {self.stats['elements_with_geometry']}")
        print(f"Successfully extracted: {self.stats['successful_extractions']}")
        print(f"Failed extractions: {self.stats['failed_extractions']}")
        print(f"Skipped (no representation): {self.stats['skipped_no_representation']}")
        print(f"\nGeometry extracted:")
        print(f"  Total vertices: {self.stats['total_vertices']:,}")
        print(f"  Total triangles: {self.stats['total_triangles']:,}")
        print(f"\nElements by type:")
        for element_type, count in sorted(
            self.stats['element_type_counts'].items(),
            key=lambda x: x[1],
            reverse=True
        ):
            print(f"  {element_type}: {count}")
        print(f"\nProcessing time: {self.stats['processing_time_seconds']:.1f}s")
        print(f"Output directory: {self.output_dir}")


def main():
    """Entry point."""
    parser = argparse.ArgumentParser(
        description="Extract 3D mesh geometry from IFC models"
    )
    parser.add_argument(
        "ifc_path",
        type=str,
        help="Path to IFC file"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="output",
        help="Output directory (default: output/)"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging"
    )
    parser.add_argument(
        "--parallel",
        action="store_true",
        help="Enable parallel processing (multiprocessing)"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=None,
        help="Number of worker processes (default: CPU count)"
    )

    args = parser.parse_args()

    # Create extractor and process
    extractor = IFCMeshExtractor(
        ifc_path=args.ifc_path,
        output_dir=args.output_dir,
        verbose=args.verbose,
        parallel=args.parallel,
        num_workers=args.workers
    )

    extractor.process()


if __name__ == "__main__":
    main()
