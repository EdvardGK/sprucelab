"""
IFC Loader Service - Handles loading, caching, and querying IFC files.

Design decisions:
- Files are loaded into memory and cached by file_id
- file_id is a hash of the file path/URL for consistency
- Redis stores file_id -> file_path mapping for TTL management
- In-memory dict stores actual ifcopenshell.file objects

This approach balances:
- Speed: IFC files stay in memory for fast queries
- Scalability: Can be extended to use shared memory or distributed cache
- Simplicity: No complex serialization of IFC objects
"""

import hashlib
import os
import tempfile
from typing import Dict, List, Any, Optional, Tuple
import httpx
import numpy as np

import ifcopenshell
import ifcopenshell.geom

from config import settings


class IFCLoaderService:
    """
    Service for loading and managing IFC files.

    Usage:
        loader = IFCLoaderService()
        file_id, ifc_file = await loader.load_from_upload(uploaded_file_content)
        elements = loader.get_elements(file_id, ifc_type="IfcWall")
    """

    def __init__(self):
        # In-memory cache of loaded IFC files
        # Key: file_id, Value: ifcopenshell.file
        self._cache: Dict[str, ifcopenshell.file] = {}

        # Track file paths for cleanup
        self._temp_files: Dict[str, str] = {}

    def _generate_file_id(self, content_hash: str) -> str:
        """Generate a unique file ID from content hash."""
        return hashlib.sha256(content_hash.encode()).hexdigest()[:16]

    async def load_from_bytes(self, content: bytes, filename: str = "upload.ifc") -> Tuple[str, ifcopenshell.file]:
        """
        Load IFC from uploaded bytes.

        Returns:
            (file_id, ifc_file) tuple
        """
        # Generate file_id from content hash
        content_hash = hashlib.md5(content).hexdigest()
        file_id = self._generate_file_id(content_hash)

        # Check if already cached
        if file_id in self._cache:
            return file_id, self._cache[file_id]

        # Write to temp file (ifcopenshell needs a file path)
        temp_path = os.path.join(settings.TEMP_DIR, f"{file_id}_{filename}")
        with open(temp_path, "wb") as f:
            f.write(content)

        # Load with ifcopenshell
        try:
            ifc_file = ifcopenshell.open(temp_path)
            self._cache[file_id] = ifc_file
            self._temp_files[file_id] = temp_path
            return file_id, ifc_file
        except Exception as e:
            # Clean up on failure
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise ValueError(f"Failed to load IFC file: {str(e)}")

    async def load_from_path(self, file_path: str) -> Tuple[str, ifcopenshell.file]:
        """
        Load IFC from local file path.

        Returns:
            (file_id, ifc_file) tuple
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"IFC file not found: {file_path}")

        # Generate file_id from path + mtime
        stat = os.stat(file_path)
        content_hash = f"{file_path}:{stat.st_mtime}:{stat.st_size}"
        file_id = self._generate_file_id(content_hash)

        # Check if already cached
        if file_id in self._cache:
            return file_id, self._cache[file_id]

        # Load with ifcopenshell
        ifc_file = ifcopenshell.open(file_path)
        self._cache[file_id] = ifc_file

        return file_id, ifc_file

    async def load_from_url(self, url: str) -> Tuple[str, ifcopenshell.file]:
        """
        Download and load IFC from URL.

        Returns:
            (file_id, ifc_file) tuple
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=300.0)  # 5 min timeout
            response.raise_for_status()

            filename = url.split("/")[-1] or "download.ifc"
            return await self.load_from_bytes(response.content, filename)

    def get_file(self, file_id: str) -> Optional[ifcopenshell.file]:
        """Get cached IFC file by ID."""
        return self._cache.get(file_id)

    def get_file_info(self, file_id: str) -> Dict[str, Any]:
        """Get basic info about a loaded file."""
        ifc_file = self._cache.get(file_id)
        if not ifc_file:
            raise ValueError(f"File {file_id} not loaded")

        # Count elements by category
        elements = list(ifc_file.by_type("IfcElement"))
        types = list(ifc_file.by_type("IfcTypeObject"))
        # IFC4 uses IfcSpatialElement, IFC2X3 uses IfcSpatialStructureElement
        try:
            spatials = list(ifc_file.by_type("IfcSpatialElement"))
        except RuntimeError:
            spatials = list(ifc_file.by_type("IfcSpatialStructureElement"))

        # Get file size if we have the path
        file_size_mb = 0.0
        if file_id in self._temp_files:
            file_size_mb = os.path.getsize(self._temp_files[file_id]) / (1024 * 1024)

        return {
            "file_id": file_id,
            "ifc_schema": ifc_file.schema,
            "element_count": len(elements),
            "type_count": len(types),
            "spatial_elements": len(spatials),
            "file_size_mb": round(file_size_mb, 2),
        }

    def get_elements(
        self,
        file_id: str,
        ifc_type: Optional[str] = None,
        offset: int = 0,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get elements from a loaded file.

        Args:
            file_id: ID of loaded file
            ifc_type: Filter by IFC type (e.g., "IfcWall")
            offset: Pagination offset
            limit: Max elements to return

        Returns:
            (elements_list, total_count) tuple
        """
        ifc_file = self._cache.get(file_id)
        if not ifc_file:
            raise ValueError(f"File {file_id} not loaded")

        # Query elements
        if ifc_type:
            all_elements = list(ifc_file.by_type(ifc_type))
        else:
            all_elements = list(ifc_file.by_type("IfcElement"))

        total = len(all_elements)

        # Paginate
        elements = all_elements[offset : offset + limit]

        # Convert to dicts
        result = []
        for elem in elements:
            storey = self._get_element_storey(elem)
            result.append({
                "guid": elem.GlobalId,
                "ifc_type": elem.is_a(),
                "name": elem.Name,
                "storey": storey,
            })

        return result, total

    def get_element_detail(self, file_id: str, guid: str) -> Dict[str, Any]:
        """Get detailed info about a single element including all properties."""
        ifc_file = self._cache.get(file_id)
        if not ifc_file:
            raise ValueError(f"File {file_id} not loaded")

        try:
            element = ifc_file.by_guid(guid)
        except RuntimeError:
            raise ValueError(f"Element with GUID {guid} not found")

        # Extract properties
        properties = self._extract_properties(element)

        # Extract quantities
        quantities = self._extract_quantities(element)

        # Extract materials
        materials = self._extract_materials(element)

        # Get type name
        type_name = self._get_type_name(element)

        # Get storey
        storey = self._get_element_storey(element)

        return {
            "guid": element.GlobalId,
            "ifc_type": element.is_a(),
            "name": element.Name,
            "description": getattr(element, "Description", None),
            "object_type": getattr(element, "ObjectType", None),
            "storey": storey,
            "properties": properties,
            "quantities": quantities,
            "materials": materials,
            "type_name": type_name,
        }

    def _extract_properties(self, element) -> Dict[str, Dict[str, Any]]:
        """Extract all property sets and their properties from an element."""
        properties = {}

        if not hasattr(element, "IsDefinedBy"):
            return properties

        for definition in element.IsDefinedBy:
            if not definition.is_a("IfcRelDefinesByProperties"):
                continue

            pset = definition.RelatingPropertyDefinition

            if pset.is_a("IfcPropertySet"):
                pset_props = {}
                for prop in pset.HasProperties:
                    if prop.is_a("IfcPropertySingleValue"):
                        value = None
                        if prop.NominalValue:
                            value = prop.NominalValue.wrappedValue
                        pset_props[prop.Name] = value
                    elif prop.is_a("IfcPropertyEnumeratedValue"):
                        values = []
                        if prop.EnumerationValues:
                            values = [v.wrappedValue for v in prop.EnumerationValues]
                        pset_props[prop.Name] = values
                properties[pset.Name] = pset_props

        return properties

    def _extract_quantities(self, element) -> Dict[str, Any]:
        """Extract quantities (Qto_*) from an element."""
        quantities = {}

        if not hasattr(element, "IsDefinedBy"):
            return quantities

        for definition in element.IsDefinedBy:
            if not definition.is_a("IfcRelDefinesByProperties"):
                continue

            pset = definition.RelatingPropertyDefinition

            if pset.is_a("IfcElementQuantity"):
                for qty in pset.Quantities:
                    if qty.is_a("IfcQuantityArea"):
                        quantities[qty.Name] = {"value": qty.AreaValue, "unit": "m2"}
                    elif qty.is_a("IfcQuantityVolume"):
                        quantities[qty.Name] = {"value": qty.VolumeValue, "unit": "m3"}
                    elif qty.is_a("IfcQuantityLength"):
                        quantities[qty.Name] = {"value": qty.LengthValue, "unit": "m"}
                    elif qty.is_a("IfcQuantityCount"):
                        quantities[qty.Name] = {"value": qty.CountValue, "unit": "count"}

        return quantities

    def _extract_materials(self, element) -> List[str]:
        """Extract material names from an element."""
        materials = []

        if not hasattr(element, "HasAssociations"):
            return materials

        for assoc in element.HasAssociations:
            if assoc.is_a("IfcRelAssociatesMaterial"):
                material = assoc.RelatingMaterial

                if material.is_a("IfcMaterial"):
                    materials.append(material.Name)
                elif material.is_a("IfcMaterialLayerSetUsage"):
                    for layer in material.ForLayerSet.MaterialLayers:
                        if layer.Material:
                            materials.append(layer.Material.Name)
                elif material.is_a("IfcMaterialLayerSet"):
                    for layer in material.MaterialLayers:
                        if layer.Material:
                            materials.append(layer.Material.Name)

        return materials

    def _get_type_name(self, element) -> Optional[str]:
        """Get the type object name for an element."""
        if not hasattr(element, "IsTypedBy"):
            return None

        for rel in element.IsTypedBy:
            if rel.RelatingType:
                return rel.RelatingType.Name

        return None

    def _get_element_storey(self, element) -> Optional[str]:
        """Get the building storey name for an element."""
        if not hasattr(element, "ContainedInStructure"):
            return None

        for rel in element.ContainedInStructure:
            if rel.RelatingStructure and rel.RelatingStructure.is_a("IfcBuildingStorey"):
                return rel.RelatingStructure.Name

        return None

    def get_element_by_express_id(self, file_id: str, express_id: int) -> Dict[str, Any]:
        """Get detailed info about a single element by Express ID (step_id)."""
        ifc_file = self._cache.get(file_id)
        if not ifc_file:
            raise ValueError(f"File {file_id} not loaded")

        try:
            element = ifc_file.by_id(express_id)
        except RuntimeError:
            raise ValueError(f"Element with Express ID {express_id} not found")

        # Verify it's an element (not a relationship or other entity)
        if not hasattr(element, "GlobalId"):
            raise ValueError(f"Entity {express_id} is not an IFC element")

        # Extract properties
        properties = self._extract_properties(element)

        # Extract quantities
        quantities = self._extract_quantities(element)

        # Extract materials
        materials = self._extract_materials(element)

        # Get type name
        type_name = self._get_type_name(element)

        # Get storey
        storey = self._get_element_storey(element)

        return {
            "guid": element.GlobalId,
            "ifc_type": element.is_a(),
            "name": element.Name,
            "description": getattr(element, "Description", None),
            "object_type": getattr(element, "ObjectType", None),
            "storey": storey,
            "properties": properties,
            "quantities": quantities,
            "materials": materials,
            "type_name": type_name,
            "express_id": express_id,
        }

    def get_element_geometry(self, file_id: str, guid: str) -> Dict[str, Any]:
        """
        Extract mesh geometry (vertices, faces) for a single element.

        Uses ifcopenshell.geom to create shape and extract triangulated mesh.
        Returns world coordinates.

        For aggregate elements (IfcCurtainWall, IfcStair, etc.), combines geometry
        from all decomposed children.

        Args:
            file_id: ID of loaded file
            guid: Element GUID

        Returns:
            Dict with vertices, faces, and element info
        """
        ifc_file = self._cache.get(file_id)
        if not ifc_file:
            raise ValueError(f"File {file_id} not loaded")

        try:
            element = ifc_file.by_guid(guid)
        except RuntimeError:
            raise ValueError(f"Element with GUID {guid} not found")

        # Configure geometry settings
        settings = ifcopenshell.geom.settings()
        settings.set(settings.USE_WORLD_COORDS, True)
        settings.set(settings.WELD_VERTICES, True)

        all_verts = []
        all_faces = []
        vertex_offset = 0

        def extract_geometry(elem):
            """Extract geometry from a single element."""
            nonlocal vertex_offset
            try:
                shape = ifcopenshell.geom.create_shape(settings, elem)
                geometry = shape.geometry

                verts = np.array(geometry.verts).reshape(-1, 3)
                faces = np.array(geometry.faces).reshape(-1, 3)

                if len(verts) > 0:
                    all_verts.append(verts)
                    # Offset face indices for combined mesh
                    all_faces.append(faces + vertex_offset)
                    vertex_offset += len(verts)
                    return True
            except Exception:
                pass
            return False

        # Try direct geometry first
        has_direct_geom = extract_geometry(element)

        # If no direct geometry, try decomposed children
        # (common for IfcCurtainWall, IfcStair, IfcRoof, etc.)
        if not has_direct_geom:
            # Check for IsDecomposedBy relationship
            if hasattr(element, 'IsDecomposedBy'):
                for rel in element.IsDecomposedBy:
                    for child in rel.RelatedObjects:
                        extract_geometry(child)

            # Also check for HasOpenings (voids)
            # and ContainsElements for spatial elements

        if not all_verts:
            raise ValueError(
                f"No geometry for {element.is_a()} '{element.Name or guid}'. "
                f"Element may be abstract or geometry is in child elements."
            )

        # Combine all vertices and faces
        combined_verts = np.vstack(all_verts)
        combined_faces = np.vstack(all_faces)

        return {
            "guid": element.GlobalId,
            "ifc_type": element.is_a(),
            "name": element.Name,
            "vertices": combined_verts.tolist(),
            "faces": combined_faces.astype(int).tolist(),
            "vertex_count": len(combined_verts),
            "face_count": len(combined_faces),
        }

    def unload_file(self, file_id: str) -> bool:
        """Unload a file from cache and clean up temp files."""
        if file_id not in self._cache:
            return False

        # Remove from cache
        del self._cache[file_id]

        # Clean up temp file
        if file_id in self._temp_files:
            temp_path = self._temp_files.pop(file_id)
            if os.path.exists(temp_path):
                os.unlink(temp_path)

        return True

    def get_loaded_files(self) -> List[str]:
        """Get list of currently loaded file IDs."""
        return list(self._cache.keys())


# Singleton instance
ifc_loader = IFCLoaderService()
