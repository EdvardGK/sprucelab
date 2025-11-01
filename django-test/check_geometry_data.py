import os
import sys
import django

# Add backend directory to path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, backend_dir)

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.models.models import Model
from apps.entities.models import IFCEntity

# Get a ready model
model = Model.objects.filter(status='ready').first()

if not model:
    print("No ready models found!")
    sys.exit(1)

print(f"\n{'='*60}")
print(f"Model: {model.name} (v{model.version_number})")
print(f"Model ID: {model.id}")
print(f"Status: {model.status}")
print(f"Element count: {model.element_count}")
print(f"{'='*60}\n")

# Check entities with geometry
entities_with_geom = IFCEntity.objects.filter(model=model, has_geometry=True).select_related('geometry')
entities_without_geom = IFCEntity.objects.filter(model=model, has_geometry=False).count()

print(f"Entities with geometry: {entities_with_geom.count()}")
print(f"Entities without geometry: {entities_without_geom}")
print(f"\nSample entities with geometry:")
print(f"{'-'*60}")

for i, entity in enumerate(entities_with_geom[:15]):
    geom = entity.geometry
    has_verts = bool(geom.vertices_original or geom.vertices_simplified)
    has_faces = bool(geom.faces_original or geom.faces_simplified)

    print(f"{i+1}. {entity.ifc_type}: {entity.name or 'Unnamed'}")
    print(f"   GUID: {entity.ifc_guid}")
    print(f"   Vertices: {entity.vertex_count}, Triangles: {entity.triangle_count}")
    print(f"   Has vertex data: {has_verts}, Has face data: {has_faces}")

    if geom.vertices_original:
        print(f"   Vertex bytes: {len(geom.vertices_original)}")
    if geom.faces_original:
        print(f"   Face bytes: {len(geom.faces_original)}")
    print()

# Check if geometry bytes are actually stored
print(f"\n{'='*60}")
print("Checking actual geometry data storage:")
print(f"{'='*60}")

for i, entity in enumerate(entities_with_geom[:5]):
    geom = entity.geometry
    print(f"\n{i+1}. {entity.ifc_guid}")

    if geom.vertices_original:
        vertex_bytes = len(geom.vertices_original)
        expected_bytes = entity.vertex_count * 3 * 8  # 3 floats * 8 bytes each
        print(f"   Vertex bytes: {vertex_bytes} (expected: {expected_bytes})")
        print(f"   Match: {vertex_bytes == expected_bytes}")
    else:
        print(f"   No vertex data!")

    if geom.faces_original:
        face_bytes = len(geom.faces_original)
        expected_int32 = entity.triangle_count * 3 * 4
        expected_int64 = entity.triangle_count * 3 * 8
        print(f"   Face bytes: {face_bytes}")
        print(f"   Expected (int32): {expected_int32}")
        print(f"   Expected (int64): {expected_int64}")
        print(f"   Match int32: {face_bytes == expected_int32}")
        print(f"   Match int64: {face_bytes == expected_int64}")
    else:
        print(f"   No face data!")
