"""
Seed development database with test data.

Usage:
    python manage.py seed_dev_data
"""
from django.core.management.base import BaseCommand
from apps.projects.models import Project
from apps.models.models import Model
from apps.entities.models import IFCType, Material


class Command(BaseCommand):
    help = 'Seed local dev database with test project, models, types, and materials'

    def handle(self, *args, **options):
        self.stdout.write('Seeding development data...\n')

        # Project
        project, created = Project.objects.get_or_create(
            name='Dev Test Project',
            defaults={'description': 'Local development test project'},
        )
        self._report('Project', project.name, created)

        # Models
        models_data = [
            {
                'name': 'TestBuilding_ARK',
                'original_filename': 'TestBuilding_ARK_C.ifc',
                'ifc_schema': 'IFC4',
                'status': 'ready',
                'parsing_status': 'parsed',
                'element_count': 1200,
                'type_count': 45,
                'material_count': 12,
                'discipline': 'ARK',
            },
            {
                'name': 'TestBuilding_RIB',
                'original_filename': 'TestBuilding_RIB_C.ifc',
                'ifc_schema': 'IFC4',
                'status': 'ready',
                'parsing_status': 'parsed',
                'element_count': 800,
                'type_count': 30,
                'material_count': 8,
                'discipline': 'RIB',
            },
        ]

        created_models = []
        for data in models_data:
            name = data.pop('name')
            model, created = Model.objects.get_or_create(
                project=project,
                name=name,
                version_number=1,
                defaults=data,
            )
            created_models.append(model)
            self._report('Model', name, created)

        # Types for first model
        ark_model = created_models[0]
        types_data = [
            ('IfcWallType', 'Basic Wall:Exterior 300mm', 85, True),
            ('IfcWallType', 'Basic Wall:Interior 150mm', 120, True),
            ('IfcSlabType', 'Floor:Concrete 250mm', 45, True),
            ('IfcSlabType', 'Roof:Flat Insulated', 12, True),
            ('IfcDoorType', 'Single Flush:900x2100', 35, True),
            ('IfcWindowType', 'Fixed:1200x1500', 28, True),
            ('IfcColumnType', 'Concrete Column:400x400', 24, True),
            ('IfcBeamType', 'Steel Beam:HEB300', 18, False),
            ('IfcCurtainWallType', 'Curtain Wall:System 1', 8, True),
            ('IfcStairType', 'Stair:Concrete Prefab', 6, True),
        ]

        import hashlib
        for ifc_type, type_name, count, has_type_obj in types_data:
            guid = hashlib.md5(f"{ark_model.id}:{type_name}".encode()).hexdigest()[:22]
            _, created = IFCType.objects.get_or_create(
                model=ark_model,
                type_guid=guid,
                defaults={
                    'type_name': type_name,
                    'ifc_type': ifc_type,
                    'instance_count': count,
                    'has_ifc_type_object': has_type_obj,
                },
            )
            self._report('IFCType', f"{ifc_type}: {type_name}", created)

        # Materials for first model
        materials_data = [
            (1, 'Concrete/B35', 'CONCRETE'),
            (2, 'Steel/S355', 'STEEL'),
            (3, 'Insulation/Mineral Wool 200mm', 'INSULATION'),
            (4, 'Gypsum Board 12.5mm', 'FINISH'),
            (5, 'Timber/GL30c', 'WOOD'),
            (6, 'Glass/Triple Low-E', 'GLASS'),
        ]

        for mat_guid, name, category in materials_data:
            _, created = Material.objects.get_or_create(
                model=ark_model,
                material_guid=str(mat_guid),
                defaults={
                    'name': name,
                    'category': category,
                    'reused_status': 'new',
                },
            )
            self._report('Material', name, created)

        self.stdout.write(self.style.SUCCESS('\nDone.'))

    def _report(self, kind, name, created):
        if created:
            self.stdout.write(self.style.SUCCESS(f'  + {kind}: {name}'))
        else:
            self.stdout.write(f'  = {kind}: {name} (exists)')
