"""
Convert IFC model to point cloud using ITO takeoff data.

This script:
1. Reads the ITO Excel file with element GUIDs and coordinates
2. Opens the IFC file
3. Extracts bounding boxes for each element
4. Generates point cloud from bounding boxes
5. Exports as LAZ with proper georeferencing

The point cloud will have the same coordinate system as the IFC model.
"""

import pandas as pd
import ifcopenshell
import ifcopenshell.geom
import numpy as np
import open3d as o3d
import laspy
from pathlib import Path
from typing import Optional, Tuple, List
from tqdm import tqdm


class IFCToPointCloud:
    """Convert IFC elements to point cloud using ITO data."""

    def __init__(
        self,
        ito_excel_path: str,
        ifc_path: str,
        output_dir: str,
        points_per_element: int = 1000
    ):
        """
        Initialize converter.

        Args:
            ito_excel_path: Path to ITO Excel file
            ifc_path: Path to IFC file
            output_dir: Output directory
            points_per_element: Number of points to sample per element surface
        """
        self.ito_path = Path(ito_excel_path)
        self.ifc_path = Path(ifc_path)
        self.output_dir = Path(output_dir)
        self.points_per_element = points_per_element

        self.output_dir.mkdir(parents=True, exist_ok=True)

    def load_ito_data(self) -> pd.DataFrame:
        """Load ITO Excel data."""
        print(f"Loading ITO data from {self.ito_path.name}...")
        df = pd.read_excel(self.ito_path)

        # Expected columns: Type, Model, GUID, Component, Global X, Global Y, Global Z, Count, Color
        required_cols = ["GUID", "Global X", "Global Y", "Global Z"]

        for col in required_cols:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")

        # Filter out rows with missing GUIDs or coordinates
        df = df.dropna(subset=required_cols)

        print(f"✓ Loaded {len(df)} elements from ITO")
        return df

    def load_ifc_file(self) -> ifcopenshell.file:
        """Load IFC file."""
        print(f"Loading IFC file: {self.ifc_path.name}...")
        ifc = ifcopenshell.open(self.ifc_path)
        print(f"✓ IFC loaded: {ifc.schema} schema")
        return ifc

    def get_element_mesh(
        self,
        ifc_file: ifcopenshell.file,
        guid: str
    ) -> Optional[Tuple[np.ndarray, np.ndarray]]:
        """
        Get actual mesh geometry for an IFC element by GUID.

        Args:
            ifc_file: IFC file object
            guid: Element GUID

        Returns:
            Tuple of (vertices, faces) as numpy arrays, or None if failed
        """
        try:
            # Get element by GUID
            element = ifc_file.by_guid(guid)

            # Create geometry settings
            settings = ifcopenshell.geom.settings()
            settings.set(settings.USE_WORLD_COORDS, True)

            # Get shape
            shape = ifcopenshell.geom.create_shape(settings, element)

            # Get geometry
            geometry = shape.geometry
            verts = geometry.verts
            faces = geometry.faces

            # Reshape vertices (flat list to Nx3 array)
            verts = np.array(verts).reshape(-1, 3)

            # Reshape faces (flat list to Nx3 array for triangles)
            faces = np.array(faces).reshape(-1, 3)

            return verts, faces

        except Exception as e:
            print(f"  Warning: Could not get geometry for {guid}: {e}")
            return None

    def sample_mesh_surface(
        self,
        vertices: np.ndarray,
        faces: np.ndarray,
        n_points: int = None
    ) -> np.ndarray:
        """
        Sample points uniformly on mesh surface.

        Args:
            vertices: Mesh vertices (N, 3)
            faces: Mesh faces (M, 3) as vertex indices
            n_points: Number of points to sample (if None, uses self.points_per_element)

        Returns:
            Array of sampled points (K, 3)
        """
        if n_points is None:
            n_points = self.points_per_element

        # Create Open3D mesh
        mesh = o3d.geometry.TriangleMesh()
        mesh.vertices = o3d.utility.Vector3dVector(vertices)
        mesh.triangles = o3d.utility.Vector3iVector(faces)

        # Sample points on surface
        pcd = mesh.sample_points_uniformly(number_of_points=n_points)

        return np.asarray(pcd.points)

    def create_fallback_bbox(
        self,
        center_x: float,
        center_y: float,
        center_z: float,
        default_size: float = 500.0  # mm
    ) -> np.ndarray:
        """
        Create a default bounding box around a center point.
        Used when IFC geometry extraction fails.

        Args:
            center_x, center_y, center_z: Center coordinates
            default_size: Size of the box in each dimension

        Returns:
            Array of points
        """
        half_size = default_size / 2
        min_corner = np.array([
            center_x - half_size,
            center_y - half_size,
            center_z - half_size
        ])
        max_corner = np.array([
            center_x + half_size,
            center_y + half_size,
            center_z + half_size
        ])

        return self.create_bbox_points(min_corner, max_corner)

    def process(self):
        """Main processing pipeline."""
        print("=" * 80)
        print("IFC to Point Cloud Converter (from ITO)")
        print("=" * 80)
        print(f"Sampling actual mesh surfaces")
        print(f"Points per element: {self.points_per_element}")
        print()

        # Load data
        df = self.load_ito_data()
        ifc_file = self.load_ifc_file()

        # Process elements
        all_points = []
        successful = 0
        fallback = 0
        failed = 0

        print(f"\nProcessing {len(df)} elements...")

        for idx, row in tqdm(df.iterrows(), total=len(df), desc="Converting elements"):
            guid = row["GUID"]
            center_x = row["Global X"]
            center_y = row["Global Y"]
            center_z = row["Global Z"]

            # Try to get actual mesh geometry from IFC
            mesh_data = self.get_element_mesh(ifc_file, guid)

            if mesh_data is not None:
                vertices, faces = mesh_data
                # Sample points on actual surface
                points = self.sample_mesh_surface(vertices, faces)
                successful += 1
            else:
                # Fallback: use ITO coordinates with default box
                points = self.create_fallback_bbox(center_x, center_y, center_z)
                fallback += 1

            all_points.append(points)

        # Combine all points
        if not all_points:
            print("Error: No points generated!")
            return

        print("\nCombining points...")
        all_points = np.vstack(all_points)
        print(f"✓ Total points: {len(all_points):,}")

        # Create Open3D point cloud
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(all_points)

        # Add uniform color (can be modified to use ITO color data)
        colors = np.ones_like(all_points) * [0.7, 0.7, 0.7]  # Gray
        pcd.colors = o3d.utility.Vector3dVector(colors)

        # Save outputs
        print("\nSaving outputs...")

        # Save as PLY (Open3D native)
        ply_path = self.output_dir / "ifc_pointcloud.ply"
        o3d.io.write_point_cloud(str(ply_path), pcd, write_ascii=False)
        print(f"✓ Saved PLY: {ply_path}")

        # Save as LAZ (compressed, industry standard)
        laz_path = self.output_dir / "ifc_pointcloud.laz"
        self.save_as_laz(all_points, colors, laz_path)
        print(f"✓ Saved LAZ: {laz_path}")

        # Save as XYZ (simple format)
        xyz_path = self.output_dir / "ifc_pointcloud.xyz"
        np.savetxt(xyz_path, all_points, fmt="%.3f %.3f %.3f")
        print(f"✓ Saved XYZ: {xyz_path}")

        # Summary
        print("\n" + "=" * 80)
        print("PROCESSING COMPLETE")
        print("=" * 80)
        print(f"Total elements: {len(df)}")
        print(f"Successful mesh extractions: {successful}")
        print(f"Fallback boxes: {fallback}")
        print(f"Total points generated: {len(all_points):,}")
        print(f"\nOutput directory: {self.output_dir}")

    def save_as_laz(
        self,
        points: np.ndarray,
        colors: np.ndarray,
        output_path: Path
    ):
        """
        Save point cloud as LAZ file.

        Args:
            points: Point coordinates (N, 3)
            colors: Point colors (N, 3) in range [0, 1]
            output_path: Output LAZ file path
        """
        try:
            # Create LAZ file
            header = laspy.LasHeader(point_format=3, version="1.4")
            header.offsets = points.min(axis=0)
            header.scales = [0.001, 0.001, 0.001]  # 1mm precision

            las = laspy.LasData(header)

            # Set coordinates
            las.x = points[:, 0]
            las.y = points[:, 1]
            las.z = points[:, 2]

            # Set colors (LAZ expects 0-65535 range)
            las.red = (colors[:, 0] * 65535).astype(np.uint16)
            las.green = (colors[:, 1] * 65535).astype(np.uint16)
            las.blue = (colors[:, 2] * 65535).astype(np.uint16)

            # Write file
            las.write(str(output_path))

        except Exception as e:
            print(f"Warning: Could not save LAZ file: {e}")


def main():
    """Entry point."""

    # Configuration
    ITO_EXCEL = r"C:\Users\edkjo\DC\ACCDocs\Skiplum AS\Skiplum Backup\Project Files\0011 - Sørkedalsveien 8\B_Leveranser\06_ITO\ITO_ARK_Plasstøpt betong.xlsx"
    IFC_FILE = r"C:\Users\edkjo\DC\ACCDocs\Skiplum AS\Skiplum Backup\Project Files\0011 - Sørkedalsveien 8\1. IFC\S8A_ARK.ifc"
    OUTPUT_DIR = r"C:\Users\edkjo\theSpruceForgeDevelopment\projects\active\punktysky-flyt\output"

    # Conversion mode
    POINTS_PER_ELEMENT = 1000  # Number of points to sample per element surface

    # Create converter and process
    converter = IFCToPointCloud(
        ito_excel_path=ITO_EXCEL,
        ifc_path=IFC_FILE,
        output_dir=OUTPUT_DIR,
        points_per_element=POINTS_PER_ELEMENT
    )

    converter.process()


if __name__ == "__main__":
    main()
