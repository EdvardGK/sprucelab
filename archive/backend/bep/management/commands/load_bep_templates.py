"""
Management command to load BEP templates.

Usage:
    python manage.py load_bep_templates
    python manage.py load_bep_templates --template=pofin
    python manage.py load_bep_templates --template=infrastructure
"""
from django.core.management.base import BaseCommand
from apps.bep.models import (
    BEPConfiguration,
    TechnicalRequirement,
    MMIScaleDefinition,
    NamingConvention,
    RequiredPropertySet,
    ValidationRule,
    SubmissionMilestone,
)
from apps.projects.models import Project
from datetime import date, timedelta


class Command(BaseCommand):
    help = 'Load BEP templates into the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--template',
            type=str,
            default='all',
            choices=['all', 'mmi-full', 'mmi-simple', 'pofin', 'infrastructure', 'iso19650'],
            help='Which template to load (default: all)',
        )
        parser.add_argument(
            '--project-id',
            type=str,
            help='Create BEP for specific project (optional)',
        )

    def handle(self, *args, **options):
        template_choice = options['template']
        project_id = options.get('project_id')

        # Get or create demo project if no project specified
        if project_id:
            try:
                project = Project.objects.get(id=project_id)
                self.stdout.write(f"Using project: {project.name}")
            except Project.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"Project {project_id} not found"))
                return
        else:
            project, created = Project.objects.get_or_create(
                name='Demo Project - BEP Templates',
                defaults={'description': 'Demo project with BEP templates loaded'}
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created demo project: {project.name}"))
            else:
                self.stdout.write(f"Using existing project: {project.name}")

        # Load templates
        if template_choice == 'all':
            self.load_mmi_veileder_full_template(project)
            self.load_mmi_veileder_simplified_template(project)
            self.load_pofin_template(project)
            self.load_infrastructure_template(project)
            self.load_iso19650_template(project)
        elif template_choice == 'mmi-full':
            self.load_mmi_veileder_full_template(project)
        elif template_choice == 'mmi-simple':
            self.load_mmi_veileder_simplified_template(project)
        elif template_choice == 'pofin':
            self.load_pofin_template(project)
        elif template_choice == 'infrastructure':
            self.load_infrastructure_template(project)
        elif template_choice == 'iso19650':
            self.load_iso19650_template(project)

        self.stdout.write(self.style.SUCCESS('✅ BEP templates loaded successfully'))

    def get_next_version(self, project):
        """Get the next available version number for a project."""
        last_bep = BEPConfiguration.objects.filter(project=project).order_by('-version').first()
        if last_bep:
            return last_bep.version + 1
        return 1

    def load_mmi_veileder_full_template(self, project):
        """Load official MMI-veileder 2.0 template with all 19 standard levels."""
        self.stdout.write('Loading MMI-veileder 2.0 - Full Scale template (19 levels)...')

        # Check if already exists
        if BEPConfiguration.objects.filter(
            project=project,
            framework='pofin',
            name__contains='MMI-veileder 2.0 - Full'
        ).exists():
            self.stdout.write(self.style.WARNING('  MMI-veileder Full template already exists, skipping'))
            return

        # Create BEP
        bep = BEPConfiguration.objects.create(
            project=project,
            version=self.get_next_version(project),
            status='draft',
            name='MMI-veileder 2.0 - Full Scale',
            description='Official Norwegian MMI-veileder 2.0 (October 2022) with all 19 standard levels',
            framework='pofin',
            created_by='System (Template)',
        )

        # Technical Requirements
        TechnicalRequirement.objects.create(
            bep=bep,
            ifc_schema='IFC4',
            model_view_definition='Design Transfer View',
            coordinate_system_name='EPSG:25833',
            coordinate_system_description='EUREF89 UTM33 (Norway)',
            length_unit='METRE',
            area_unit='SQUARE_METRE',
            volume_unit='CUBIC_METRE',
            geometry_tolerance=0.001,
            max_file_size_mb=500,
        )

        # All 19 official MMI levels from MMI-veileder 2.0 Table 1
        mmi_definitions = [
            {
                'mmi_level': 0,
                'name': 'Grunnlagsinformasjon',
                'name_en': 'Foundation information',
                'description': 'Existing information and data from clients or other sources',
                'color_hex': '#CCCCCC',
                'color_rgb': '204,204,204',
                'display_order': 1,
                'geometry_requirements': {'detail_level': 'none', 'requires_3d': False},
                'information_requirements': {'min_property_count': 0},
            },
            {
                'mmi_level': 100,
                'name': 'Konseptinformasjon',
                'name_en': 'Concept information',
                'description': 'Early phase sketch for evaluating alternatives (Established)',
                'color_hex': '#BE2823',
                'color_rgb': '190,40,35',
                'display_order': 2,
                'geometry_requirements': {'detail_level': 'symbolic', 'requires_3d': False},
                'information_requirements': {'min_property_count': 0},
            },
            {
                'mmi_level': 125,
                'name': 'Konseptinformasjon 125',
                'name_en': 'Concept information 125',
                'description': 'Concept phase with basic geometry (Controlled)',
                'color_hex': '#C54740',
                'color_rgb': '197,71,64',
                'display_order': 3,
                'geometry_requirements': {'detail_level': 'symbolic', 'requires_3d': True, 'min_vertex_count': 8},
                'information_requirements': {'requires_name': True, 'min_property_count': 2},
            },
            {
                'mmi_level': 150,
                'name': 'Konseptinformasjon 150',
                'name_en': 'Concept information 150',
                'description': 'Concept phase coordinated across disciplines (Selected)',
                'color_hex': '#D36957',
                'color_rgb': '211,105,87',
                'display_order': 4,
                'geometry_requirements': {'detail_level': 'symbolic', 'requires_3d': True, 'min_vertex_count': 12},
                'information_requirements': {'requires_name': True, 'requires_classification': True, 'min_property_count': 3},
            },
            {
                'mmi_level': 175,
                'name': 'Konseptinformasjon 175',
                'name_en': 'Concept information 175',
                'description': 'Concept phase approved for further development (Approved)',
                'color_hex': '#DD866D',
                'color_rgb': '221,134,109',
                'display_order': 5,
                'geometry_requirements': {'detail_level': 'approximate', 'requires_3d': True, 'min_vertex_count': 15},
                'information_requirements': {'requires_name': True, 'requires_classification': True, 'min_property_count': 5},
            },
            {
                'mmi_level': 200,
                'name': 'Forprosjektinformasjon',
                'name_en': 'Preliminary design information',
                'description': 'Early design information within individual disciplines (Established)',
                'color_hex': '#ED9D3D',
                'color_rgb': '237,157,61',
                'display_order': 6,
                'geometry_requirements': {'detail_level': 'approximate', 'requires_3d': True, 'min_vertex_count': 20},
                'information_requirements': {'requires_name': True, 'requires_classification': True, 'requires_material': True, 'min_property_count': 5},
            },
            {
                'mmi_level': 225,
                'name': 'Forprosjektinformasjon 225',
                'name_en': 'Preliminary design information 225',
                'description': 'Preliminary design with controlled quality (Controlled)',
                'color_hex': '#EFAD57',
                'color_rgb': '239,173,87',
                'display_order': 7,
                'geometry_requirements': {'detail_level': 'approximate', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 25},
                'information_requirements': {'requires_name': True, 'requires_classification': True, 'requires_material': True, 'min_property_count': 7},
            },
            {
                'mmi_level': 250,
                'name': 'Forprosjektinformasjon 250',
                'name_en': 'Preliminary design information 250',
                'description': 'Preliminary design coordinated across disciplines (Selected)',
                'color_hex': '#F0C26E',
                'color_rgb': '240,194,110',
                'display_order': 8,
                'geometry_requirements': {'detail_level': 'approximate', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 28},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'min_property_count': 8},
            },
            {
                'mmi_level': 275,
                'name': 'Forprosjektinformasjon 275',
                'name_en': 'Preliminary design information 275',
                'description': 'Preliminary design approved by client (Approved)',
                'color_hex': '#F4D586',
                'color_rgb': '244,213,134',
                'display_order': 9,
                'geometry_requirements': {'detail_level': 'detailed', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 30},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 10},
            },
            {
                'mmi_level': 300,
                'name': 'Detaljprosjektinformasjon',
                'name_en': 'Detailed design information',
                'description': 'Detailed design within individual disciplines (Established)',
                'color_hex': '#FCE74E',
                'color_rgb': '252,231,78',
                'display_order': 10,
                'geometry_requirements': {'detail_level': 'detailed', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 35},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 12},
            },
            {
                'mmi_level': 325,
                'name': 'Detaljprosjektinformasjon 325',
                'name_en': 'Detailed design information 325',
                'description': 'Detailed design with quality control (Controlled)',
                'color_hex': '#D2DD4E',
                'color_rgb': '210,221,78',
                'display_order': 11,
                'geometry_requirements': {'detail_level': 'detailed', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 40},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 13},
            },
            {
                'mmi_level': 350,
                'name': 'Detaljprosjektinformasjon 350',
                'name_en': 'Detailed design information 350',
                'description': 'Detailed design coordinated across all disciplines (Selected)',
                'color_hex': '#B0D34E',
                'color_rgb': '176,211,78',
                'display_order': 12,
                'geometry_requirements': {'detail_level': 'detailed', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 45},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 15},
            },
            {
                'mmi_level': 375,
                'name': 'Detaljprosjektinformasjon 375',
                'name_en': 'Detailed design information 375',
                'description': 'Detailed design approved by responsible designer (Approved)',
                'color_hex': '#89C84E',
                'color_rgb': '137,200,78',
                'display_order': 13,
                'geometry_requirements': {'detail_level': 'detailed', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 48},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 16},
            },
            {
                'mmi_level': 400,
                'name': 'Produksjonsinformasjon',
                'name_en': 'Production information',
                'description': 'Production-ready information, ready for construction (Established)',
                'color_hex': '#5DB94B',
                'color_rgb': '93,185,75',
                'display_order': 14,
                'geometry_requirements': {'detail_level': 'detailed', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 50},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 18},
            },
            {
                'mmi_level': 425,
                'name': 'Produksjonsinformasjon 425',
                'name_en': 'Production information 425',
                'description': 'Production information with quality control (Controlled)',
                'color_hex': '#48A64B',
                'color_rgb': '72,166,75',
                'display_order': 15,
                'geometry_requirements': {'detail_level': 'as_built', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 55},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 19},
            },
            {
                'mmi_level': 450,
                'name': 'Produksjonsinformasjon 450',
                'name_en': 'Production information 450',
                'description': 'Production information verified on-site (Selected)',
                'color_hex': '#2D944B',
                'color_rgb': '45,148,75',
                'display_order': 16,
                'geometry_requirements': {'detail_level': 'as_built', 'requires_3d': True, 'min_vertex_count': 60},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 20},
            },
            {
                'mmi_level': 475,
                'name': 'Produksjonsinformasjon 475',
                'name_en': 'Production information 475',
                'description': 'Production information approved by contractor (Approved)',
                'color_hex': '#007F4A',
                'color_rgb': '0,127,74',
                'display_order': 17,
                'geometry_requirements': {'detail_level': 'as_built', 'requires_3d': True, 'min_vertex_count': 65},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 22},
            },
            {
                'mmi_level': 500,
                'name': 'Driftsinformasjon',
                'name_en': 'As-built / Operation information',
                'description': 'As-built model verified and ready for operations (Established)',
                'color_hex': '#004C41',
                'color_rgb': '0,76,65',
                'display_order': 18,
                'geometry_requirements': {'detail_level': 'as_built', 'requires_3d': True, 'min_vertex_count': 50},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 25},
            },
            {
                'mmi_level': 600,
                'name': 'Forvaltningsinformasjon',
                'name_en': 'Facility management information',
                'description': 'Facility management and lifecycle data (Controlled)',
                'color_hex': '#003D52',
                'color_rgb': '0,61,82',
                'display_order': 19,
                'geometry_requirements': {'detail_level': 'as_built', 'requires_3d': True, 'min_vertex_count': 50},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 30},
            },
        ]

        for mmi_def in mmi_definitions:
            MMIScaleDefinition.objects.create(bep=bep, **mmi_def)

        self.stdout.write(self.style.SUCCESS(f'  ✅ Created MMI-veileder Full template with 19 levels (BEP ID: {bep.id})'))

    def load_mmi_veileder_simplified_template(self, project):
        """Load simplified MMI-veileder 2.0 template with 6 primary levels."""
        self.stdout.write('Loading MMI-veileder 2.0 - Simplified Scale template (6 levels)...')

        # Check if already exists
        if BEPConfiguration.objects.filter(
            project=project,
            framework='pofin',
            name__contains='MMI-veileder 2.0 - Simplified'
        ).exists():
            self.stdout.write(self.style.WARNING('  MMI-veileder Simplified template already exists, skipping'))
            return

        # Create BEP
        bep = BEPConfiguration.objects.create(
            project=project,
            version=self.get_next_version(project),
            status='draft',
            name='MMI-veileder 2.0 - Simplified',
            description='Simplified Norwegian MMI scale with 6 primary levels (100, 200, 300, 350, 400, 500)',
            framework='pofin',
            created_by='System (Template)',
        )

        # Technical Requirements
        TechnicalRequirement.objects.create(
            bep=bep,
            ifc_schema='IFC4',
            model_view_definition='Design Transfer View',
            coordinate_system_name='EPSG:25833',
            coordinate_system_description='EUREF89 UTM33 (Norway)',
            length_unit='METRE',
            area_unit='SQUARE_METRE',
            volume_unit='CUBIC_METRE',
            geometry_tolerance=0.001,
            max_file_size_mb=500,
        )

        # Simplified MMI scale: 6 primary levels only
        mmi_definitions = [
            {
                'mmi_level': 100,
                'name': 'Konseptinformasjon',
                'name_en': 'Concept information',
                'description': 'Early phase sketch for evaluating alternatives',
                'color_hex': '#BE2823',
                'color_rgb': '190,40,35',
                'display_order': 1,
                'geometry_requirements': {'detail_level': 'symbolic', 'requires_3d': False},
                'information_requirements': {'min_property_count': 0},
            },
            {
                'mmi_level': 200,
                'name': 'Forprosjektinformasjon',
                'name_en': 'Preliminary design information',
                'description': 'Early design information within individual disciplines',
                'color_hex': '#ED9D3D',
                'color_rgb': '237,157,61',
                'display_order': 2,
                'geometry_requirements': {'detail_level': 'approximate', 'requires_3d': True, 'min_vertex_count': 20},
                'information_requirements': {'requires_name': True, 'requires_classification': True, 'requires_material': True, 'min_property_count': 5},
            },
            {
                'mmi_level': 300,
                'name': 'Detaljprosjektinformasjon',
                'name_en': 'Detailed design information',
                'description': 'Detailed design within individual disciplines',
                'color_hex': '#FCE74E',
                'color_rgb': '252,231,78',
                'display_order': 3,
                'geometry_requirements': {'detail_level': 'detailed', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 35},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 12},
            },
            {
                'mmi_level': 350,
                'name': 'Detaljprosjektinformasjon 350',
                'name_en': 'Detailed design information 350',
                'description': 'Detailed design coordinated across all disciplines',
                'color_hex': '#B0D34E',
                'color_rgb': '176,211,78',
                'display_order': 4,
                'geometry_requirements': {'detail_level': 'detailed', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 45},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 15},
            },
            {
                'mmi_level': 400,
                'name': 'Produksjonsinformasjon',
                'name_en': 'Production information',
                'description': 'Production-ready information, ready for construction',
                'color_hex': '#5DB94B',
                'color_rgb': '93,185,75',
                'display_order': 5,
                'geometry_requirements': {'detail_level': 'detailed', 'requires_3d': True, 'collision_ready': True, 'min_vertex_count': 50},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 18},
            },
            {
                'mmi_level': 500,
                'name': 'Driftsinformasjon',
                'name_en': 'As-built / Operation information',
                'description': 'As-built model verified and ready for operations',
                'color_hex': '#004C41',
                'color_rgb': '0,76,65',
                'display_order': 6,
                'geometry_requirements': {'detail_level': 'as_built', 'requires_3d': True, 'min_vertex_count': 50},
                'information_requirements': {'requires_name': True, 'requires_description': True, 'requires_classification': True, 'requires_material': True, 'requires_system_membership': True, 'min_property_count': 25},
            },
        ]

        for mmi_def in mmi_definitions:
            MMIScaleDefinition.objects.create(bep=bep, **mmi_def)

        self.stdout.write(self.style.SUCCESS(f'  ✅ Created MMI-veileder Simplified template with 6 levels (BEP ID: {bep.id})'))

    def load_pofin_template(self, project):
        """Load POFIN (buildingSMART Norge) standard building template."""
        self.stdout.write('Loading POFIN Standard Building template...')

        # Check if already exists
        if BEPConfiguration.objects.filter(
            project=project,
            framework='pofin',
            name__contains='POFIN'
        ).exists():
            self.stdout.write(self.style.WARNING('  POFIN template already exists, skipping'))
            return

        # Create BEP
        bep = BEPConfiguration.objects.create(
            project=project,
            version=self.get_next_version(project),
            status='draft',
            name='POFIN Standard Building',
            description='buildingSMART Norway POFIN framework for standard buildings',
            framework='pofin',
            created_by='System (Template)',
        )

        # Technical Requirements
        TechnicalRequirement.objects.create(
            bep=bep,
            ifc_schema='IFC4',
            model_view_definition='Design Transfer View',
            coordinate_system_name='EPSG:25833',
            coordinate_system_description='EUREF89 UTM33 (Norway)',
            length_unit='METRE',
            area_unit='SQUARE_METRE',
            volume_unit='CUBIC_METRE',
            geometry_tolerance=0.001,
            max_file_size_mb=500,
        )

        # MMI Scale (Norwegian: 100, 300, 350, 400, 500)
        mmi_definitions = [
            {
                'mmi_level': 100,
                'name': 'Konseptfase',
                'description': 'Tidligfase skisse for vurdering av alternativer',
                'display_order': 1,
                'geometry_requirements': {
                    'detail_level': 'symbolic',
                    'requires_3d': False,
                    'min_vertex_count': 0,
                },
                'information_requirements': {
                    'requires_name': False,
                    'requires_description': False,
                    'requires_classification': False,
                    'requires_material': False,
                    'requires_system_membership': False,
                    'min_property_count': 0,
                },
            },
            {
                'mmi_level': 300,
                'name': 'Forprosjekt - Koordinert',
                'description': 'Koordinert innenfor fagene, klar for tverrfaglig kontroll',
                'display_order': 2,
                'geometry_requirements': {
                    'detail_level': 'approximate',
                    'requires_3d': True,
                    'collision_ready': True,
                    'min_vertex_count': 20,
                },
                'information_requirements': {
                    'requires_name': True,
                    'requires_description': False,
                    'requires_classification': True,
                    'requires_material': True,
                    'requires_system_membership': False,
                    'min_property_count': 5,
                },
            },
            {
                'mmi_level': 350,
                'name': 'Forprosjekt - Tverrfaglig koordinert',
                'description': 'Koordinert på tvers av fag gjennom iterativ prosess',
                'display_order': 3,
                'geometry_requirements': {
                    'detail_level': 'detailed',
                    'requires_3d': True,
                    'collision_ready': True,
                    'min_vertex_count': 30,
                },
                'information_requirements': {
                    'requires_name': True,
                    'requires_description': True,
                    'requires_classification': True,
                    'requires_material': True,
                    'requires_system_membership': True,
                    'min_property_count': 10,
                },
            },
            {
                'mmi_level': 400,
                'name': 'Detaljprosjekt - Klar for produksjon',
                'description': 'Tilbakemeldinger godkjent, klar for produksjon',
                'display_order': 4,
                'geometry_requirements': {
                    'detail_level': 'detailed',
                    'requires_3d': True,
                    'collision_ready': True,
                    'min_vertex_count': 50,
                },
                'information_requirements': {
                    'requires_name': True,
                    'requires_description': True,
                    'requires_classification': True,
                    'requires_material': True,
                    'requires_system_membership': True,
                    'min_property_count': 15,
                },
            },
            {
                'mmi_level': 500,
                'name': 'Utført modell (As-built)',
                'description': 'Oppdatert med virkelig geometri, tilleggsinformasjon for drift',
                'display_order': 5,
                'geometry_requirements': {
                    'detail_level': 'as_built',
                    'requires_3d': True,
                    'min_vertex_count': 50,
                },
                'information_requirements': {
                    'requires_name': True,
                    'requires_description': True,
                    'requires_classification': True,
                    'requires_material': True,
                    'requires_system_membership': True,
                    'min_property_count': 20,
                },
            },
        ]

        for mmi_def in mmi_definitions:
            MMIScaleDefinition.objects.create(bep=bep, **mmi_def)

        # Naming Conventions
        NamingConvention.objects.create(
            bep=bep,
            category='file_naming',
            name='IFC File Naming (POFIN)',
            description='Norwegian standard file naming: [Discipline]-[Number]_[Description].ifc',
            pattern=r'^[A-Z]{3,5}-\d{3}_[A-Za-z0-9_-]+\.ifc$',
            pattern_type='regex',
            examples=[
                'ARK-001_Building_A.ifc',
                'RIV-002_Foundation.ifc',
                'ELEKT-001_Power_Distribution.ifc',
                'VVS-001_HVAC_System.ifc',
            ],
            is_required=True,
            error_message='File name must follow pattern: [DISCIPLINE]-[NUMBER]_[DESCRIPTION].ifc',
        )

        NamingConvention.objects.create(
            bep=bep,
            category='classification',
            name='NS 3451 Classification',
            description='Norwegian classification system for building elements',
            pattern=r'^\d{2}\.\d{2}\.\d{2}$',
            pattern_type='regex',
            examples=['21.11.10', '23.13.21', '27.11.10'],
            is_required=True,
            error_message='Classification must follow NS 3451 format: XX.XX.XX',
        )

        # Required Property Sets
        pset_requirements = [
            {
                'ifc_type': 'IfcWall',
                'mmi_level': 300,
                'pset_name': 'Pset_WallCommon',
                'required_properties': [
                    {'name': 'LoadBearing', 'type': 'IfcBoolean', 'validation': {'required': True}},
                    {'name': 'IsExternal', 'type': 'IfcBoolean', 'validation': {'required': True}},
                ],
                'optional_properties': ['FireRating', 'AcousticRating'],
                'severity': 'error',
            },
            {
                'ifc_type': 'IfcDoor',
                'mmi_level': 300,
                'pset_name': 'Pset_DoorCommon',
                'required_properties': [
                    {'name': 'FireRating', 'type': 'IfcLabel', 'validation': {'required': True}},
                    {'name': 'HandicapAccessible', 'type': 'IfcBoolean', 'validation': {'required': True}},
                ],
                'severity': 'error',
            },
            {
                'ifc_type': 'IfcWindow',
                'mmi_level': 300,
                'pset_name': 'Pset_WindowCommon',
                'required_properties': [
                    {'name': 'FireRating', 'type': 'IfcLabel', 'validation': {'required': False}},
                ],
                'severity': 'warning',
            },
        ]

        for pset_req in pset_requirements:
            RequiredPropertySet.objects.create(bep=bep, **pset_req)

        # Validation Rules
        validation_rules = [
            {
                'rule_code': 'GUID-001',
                'name': 'GUID Uniqueness',
                'description': 'All GUIDs must be unique within the model',
                'rule_type': 'guid',
                'severity': 'error',
                'rule_definition': {'check': 'uniqueness', 'allow_duplicates': False},
                'error_message_template': 'Duplicate GUID found: {guid} appears {count} times',
                'is_active': True,
            },
            {
                'rule_code': 'GEOM-001',
                'name': '3D Geometry Required at MMI 300+',
                'description': 'All building elements must have 3D geometry at MMI 300 or higher',
                'rule_type': 'geometry',
                'severity': 'error',
                'rule_definition': {
                    'check': 'has_3d_geometry',
                    'min_vertex_count': 8,
                },
                'min_mmi_level': 300,
                'error_message_template': 'Element {name} (GUID: {guid}) has no 3D geometry at MMI 300+',
                'is_active': True,
            },
            {
                'rule_code': 'PROP-001',
                'name': 'Load Bearing Property Required',
                'description': 'Walls must have LoadBearing property at MMI 300+',
                'rule_type': 'property',
                'severity': 'error',
                'rule_definition': {
                    'check': 'has_property',
                    'pset_name': 'Pset_WallCommon',
                    'property_name': 'LoadBearing',
                },
                'applies_to_ifc_types': ['IfcWall'],
                'min_mmi_level': 300,
                'error_message_template': 'Wall {name} missing LoadBearing property',
                'is_active': True,
            },
        ]

        for val_rule in validation_rules:
            ValidationRule.objects.create(bep=bep, **val_rule)

        # Submission Milestones
        today = date.today()
        milestones = [
            {
                'name': 'Preliminary Design',
                'description': 'Concept phase deliverable',
                'target_mmi': 100,
                'required_disciplines': ['ARK'],
                'target_date': today + timedelta(days=30),
                'milestone_order': 1,
                'status': 'upcoming',
                'review_checklist': [
                    {'item': 'Spatial layout defined', 'required': True},
                    {'item': 'Basic element types present', 'required': True},
                ],
            },
            {
                'name': 'Coordination Design',
                'description': 'Coordinated within discipline, ready for clash detection',
                'target_mmi': 300,
                'required_disciplines': ['ARK', 'RIV', 'ELEKT', 'VVS'],
                'target_date': today + timedelta(days=90),
                'milestone_order': 2,
                'status': 'upcoming',
                'review_checklist': [
                    {'item': 'Clash detection completed with 0 critical clashes', 'required': True},
                    {'item': 'All elements classified (NS 3451)', 'required': True},
                    {'item': 'Material assignments complete', 'required': True},
                    {'item': 'System memberships assigned', 'required': True},
                ],
            },
            {
                'name': 'Detailed Design - Cross-disciplinary',
                'description': 'Coordinated across disciplines',
                'target_mmi': 350,
                'required_disciplines': ['ARK', 'RIV', 'ELEKT', 'VVS'],
                'target_date': today + timedelta(days=150),
                'milestone_order': 3,
                'status': 'upcoming',
                'review_checklist': [
                    {'item': 'All discipline models integrated', 'required': True},
                    {'item': 'Coordination issues resolved', 'required': True},
                    {'item': 'Design frozen', 'required': False},
                ],
            },
            {
                'name': 'For Construction',
                'description': 'Production-ready, all feedback approved',
                'target_mmi': 400,
                'required_disciplines': ['ARK', 'RIV', 'ELEKT', 'VVS'],
                'target_date': today + timedelta(days=210),
                'milestone_order': 4,
                'status': 'upcoming',
                'review_checklist': [
                    {'item': 'All feedback from coordination addressed', 'required': True},
                    {'item': 'Detail level sufficient for construction', 'required': True},
                    {'item': 'Quantities verified', 'required': True},
                    {'item': 'Construction documentation complete', 'required': True},
                ],
            },
        ]

        for milestone in milestones:
            SubmissionMilestone.objects.create(bep=bep, **milestone)

        self.stdout.write(self.style.SUCCESS(f'  ✅ Created POFIN template (BEP ID: {bep.id})'))

    def load_infrastructure_template(self, project):
        """Load infrastructure/road project template (Statens vegvesen style)."""
        self.stdout.write('Loading Infrastructure template...')

        if BEPConfiguration.objects.filter(
            project=project,
            framework='pofin',
            name__contains='Infrastructure'
        ).exists():
            self.stdout.write(self.style.WARNING('  Infrastructure template already exists, skipping'))
            return

        bep = BEPConfiguration.objects.create(
            project=project,
            version=self.get_next_version(project),
            status='draft',
            name='POFIN Infrastructure/Roads',
            description='Infrastructure projects (roads, bridges, tunnels)',
            framework='pofin',
            created_by='System (Template)',
        )

        TechnicalRequirement.objects.create(
            bep=bep,
            ifc_schema='IFC4X3',  # IFC 4.3 for infrastructure
            model_view_definition='Infrastructure Reference View',
            coordinate_system_name='EPSG:25833',
            coordinate_system_description='EUREF89 UTM33 (Norway)',
            length_unit='METRE',
            geometry_tolerance=0.001,
            max_file_size_mb=1000,  # Larger for infrastructure
        )

        # Similar MMI scale but adapted for infrastructure
        mmi_definitions = [
            {
                'mmi_level': 100,
                'name': 'Konsept',
                'description': 'Tidligfase for trase-valg',
                'display_order': 1,
                'geometry_requirements': {'detail_level': 'symbolic', 'requires_3d': False},
                'information_requirements': {'min_property_count': 0},
            },
            {
                'mmi_level': 300,
                'name': 'Reguleringsplan',
                'description': 'Grunnlag for reguleringsplan',
                'display_order': 2,
                'geometry_requirements': {'detail_level': 'approximate', 'requires_3d': True, 'min_vertex_count': 20},
                'information_requirements': {'requires_name': True, 'requires_classification': True, 'min_property_count': 5},
            },
            {
                'mmi_level': 400,
                'name': 'Detaljplan',
                'description': 'Detaljert prosjektering, klar for bygging',
                'display_order': 3,
                'geometry_requirements': {'detail_level': 'detailed', 'requires_3d': True, 'min_vertex_count': 50},
                'information_requirements': {'requires_name': True, 'requires_classification': True, 'min_property_count': 15},
            },
        ]

        for mmi_def in mmi_definitions:
            MMIScaleDefinition.objects.create(bep=bep, **mmi_def)

        self.stdout.write(self.style.SUCCESS(f'  ✅ Created Infrastructure template (BEP ID: {bep.id})'))

    def load_iso19650_template(self, project):
        """Load generic ISO 19650 template."""
        self.stdout.write('Loading ISO 19650 Generic template...')

        if BEPConfiguration.objects.filter(
            project=project,
            framework='iso19650',
        ).exists():
            self.stdout.write(self.style.WARNING('  ISO 19650 template already exists, skipping'))
            return

        bep = BEPConfiguration.objects.create(
            project=project,
            version=self.get_next_version(project),
            status='draft',
            name='ISO 19650 Generic',
            description='Generic ISO 19650 framework (international standard)',
            framework='iso19650',
            created_by='System (Template)',
        )

        TechnicalRequirement.objects.create(
            bep=bep,
            ifc_schema='IFC4',
            model_view_definition='Coordination View 2.0',
            coordinate_system_name='Project Coordinate System',
            length_unit='METRE',
            geometry_tolerance=0.001,
            max_file_size_mb=500,
        )

        # Generic LOD scale (100-500)
        mmi_definitions = [
            {
                'mmi_level': 100,
                'name': 'Concept',
                'description': 'Conceptual design',
                'display_order': 1,
                'geometry_requirements': {'detail_level': 'symbolic', 'requires_3d': False},
                'information_requirements': {'min_property_count': 0},
            },
            {
                'mmi_level': 300,
                'name': 'Developed Design',
                'description': 'Design development',
                'display_order': 2,
                'geometry_requirements': {'detail_level': 'approximate', 'requires_3d': True},
                'information_requirements': {'min_property_count': 5},
            },
            {
                'mmi_level': 400,
                'name': 'Technical Design',
                'description': 'Construction-ready',
                'display_order': 3,
                'geometry_requirements': {'detail_level': 'detailed', 'requires_3d': True},
                'information_requirements': {'min_property_count': 15},
            },
        ]

        for mmi_def in mmi_definitions:
            MMIScaleDefinition.objects.create(bep=bep, **mmi_def)

        self.stdout.write(self.style.SUCCESS(f'  ✅ Created ISO 19650 template (BEP ID: {bep.id})'))
