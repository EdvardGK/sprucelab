"""
Management command to clear all test data from the database.

Usage:
    python manage.py clear_test_data

This will delete:
- All projects
- All models (and cascade delete all related data)
- All entities, geometry, properties
- All BEP configurations
- All processing reports
- All viewer groups
- All scripts and workflows

Django Q tasks are NOT deleted (they auto-clean).
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.projects.models import Project
from apps.models.models import Model
from apps.entities.models import (
    IFCEntity, PropertySet, SpatialHierarchy,
    System, Material, IFCType, GraphEdge,
    IFCValidationReport, ProcessingReport
)
from apps.bep.models import (
    BEPConfiguration, TechnicalRequirement, MMIScaleDefinition,
    NamingConvention, RequiredPropertySet, ValidationRule, SubmissionMilestone
)
from apps.viewers.models import ViewerGroup, ViewerModel
from apps.scripting.models import Script, ScriptExecution, AutomationWorkflow, WorkflowExecution


class Command(BaseCommand):
    help = 'Clear all test data from the database (projects, models, entities, etc.)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Confirm deletion without prompting',
        )

    def handle(self, *args, **options):
        if not options['confirm']:
            self.stdout.write(
                self.style.WARNING('\n⚠️  WARNING: This will delete ALL data from the database!\n')
            )
            self.stdout.write('This includes:\n')
            self.stdout.write('  - All projects\n')
            self.stdout.write('  - All models\n')
            self.stdout.write('  - All entities, geometry, properties\n')
            self.stdout.write('  - All BEP configurations\n')
            self.stdout.write('  - All viewer groups\n')
            self.stdout.write('  - All scripts and workflows\n')
            self.stdout.write('\n')

            confirm = input('Type "DELETE ALL" to confirm: ')
            if confirm != 'DELETE ALL':
                self.stdout.write(self.style.ERROR('❌ Aborted\n'))
                return

        self.stdout.write('\n🗑️  Starting database cleanup...\n')

        try:
            with transaction.atomic():
                # Count before deletion
                project_count = Project.objects.count()
                model_count = Model.objects.count()
                entity_count = IFCEntity.objects.count()
                # Note: Geometry model removed - viewer loads IFC directly
                property_count = PropertySet.objects.count()
                bep_count = BEPConfiguration.objects.count()
                viewer_group_count = ViewerGroup.objects.count()
                script_count = Script.objects.count()

                self.stdout.write(f'Found:')
                self.stdout.write(f'  - {project_count} projects')
                self.stdout.write(f'  - {model_count} models')
                self.stdout.write(f'  - {entity_count} entities')
                self.stdout.write(f'  - {property_count} properties')
                self.stdout.write(f'  - {bep_count} BEP configurations')
                self.stdout.write(f'  - {viewer_group_count} viewer groups')
                self.stdout.write(f'  - {script_count} scripts')
                self.stdout.write('\n')

                # Delete in correct order (respecting foreign keys)
                # Most dependent tables first

                self.stdout.write('Deleting workflow executions...')
                WorkflowExecution.objects.all().delete()

                self.stdout.write('Deleting script executions...')
                ScriptExecution.objects.all().delete()

                self.stdout.write('Deleting automation workflows...')
                AutomationWorkflow.objects.all().delete()

                self.stdout.write('Deleting scripts...')
                Script.objects.all().delete()

                self.stdout.write('Deleting viewer models...')
                ViewerModel.objects.all().delete()

                self.stdout.write('Deleting viewer groups...')
                ViewerGroup.objects.all().delete()

                self.stdout.write('Deleting processing reports...')
                ProcessingReport.objects.all().delete()

                self.stdout.write('Deleting validation reports...')
                IFCValidationReport.objects.all().delete()

                self.stdout.write('Deleting graph edges...')
                GraphEdge.objects.all().delete()

                self.stdout.write('Deleting property sets...')
                PropertySet.objects.all().delete()

                self.stdout.write('Deleting spatial hierarchy...')
                SpatialHierarchy.objects.all().delete()

                self.stdout.write('Deleting IFC types...')
                IFCType.objects.all().delete()

                self.stdout.write('Deleting materials...')
                Material.objects.all().delete()

                self.stdout.write('Deleting systems...')
                System.objects.all().delete()

                self.stdout.write('Deleting entities...')
                IFCEntity.objects.all().delete()

                self.stdout.write('Deleting BEP submission milestones...')
                SubmissionMilestone.objects.all().delete()

                self.stdout.write('Deleting BEP validation rules...')
                ValidationRule.objects.all().delete()

                self.stdout.write('Deleting BEP required property sets...')
                RequiredPropertySet.objects.all().delete()

                self.stdout.write('Deleting BEP naming conventions...')
                NamingConvention.objects.all().delete()

                self.stdout.write('Deleting BEP MMI scale definitions...')
                MMIScaleDefinition.objects.all().delete()

                self.stdout.write('Deleting BEP technical requirements...')
                TechnicalRequirement.objects.all().delete()

                self.stdout.write('Deleting BEP configurations...')
                BEPConfiguration.objects.all().delete()

                self.stdout.write('Deleting models...')
                Model.objects.all().delete()

                self.stdout.write('Deleting projects...')
                Project.objects.all().delete()

                self.stdout.write('\n')
                self.stdout.write(self.style.SUCCESS('✅ Database cleared successfully!\n'))
                self.stdout.write(f'\nDeleted:')
                self.stdout.write(f'  - {project_count} projects')
                self.stdout.write(f'  - {model_count} models')
                self.stdout.write(f'  - {entity_count} entities')
                self.stdout.write(f'  - {property_count} properties')
                self.stdout.write(f'  - {bep_count} BEP configurations')
                self.stdout.write(f'  - {viewer_group_count} viewer groups')
                self.stdout.write(f'  - {script_count} scripts')
                self.stdout.write('\n')

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n❌ Error clearing database: {str(e)}\n'))
            raise
