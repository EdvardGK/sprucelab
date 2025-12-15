"""
Quick script to convert simplified.json to IFC file.
"""

import json
import numpy as np
import ifcopenshell
import ifcopenshell.api
from pathlib import Path
from tqdm import tqdm


def json_to_ifc(json_path, output_ifc_path):
    """Convert simplified JSON to IFC file."""

    print(f"Loading {json_path}...")
    with open(json_path) as f:
        data = json.load(f)

    elements = data['elements']
    print(f"Loaded {len(elements)} elements")

    print(f"\nCreating IFC file...")

    # Create IFC file
    ifc_file = ifcopenshell.file(schema="IFC4")

    # Create project structure
    project = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcProject", name="Simplified Model")
    # Explicitly set units to meters (geometry is in meters from original IFC)
    ifcopenshell.api.run("unit.assign_unit", ifc_file, length={"is_metric": True, "raw": "METRE"})

    site = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcSite", name="Site")
    ifcopenshell.api.run("aggregate.assign_object", ifc_file, products=[site], relating_object=project)

    building = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcBuilding", name="Building")
    ifcopenshell.api.run("aggregate.assign_object", ifc_file, products=[building], relating_object=site)

    storey = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcBuildingStorey", name="Ground Floor")
    ifcopenshell.api.run("aggregate.assign_object", ifc_file, products=[storey], relating_object=building)

    # Create geometry context
    context = ifcopenshell.api.run("context.add_context", ifc_file, context_type="Model")
    body_context = ifcopenshell.api.run(
        "context.add_context",
        ifc_file,
        context_type="Model",
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=context
    )

    # Add elements
    print("Creating IFC elements...")
    success = 0
    failed = 0

    for elem_data in tqdm(elements):
        try:
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

            ifcopenshell.api.run("spatial.assign_container", ifc_file, products=[element], relating_structure=storey)

            # Get geometry
            vertices = np.array(elem_data['vertices'])
            faces = np.array(elem_data['faces'])

            # Create point list (convert to native Python types)
            point_list = ifc_file.createIfcCartesianPointList3D(
                vertices.tolist()  # Converts numpy arrays to native Python lists/floats
            )

            # Create face indices (1-based for IFC, ensure native Python ints)
            coord_index = [[int(f[0] + 1), int(f[1] + 1), int(f[2] + 1)] for f in faces]

            # Create triangulated face set
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

            element.Representation = product_shape
            success += 1

        except Exception as e:
            failed += 1
            if failed <= 5:
                print(f"\nWarning: Failed {elem_data.get('guid', 'unknown')}: {e}")

    # Write file
    print(f"\nWriting IFC file to {output_ifc_path}...")
    ifc_file.write(str(output_ifc_path))

    print("\n" + "=" * 80)
    print("IFC CREATION COMPLETE")
    print("=" * 80)
    print(f"Successfully created: {success} elements")
    print(f"Failed: {failed} elements")
    print(f"Output: {output_ifc_path}")
    print("=" * 80)


if __name__ == "__main__":
    # Convert the existing simplified.json
    json_to_ifc(
        "simplified.json",
        "LBK_RIV_C_simplified.ifc"
    )
