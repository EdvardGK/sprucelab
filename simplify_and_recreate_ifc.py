"""
Simplify extracted mesh geometry and recreate IFC file.

Takes the extracted JSON geometry, applies mesh simplification,
and creates a new simplified IFC file.
"""

import json
import numpy as np
import open3d as o3d
import ifcopenshell
import ifcopenshell.api
from pathlib import Path
from tqdm import tqdm
import time


class MeshSimplifier:
    """Simplify meshes and recreate IFC."""

    def __init__(
        self,
        json_path: str,
        output_ifc_path: str,
        target_triangles: int = 1000,
        simplification_method: str = "quadric"
    ):
        """
        Initialize simplifier.

        Args:
            json_path: Path to extracted JSON geometry
            output_ifc_path: Path for output IFC file
            target_triangles: Target triangle count per element
            simplification_method: 'quadric' or 'cluster' or 'convex_hull'
        """
        self.json_path = Path(json_path)
        self.output_ifc_path = Path(output_ifc_path)
        self.target_triangles = target_triangles
        self.simplification_method = simplification_method

        self.stats = {
            "original_triangles": 0,
            "simplified_triangles": 0,
            "original_vertices": 0,
            "simplified_vertices": 0,
            "elements_processed": 0,
            "failed_elements": 0
        }

    def load_json(self):
        """Load extracted geometry JSON."""
        print(f"Loading JSON: {self.json_path.name}...")
        with open(self.json_path, 'r') as f:
            data = json.load(f)
        print(f"✓ Loaded {len(data['elements'])} elements")
        return data

    def simplify_mesh(self, vertices: np.ndarray, faces: np.ndarray):
        """
        Simplify a single mesh.

        Args:
            vertices: Vertex array (N, 3)
            faces: Face array (M, 3)

        Returns:
            Tuple of (simplified_vertices, simplified_faces) or None
        """
        try:
            # Create Open3D mesh
            mesh = o3d.geometry.TriangleMesh()
            mesh.vertices = o3d.utility.Vector3dVector(vertices)
            mesh.triangles = o3d.utility.Vector3iVector(faces)

            # Remove degenerate triangles
            mesh.remove_degenerate_triangles()
            mesh.remove_duplicated_triangles()
            mesh.remove_duplicated_vertices()
            mesh.remove_non_manifold_edges()

            # Simplify based on method
            if self.simplification_method == "quadric":
                # Quadric decimation (best quality)
                target = min(self.target_triangles, len(faces))
                simplified = mesh.simplify_quadric_decimation(target)

            elif self.simplification_method == "cluster":
                # Vertex clustering (faster, less accurate)
                voxel_size = self._estimate_voxel_size(vertices)
                simplified = mesh.simplify_vertex_clustering(
                    voxel_size=voxel_size,
                    contraction=o3d.geometry.SimplificationContraction.Average
                )

            elif self.simplification_method == "convex_hull":
                # Convex hull (extreme simplification)
                simplified, _ = mesh.compute_convex_hull()

            else:
                raise ValueError(f"Unknown simplification method: {self.simplification_method}")

            # Extract simplified geometry
            simp_verts = np.asarray(simplified.vertices)
            simp_faces = np.asarray(simplified.triangles)

            # Validate
            if len(simp_verts) == 0 or len(simp_faces) == 0:
                return None

            return simp_verts, simp_faces

        except Exception as e:
            print(f"  Warning: Simplification failed: {e}")
            return None

    def _estimate_voxel_size(self, vertices: np.ndarray) -> float:
        """Estimate appropriate voxel size for clustering."""
        bbox = vertices.max(axis=0) - vertices.min(axis=0)
        # Aim for roughly target_triangles cells
        volume = np.prod(bbox)
        cells_per_dim = np.cbrt(self.target_triangles)
        return max(bbox) / cells_per_dim

    def create_ifc_file(self, elements_data):
        """
        Create new IFC file with simplified geometry using IfcTriangulatedFaceSet.

        Args:
            elements_data: List of simplified element data
        """
        print(f"\nCreating IFC file: {self.output_ifc_path.name}...")

        # Create new IFC file (IFC4 schema - supports IfcTriangulatedFaceSet)
        ifc_file = ifcopenshell.file(schema="IFC4")

        # Create project structure
        project = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcProject", name="Simplified Model")
        # Explicitly set units to meters (geometry is in meters from original IFC)
        ifcopenshell.api.run("unit.assign_unit", ifc_file, length={"is_metric": True, "raw": "METRE"})

        # Create site
        site = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcSite", name="Site")
        ifcopenshell.api.run("aggregate.assign_object", ifc_file, products=[site], relating_object=project)

        # Create building
        building = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcBuilding", name="Building")
        ifcopenshell.api.run("aggregate.assign_object", ifc_file, products=[building], relating_object=site)

        # Create building storey
        storey = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcBuildingStorey", name="Ground Floor")
        ifcopenshell.api.run("aggregate.assign_object", ifc_file, products=[storey], relating_object=building)

        # Create context for geometry
        context = ifcopenshell.api.run("context.add_context", ifc_file, context_type="Model")
        body_context = ifcopenshell.api.run(
            "context.add_context",
            ifc_file,
            context_type="Model",
            context_identifier="Body",
            target_view="MODEL_VIEW",
            parent=context
        )

        # Add elements with simplified geometry
        print("Adding elements to IFC...")
        success_count = 0
        fail_count = 0

        for elem_data in tqdm(elements_data, desc="Creating IFC elements"):
            try:
                # Determine IFC class
                ifc_class = elem_data['type']
                if not ifc_class.startswith('Ifc'):
                    ifc_class = 'IfcBuildingElementProxy'

                # Create element
                element = ifcopenshell.api.run(
                    "root.create_entity",
                    ifc_file,
                    ifc_class=ifc_class,
                    name=f"{ifc_class}_{elem_data.get('guid', 'unknown')[:8]}"
                )

                # Assign to storey
                ifcopenshell.api.run("spatial.assign_container", ifc_file, products=[element], relating_structure=storey)

                # Get geometry
                vertices = np.array(elem_data['vertices'])
                faces = np.array(elem_data['faces'])

                # Create IfcCartesianPointList3D with all vertices (convert to native Python types)
                point_list = ifc_file.createIfcCartesianPointList3D(
                    vertices.tolist()  # Converts numpy arrays to native Python lists/floats
                )

                # Create face indices (1-based indexing for IFC, ensure native Python ints)
                coord_index = [[int(f[0] + 1), int(f[1] + 1), int(f[2] + 1)] for f in faces]

                # Create IfcTriangulatedFaceSet (IFC4 mesh representation)
                triangulated_face_set = ifc_file.createIfcTriangulatedFaceSet(
                    Coordinates=point_list,
                    CoordIndex=coord_index
                )

                # Create shape representation
                shape_representation = ifc_file.createIfcShapeRepresentation(
                    ContextOfItems=body_context,
                    RepresentationIdentifier="Body",
                    RepresentationType="Tessellation",
                    Items=[triangulated_face_set]
                )

                # Create product definition shape
                product_shape = ifc_file.createIfcProductDefinitionShape(
                    Representations=[shape_representation]
                )

                # Assign shape to element
                element.Representation = product_shape

                success_count += 1

            except Exception as e:
                fail_count += 1
                if fail_count <= 5:  # Only show first 5 errors
                    print(f"  Warning: Failed to create element {elem_data.get('guid', 'unknown')}: {e}")
                continue

        # Write IFC file
        ifc_file.write(str(self.output_ifc_path))
        print(f"\n✓ IFC file created: {self.output_ifc_path}")
        print(f"  Successfully created: {success_count} elements")
        print(f"  Failed: {fail_count} elements")

    def process(self):
        """Main processing pipeline."""
        print("=" * 80)
        print("Mesh Simplifier & IFC Recreator")
        print("=" * 80)
        print(f"Input JSON: {self.json_path}")
        print(f"Output IFC: {self.output_ifc_path}")
        print(f"Target triangles: {self.target_triangles} per element")
        print(f"Method: {self.simplification_method}")
        print()

        start_time = time.time()

        # Load data
        data = self.load_json()

        # Simplify all meshes
        print(f"\nSimplifying {len(data['elements'])} elements...")
        simplified_elements = []

        for elem in tqdm(data['elements'], desc="Simplifying meshes"):
            # Get geometry
            vertices = np.array(elem['vertices'])
            faces = np.array(elem['faces'])

            # Track original stats
            self.stats["original_vertices"] += len(vertices)
            self.stats["original_triangles"] += len(faces)

            # Simplify
            result = self.simplify_mesh(vertices, faces)

            if result is None:
                self.stats["failed_elements"] += 1
                continue

            simp_verts, simp_faces = result

            # Track simplified stats
            self.stats["simplified_vertices"] += len(simp_verts)
            self.stats["simplified_triangles"] += len(simp_faces)
            self.stats["elements_processed"] += 1

            # Store
            simplified_elements.append({
                'guid': elem['guid'],
                'type': elem['type'],
                'vertices': simp_verts,
                'faces': simp_faces
            })

        # Save simplified JSON
        simplified_json_path = self.output_ifc_path.with_suffix('.json')
        print(f"\nSaving simplified JSON: {simplified_json_path.name}...")
        with open(simplified_json_path, 'w') as f:
            json.dump({
                'source': data.get('source_file', 'unknown'),
                'simplified': True,
                'target_triangles': self.target_triangles,
                'element_count': len(simplified_elements),
                'elements': [
                    {
                        'guid': e['guid'],
                        'type': e['type'],
                        'vertices': e['vertices'].tolist(),
                        'faces': e['faces'].tolist()
                    }
                    for e in simplified_elements
                ]
            }, f, indent=2)
        print(f"✓ Saved: {simplified_json_path}")

        # Calculate file sizes
        json_size_mb = self.json_path.stat().st_size / (1024 * 1024)
        simplified_size_mb = simplified_json_path.stat().st_size / (1024 * 1024)

        # Create IFC file from simplified geometry
        self.create_ifc_file(simplified_elements)

        # Print statistics
        elapsed = time.time() - start_time

        print("\n" + "=" * 80)
        print("PROCESSING COMPLETE")
        print("=" * 80)
        print(f"Elements processed: {self.stats['elements_processed']}")
        print(f"Failed: {self.stats['failed_elements']}")
        print(f"\nGeometry reduction:")
        print(f"  Vertices: {self.stats['original_vertices']:,} → {self.stats['simplified_vertices']:,} "
              f"({100 * self.stats['simplified_vertices'] / self.stats['original_vertices']:.1f}%)")
        print(f"  Triangles: {self.stats['original_triangles']:,} → {self.stats['simplified_triangles']:,} "
              f"({100 * self.stats['simplified_triangles'] / self.stats['original_triangles']:.1f}%)")
        print(f"\nFile size:")
        print(f"  Original JSON: {json_size_mb:.1f} MB")
        print(f"  Simplified JSON: {simplified_size_mb:.1f} MB ({100 * simplified_size_mb / json_size_mb:.1f}%)")
        print(f"\nProcessing time: {elapsed:.1f}s")
        print(f"\nOutputs created:")
        print(f"  - {simplified_json_path} (simplified geometry)")
        print(f"  - {self.output_ifc_path} (IFC4 file)")
        print("=" * 80)


def main():
    """Entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Simplify meshes and recreate IFC")
    parser.add_argument("json_path", help="Path to extracted JSON geometry")
    parser.add_argument("--output", "-o", default="simplified.ifc", help="Output IFC path")
    parser.add_argument("--triangles", "-t", type=int, default=1000, help="Target triangles per element")
    parser.add_argument("--method", "-m", choices=["quadric", "cluster", "convex_hull"],
                        default="quadric", help="Simplification method")

    args = parser.parse_args()

    simplifier = MeshSimplifier(
        json_path=args.json_path,
        output_ifc_path=args.output,
        target_triangles=args.triangles,
        simplification_method=args.method
    )

    simplifier.process()


if __name__ == "__main__":
    main()
