"""
Test if IfcMaterial entities have GlobalId attributes.

This script checks whether IfcMaterial (and other resource entities) have GlobalId
attributes in the IFC schema.
"""
import ifcopenshell
import tempfile
import os


def test_material_globalid():
    """Test if IfcMaterial has GlobalId."""

    # Create minimal IFC file with materials
    ifc_content = '''ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('test.ifc','2024-01-01T00:00:00',(''),(''),'IfcOpenShell','IfcOpenShell','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('3vB2YO$MX4xv5uCqZZG0Cv',$,'Test Project',$,$,$,$,$,$);
#2=IFCMATERIAL('Concrete',$,$);
#3=IFCMATERIAL('Steel',$,$);
#4=IFCWALL('0GOhM5DdX0FQkPPeVPcVCJ',$,'Test Wall',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;'''

    # Write to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.ifc', delete=False) as f:
        f.write(ifc_content)
        temp_path = f.name

    try:
        # Open IFC file
        ifc_file = ifcopenshell.open(temp_path)

        print("="*80)
        print("IFC Material GlobalId Test")
        print("="*80)
        print()

        # Test IfcMaterial
        print("Testing IfcMaterial:")
        print("-"*80)
        materials = ifc_file.by_type('IfcMaterial')

        if materials:
            for mat in materials:
                print(f"Material: {mat.Name}")
                print(f"  Entity type: {mat.is_a()}")
                print(f"  Has GlobalId attribute? {hasattr(mat, 'GlobalId')}")

                # Try to access GlobalId
                try:
                    global_id = mat.GlobalId
                    print(f"  GlobalId value: {global_id}")
                except AttributeError as e:
                    print(f"  GlobalId access failed: {e}")

                # Show step ID instead
                print(f"  IFC Step ID: {mat.id()}")

                # Show all attributes
                attrs = [attr for attr in dir(mat) if not attr.startswith('_') and not callable(getattr(mat, attr, None))]
                print(f"  Available attributes: {attrs}")
                print()
        else:
            print("  No materials found!")
            print()

        # Test IfcWall for comparison
        print("\nTesting IfcWall (for comparison):")
        print("-"*80)
        walls = ifc_file.by_type('IfcWall')

        if walls:
            for wall in walls:
                print(f"Wall: {wall.Name or 'Unnamed'}")
                print(f"  Entity type: {wall.is_a()}")
                print(f"  Has GlobalId attribute? {hasattr(wall, 'GlobalId')}")

                # Try to access GlobalId
                try:
                    global_id = wall.GlobalId
                    print(f"  GlobalId value: {global_id}")
                except AttributeError as e:
                    print(f"  GlobalId access failed: {e}")

                print(f"  IFC Step ID: {wall.id()}")
                print()

        # Test IfcProject for comparison
        print("\nTesting IfcProject (for comparison):")
        print("-"*80)
        projects = ifc_file.by_type('IfcProject')

        if projects:
            for proj in projects:
                print(f"Project: {proj.Name or 'Unnamed'}")
                print(f"  Entity type: {proj.is_a()}")
                print(f"  Has GlobalId attribute? {hasattr(proj, 'GlobalId')}")

                # Try to access GlobalId
                try:
                    global_id = proj.GlobalId
                    print(f"  GlobalId value: {global_id}")
                except AttributeError as e:
                    print(f"  GlobalId access failed: {e}")

                print(f"  IFC Step ID: {proj.id()}")
                print()

        print("="*80)
        print("Conclusion:")
        print("="*80)

        mat_has_guid = materials and hasattr(materials[0], 'GlobalId')
        wall_has_guid = walls and hasattr(walls[0], 'GlobalId')

        print(f"IfcMaterial has GlobalId: {mat_has_guid}")
        print(f"IfcWall has GlobalId: {wall_has_guid}")
        print()

        if not mat_has_guid:
            print("ℹ️  IfcMaterial does NOT inherit from IfcRoot, so it has no GlobalId.")
            print("   Use material.id() (IFC step ID) instead for unique identification.")
            print("   In our database, we should either:")
            print("   1. Store the step ID in material_guid, OR")
            print("   2. Use (model, name) as unique constraint")
        else:
            print("✓ IfcMaterial HAS GlobalId - our code should extract it!")

    finally:
        # Clean up
        if os.path.exists(temp_path):
            os.unlink(temp_path)


if __name__ == '__main__':
    test_material_globalid()
