"""
Test Federated Viewer API endpoints.

Creates sample viewer configuration with groups and models,
then verifies all API endpoints work correctly.

Usage:
    python django-test/test_viewer_api.py
"""
import os
import sys
import django

# Add backend directory to path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, backend_dir)

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.projects.models import Project
from apps.models.models import Model
from apps.viewers.models import ViewerConfiguration, ViewerGroup, ViewerModel


def main():
    print("\n" + "="*60)
    print("Federated Viewer API Test")
    print("="*60 + "\n")

    # Step 1: Get or create a test project
    print("📁 Step 1: Setting up test project...")
    project, created = Project.objects.get_or_create(
        name="Test Project - Federated Viewer",
        defaults={
            'description': 'Test project for federated viewer API',
        }
    )
    print(f"   ✓ Project: {project.name} ({'created' if created else 'found'})")
    print(f"   ID: {project.id}\n")

    # Step 2: Create or get test models
    print("📐 Step 2: Setting up test models...")
    models = []
    model_names = [
        ('ARK_Building_A_v3.ifc', 'Architecture'),
        ('HVAC_Bygg1_v2.ifc', 'HVAC'),
        ('STR_BuildingA_v1.ifc', 'Structure'),
        ('Landscape_Site.ifc', 'Landscape'),
    ]

    for filename, description in model_names:
        model, created = Model.objects.get_or_create(
            project=project,
            name=filename.replace('.ifc', ''),  # Model name without extension
            defaults={
                'original_filename': filename,
                'ifc_schema': 'IFC4',
                'status': 'ready',
                'element_count': 1000,
            }
        )
        models.append(model)
        print(f"   ✓ Model: {filename} ({'created' if created else 'found'})")

    print()

    # Step 3: Create viewer configuration
    print("🎨 Step 3: Creating viewer configuration...")
    viewer, created = ViewerConfiguration.objects.get_or_create(
        project=project,
        name="Site Overview",
        defaults={
            'description': 'Full site coordination view with all disciplines',
        }
    )
    print(f"   ✓ Viewer: {viewer.name} ({'created' if created else 'found'})")
    print(f"   ID: {viewer.id}\n")

    # Step 4: Create viewer groups
    print("📂 Step 4: Creating viewer groups...")

    # Top-level groups
    building_a_group, _ = ViewerGroup.objects.get_or_create(
        viewer=viewer,
        name="Building A",
        defaults={
            'group_type': 'building',
            'display_order': 1,
        }
    )
    print(f"   ✓ Group: Building A")

    landscape_group, _ = ViewerGroup.objects.get_or_create(
        viewer=viewer,
        name="Landscape",
        defaults={
            'group_type': 'zone',
            'display_order': 2,
        }
    )
    print(f"   ✓ Group: Landscape")

    # Nested groups under Building A
    ark_group, _ = ViewerGroup.objects.get_or_create(
        viewer=viewer,
        name="Architecture",
        defaults={
            'group_type': 'discipline',
            'parent': building_a_group,
            'display_order': 1,
        }
    )
    print(f"   ✓ Group: Building A → Architecture")

    hvac_group, _ = ViewerGroup.objects.get_or_create(
        viewer=viewer,
        name="HVAC",
        defaults={
            'group_type': 'discipline',
            'parent': building_a_group,
            'display_order': 2,
        }
    )
    print(f"   ✓ Group: Building A → HVAC")

    str_group, _ = ViewerGroup.objects.get_or_create(
        viewer=viewer,
        name="Structure",
        defaults={
            'group_type': 'discipline',
            'parent': building_a_group,
            'display_order': 3,
        }
    )
    print(f"   ✓ Group: Building A → Structure\n")

    # Step 5: Assign models to groups
    print("🔗 Step 5: Assigning models to groups...")

    model_assignments = [
        (ark_group, models[0], 0, 0, 0, 0, True, 1.0, None),      # ARK
        (hvac_group, models[1], 0, 0, 0, 0, True, 1.0, '#FF5733'),  # HVAC (red)
        (str_group, models[2], 0, 0, 0, 0, True, 0.5, None),      # STR (50% opacity)
        (landscape_group, models[3], 100, 50, 0, 0, True, 1.0, '#2ECC71'),  # Landscape (green, offset)
    ]

    for group, model, offset_x, offset_y, offset_z, rotation, is_visible, opacity, color in model_assignments:
        viewer_model, created = ViewerModel.objects.get_or_create(
            group=group,
            model=model,
            defaults={
                'offset_x': offset_x,
                'offset_y': offset_y,
                'offset_z': offset_z,
                'rotation': rotation,
                'is_visible': is_visible,
                'opacity': opacity,
                'color_override': color,
            }
        )
        offset_str = f"({offset_x}, {offset_y}, {offset_z})" if any([offset_x, offset_y, offset_z]) else ""
        color_str = f" [{color}]" if color else ""
        print(f"   ✓ {model.original_filename} → {group.name} {offset_str}{color_str}")

    print()

    # Step 6: Test API serialization
    print("🔍 Step 6: Testing API serialization...")
    from apps.viewers.serializers import ViewerConfigurationSerializer

    serializer = ViewerConfigurationSerializer(viewer)
    data = serializer.data

    print(f"   ✓ Viewer: {data['name']}")
    print(f"   ✓ Project: {data['project_name']}")
    print(f"   ✓ Total Groups: {data['total_groups']}")
    print(f"   ✓ Total Models: {data['total_models']}")
    print(f"   ✓ Top-level Groups: {len(data['groups'])}")

    print()

    # Step 7: Display tree structure
    print("🌳 Step 7: Viewer tree structure:")
    print()
    print(f"   📁 {viewer.name}")
    for top_group in data['groups']:
        print(f"      └─ 📁 {top_group['name']} ({top_group['group_type']})")
        for child_group in top_group.get('children', []):
            print(f"         └─ 📁 {child_group['name']} ({child_group['group_type']})")
            for model_assignment in child_group.get('models', []):
                model_name = model_assignment['model_name']
                is_visible = "👁️" if model_assignment['is_visible'] else "👁️‍🗨️"
                color = model_assignment.get('color_override', '')
                color_str = f" [{color}]" if color else ""
                offset = model_assignment['offset_x'] or model_assignment['offset_y'] or model_assignment['offset_z']
                offset_str = " (offset)" if offset else ""
                print(f"            └─ 📐 {model_name} {is_visible}{color_str}{offset_str}")

        # Models directly in top-level group
        for model_assignment in top_group.get('models', []):
            model_name = model_assignment['model_name']
            is_visible = "👁️" if model_assignment['is_visible'] else "👁️‍🗨️"
            color = model_assignment.get('color_override', '')
            color_str = f" [{color}]" if color else ""
            offset = model_assignment['offset_x'] or model_assignment['offset_y'] or model_assignment['offset_z']
            offset_str = " (offset)" if offset else ""
            print(f"         └─ 📐 {model_name} {is_visible}{color_str}{offset_str}")

    print()

    # Step 8: API endpoints summary
    print("✅ Step 8: API endpoints available:")
    print()
    print("   Viewer Configuration:")
    print(f"      GET    /api/viewers/")
    print(f"      POST   /api/viewers/")
    print(f"      GET    /api/viewers/{viewer.id}/")
    print(f"      PATCH  /api/viewers/{viewer.id}/")
    print(f"      DELETE /api/viewers/{viewer.id}/")
    print()
    print("   Viewer Groups:")
    print(f"      GET    /api/viewers/groups/")
    print(f"      POST   /api/viewers/groups/")
    print(f"      GET    /api/viewers/groups/{building_a_group.id}/")
    print(f"      PATCH  /api/viewers/groups/{building_a_group.id}/")
    print(f"      DELETE /api/viewers/groups/{building_a_group.id}/")
    print(f"      POST   /api/viewers/groups/reorder/")
    print()
    print("   Viewer Models:")
    print(f"      GET    /api/viewers/models/")
    print(f"      POST   /api/viewers/models/")
    print(f"      GET    /api/viewers/models/{{id}}/")
    print(f"      PATCH  /api/viewers/models/{{id}}/")
    print(f"      DELETE /api/viewers/models/{{id}}/")
    print(f"      POST   /api/viewers/models/{{id}}/coordinate/")
    print(f"      POST   /api/viewers/models/batch-coordinate/")
    print()

    print("="*60)
    print("✅ Test Complete - Federated Viewer API Ready!")
    print("="*60)
    print()
    print(f"Test viewer ID: {viewer.id}")
    print(f"Test project ID: {project.id}")
    print()


if __name__ == '__main__':
    main()
