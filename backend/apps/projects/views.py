from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Sum, Q, F
from django.db.models.functions import Coalesce
from django.http import JsonResponse
import json
import yaml

from .models import Project, ProjectConfig
from .serializers import (
    ProjectSerializer,
    ProjectConfigSerializer,
    ProjectConfigListSerializer,
    ProjectConfigDetailSerializer,
    ProjectConfigUpdateSerializer,
    ProjectConfigImportSerializer,
    ProjectConfigCreateFromTemplateSerializer,
    ConfigValidationSerializer,
)
from .services.bep_defaults import BEPDefaults, get_bep_template


class ProjectViewSet(viewsets.ModelViewSet):
    """
    API endpoint for projects.

    list: Get all projects
    create: Create a new project
    retrieve: Get a single project
    update: Update a project
    partial_update: Partially update a project
    destroy: Delete a project
    """
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer

    @action(detail=True, methods=['get'])
    def models(self, request, pk=None):
        """Get all models for a project."""
        project = self.get_object()
        from apps.models.serializers import ModelSerializer
        models = project.models.all()
        serializer = ModelSerializer(models, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        """
        Get comprehensive project statistics for dashboard.

        Returns:
        - model_count, element_count: Basic counts
        - type_count, type_mapped_count: Type statistics
        - material_count, material_mapped_count: Material statistics
        - top_types: Top 5 types by quantity (using representative_unit)
        - top_materials: Top 5 materials by usage
        - ns3451_coverage: NS-3451 mapping progress
        - mmi_distribution: MMI level distribution (placeholder)
        - basepoint: GIS coordinates from first model with coords
        """
        from apps.entities.models import (
            IFCEntity, IFCType, TypeMapping, TypeAssignment,
            Material, MaterialMapping, MaterialAssignment
        )
        from apps.models.models import Model

        project = self.get_object()
        project_models = Model.objects.filter(project=project)
        model_ids = project_models.values_list('id', flat=True)

        # Basic counts
        model_count = project_models.count()
        element_count = IFCEntity.objects.filter(model_id__in=model_ids).count()

        # Type statistics
        types = IFCType.objects.filter(model_id__in=model_ids)
        type_count = types.count()
        type_mapped_count = TypeMapping.objects.filter(
            ifc_type__model_id__in=model_ids,
            mapping_status='mapped'
        ).count()

        # Material statistics
        materials = Material.objects.filter(model_id__in=model_ids)
        material_count = materials.count()
        material_mapped_count = MaterialMapping.objects.filter(
            material__model_id__in=model_ids,
            mapping_status='mapped'
        ).count()

        # Top 5 types by quantity (using representative_unit from mapping)
        top_types = self._get_top_types(model_ids, limit=5)

        # Top 5 materials by usage
        top_materials = self._get_top_materials(model_ids, limit=5)

        # NS3451 mapping coverage
        ns3451_coverage = self._get_ns3451_coverage(model_ids)

        # MMI distribution (placeholder - requires MMI data on entities)
        mmi_distribution = self._get_mmi_distribution(model_ids)

        # Basepoint from first model with GIS coordinates
        basepoint = self._get_basepoint(project_models)

        return Response({
            'project_id': str(project.id),
            'name': project.name,
            'model_count': model_count,
            'element_count': element_count,
            'type_count': type_count,
            'type_mapped_count': type_mapped_count,
            'material_count': material_count,
            'material_mapped_count': material_mapped_count,
            'top_types': top_types,
            'top_materials': top_materials,
            'ns3451_coverage': ns3451_coverage,
            'mmi_distribution': mmi_distribution,
            'basepoint': basepoint,
            'created_at': project.created_at,
            'updated_at': project.updated_at,
        })

    def _get_top_types(self, model_ids, limit=5):
        """Get top types by quantity, using representative_unit from mapping."""
        from apps.entities.models import IFCType, TypeMapping, TypeAssignment, IFCEntity

        # Get all types with their mappings and instance counts
        types_with_stats = []

        types = IFCType.objects.filter(model_id__in=model_ids).select_related('mapping')

        for ifc_type in types:
            # Get entities of this type
            entity_ids = TypeAssignment.objects.filter(
                type=ifc_type
            ).values_list('entity_id', flat=True)

            entities = IFCEntity.objects.filter(id__in=entity_ids)
            count = entities.count()

            if count == 0:
                continue

            # Determine unit and aggregate quantity
            unit = 'pcs'
            quantity = count

            try:
                mapping = ifc_type.mapping
                if mapping and mapping.representative_unit:
                    unit = mapping.representative_unit
                    if unit == 'm3':
                        quantity = entities.aggregate(
                            total=Coalesce(Sum('volume'), 0.0)
                        )['total'] or 0.0
                    elif unit == 'm2':
                        quantity = entities.aggregate(
                            total=Coalesce(Sum('area'), 0.0)
                        )['total'] or 0.0
                    elif unit == 'm':
                        quantity = entities.aggregate(
                            total=Coalesce(Sum('length'), 0.0)
                        )['total'] or 0.0
            except TypeMapping.DoesNotExist:
                pass

            types_with_stats.append({
                'name': ifc_type.type_name or ifc_type.ifc_type,
                'ifc_type': ifc_type.ifc_type,
                'count': count,
                'quantity': round(quantity, 2) if isinstance(quantity, float) else quantity,
                'unit': unit,
            })

        # Sort by count (fallback) then return top N
        types_with_stats.sort(key=lambda x: x['count'], reverse=True)
        return types_with_stats[:limit]

    def _get_top_materials(self, model_ids, limit=5):
        """Get top materials by usage count and volume."""
        from apps.entities.models import Material, MaterialAssignment, IFCEntity

        materials_with_stats = []

        materials = Material.objects.filter(model_id__in=model_ids)

        for material in materials:
            # Get entities using this material
            entity_ids = MaterialAssignment.objects.filter(
                material=material
            ).values_list('entity_id', flat=True)

            entities = IFCEntity.objects.filter(id__in=entity_ids)
            count = entities.count()

            if count == 0:
                continue

            # Aggregate volume
            volume = entities.aggregate(
                total=Coalesce(Sum('volume'), 0.0)
            )['total'] or 0.0

            materials_with_stats.append({
                'name': material.name,
                'category': material.category,
                'count': count,
                'volume_m3': round(volume, 2),
            })

        # Sort by count
        materials_with_stats.sort(key=lambda x: x['count'], reverse=True)
        return materials_with_stats[:limit]

    def _get_ns3451_coverage(self, model_ids):
        """Get NS-3451 mapping coverage statistics."""
        from apps.entities.models import IFCType, TypeMapping

        total = IFCType.objects.filter(model_id__in=model_ids).count()

        if total == 0:
            return {
                'total': 0,
                'mapped': 0,
                'pending': 0,
                'review': 0,
                'ignored': 0,
                'followup': 0,
                'percentage': 0.0,
            }

        # Count by status
        status_counts = TypeMapping.objects.filter(
            ifc_type__model_id__in=model_ids
        ).values('mapping_status').annotate(count=Count('id'))

        counts = {item['mapping_status']: item['count'] for item in status_counts}

        mapped = counts.get('mapped', 0)
        pending = total - sum(counts.values())  # Types without mapping record
        pending += counts.get('pending', 0)

        return {
            'total': total,
            'mapped': mapped,
            'pending': pending,
            'review': counts.get('review', 0),
            'ignored': counts.get('ignored', 0),
            'followup': counts.get('followup', 0),
            'percentage': round((mapped / total) * 100, 1) if total > 0 else 0.0,
        }

    def _get_mmi_distribution(self, model_ids):
        """
        Get MMI distribution across elements.

        Note: This is a placeholder. MMI data needs to be stored on entities
        or calculated from property sets.
        """
        # TODO: Implement when MMI data is available on entities
        # For now, return empty distribution
        return []

    def _get_basepoint(self, project_models):
        """Get GIS basepoint from first model with coordinates."""
        for model in project_models:
            if model.gis_basepoint_x is not None and model.gis_basepoint_y is not None:
                return {
                    'gis_x': model.gis_basepoint_x,
                    'gis_y': model.gis_basepoint_y,
                    'gis_z': model.gis_basepoint_z,
                    'crs': model.gis_crs,
                    'model_name': model.name,
                }
        return None


class ProjectConfigViewSet(viewsets.ModelViewSet):
    """
    API endpoint for project configurations.

    Provides CRUD operations plus:
    - create_from_template: Create config from BEP template
    - validate: Validate config structure without saving
    - export: Export config as JSON or YAML
    - import_config: Import config from JSON/YAML
    - get_template: Get blank BEP template
    - get_mmi_scale: Get default MMI scale
    """
    queryset = ProjectConfig.objects.all()

    def get_serializer_class(self):
        if self.action == 'list':
            return ProjectConfigListSerializer
        elif self.action in ['update', 'partial_update']:
            return ProjectConfigUpdateSerializer
        elif self.action == 'retrieve':
            return ProjectConfigDetailSerializer
        return ProjectConfigSerializer

    def get_queryset(self):
        """Optionally filter by project."""
        queryset = ProjectConfig.objects.select_related('project')
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset

    @action(detail=False, methods=['post'], url_path='from-template')
    def create_from_template(self, request):
        """
        Create a new config from BEP template.

        POST /api/project-configs/from-template/
        {
            "project": "uuid",
            "project_code": "ST28",
            "name": "Initial BEP Config",
            "activate": true,
            "customize": {
                "bep": {"target_mmi": 400}
            }
        }
        """
        project_id = request.data.get('project')
        if not project_id:
            return Response(
                {'error': 'project is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return Response(
                {'error': 'Project not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = ProjectConfigCreateFromTemplateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Generate config from template
        config = serializer.create_config(project)

        # Get next version number
        last_config = ProjectConfig.objects.filter(project=project).order_by('-version').first()
        next_version = (last_config.version + 1) if last_config else 1

        # Create the config
        project_config = ProjectConfig.objects.create(
            project=project,
            version=next_version,
            name=serializer.validated_data.get('name', f'BEP v{next_version}'),
            config=config,
            is_active=serializer.validated_data.get('activate', True),
            created_by=request.user.username if request.user.is_authenticated else None,
            notes=f"Created from BEP template (code: {serializer.validated_data['project_code']})"
        )

        return Response(
            ProjectConfigDetailSerializer(project_config).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['post'])
    def validate(self, request):
        """
        Validate a config structure without saving.

        POST /api/project-configs/validate/
        {
            "config": {...}
        }
        """
        serializer = ConfigValidationSerializer(data=request.data)
        if serializer.is_valid():
            return Response(serializer.get_validation_result())
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def export(self, request, pk=None):
        """
        Export config as JSON or YAML.

        GET /api/project-configs/{id}/export/?format=json
        GET /api/project-configs/{id}/export/?format=yaml
        """
        config = self.get_object()
        export_format = request.query_params.get('format', 'json').lower()

        if export_format == 'yaml':
            content = yaml.dump(config.config, allow_unicode=True, default_flow_style=False)
            content_type = 'application/x-yaml'
            filename = f'{config.project.name}_config_v{config.version}.yaml'
        else:
            content = json.dumps(config.config, indent=2, ensure_ascii=False)
            content_type = 'application/json'
            filename = f'{config.project.name}_config_v{config.version}.json'

        response = Response(
            config.config if export_format == 'json' else content,
            content_type=content_type
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=['post'], url_path='import')
    def import_config(self, request):
        """
        Import config from JSON/YAML.

        POST /api/project-configs/import/
        {
            "project": "uuid",
            "config": {...},
            "name": "Imported Config",
            "activate": true
        }
        """
        project_id = request.data.get('project')
        if not project_id:
            return Response(
                {'error': 'project is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return Response(
                {'error': 'Project not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = ProjectConfigImportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Get next version number
        last_config = ProjectConfig.objects.filter(project=project).order_by('-version').first()
        next_version = (last_config.version + 1) if last_config else 1

        # Create the config
        project_config = ProjectConfig.objects.create(
            project=project,
            version=next_version,
            name=serializer.validated_data.get('name', f'Imported v{next_version}'),
            config=serializer.validated_data['config'],
            is_active=serializer.validated_data.get('activate', True),
            created_by=request.user.username if request.user.is_authenticated else None,
            notes='Imported from JSON/YAML'
        )

        return Response(
            ProjectConfigDetailSerializer(project_config).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['get'])
    def template(self, request):
        """
        Get blank BEP template.

        GET /api/project-configs/template/?code=ST28
        """
        project_code = request.query_params.get('code', 'PRJ')
        template = get_bep_template(project_code)
        return Response(template)

    @action(detail=False, methods=['get'], url_path='mmi-scale')
    def mmi_scale(self, request):
        """
        Get default MMI scale definition.

        GET /api/project-configs/mmi-scale/
        """
        return Response(BEPDefaults.get_mmi_scale())

    @action(detail=False, methods=['get'], url_path='validation-rules')
    def validation_rules(self, request):
        """
        Get default validation rules.

        GET /api/project-configs/validation-rules/
        """
        return Response(BEPDefaults.get_validation_rules())

    @action(detail=False, methods=['get'], url_path='naming-conventions')
    def naming_conventions(self, request):
        """
        Get default naming conventions.

        GET /api/project-configs/naming-conventions/
        """
        return Response(BEPDefaults.get_naming_conventions())

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """
        Set this config as active (deactivates others for same project).

        POST /api/project-configs/{id}/activate/
        """
        config = self.get_object()
        config.is_active = True
        config.save()  # save() handles deactivating others
        return Response(ProjectConfigDetailSerializer(config).data)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """
        Create a new version by duplicating this config.

        POST /api/project-configs/{id}/duplicate/
        {
            "name": "New Version Name"
        }
        """
        source_config = self.get_object()

        # Get next version number
        last_config = ProjectConfig.objects.filter(
            project=source_config.project
        ).order_by('-version').first()
        next_version = last_config.version + 1

        new_config = ProjectConfig.objects.create(
            project=source_config.project,
            version=next_version,
            name=request.data.get('name', f'Copy of {source_config.name or f"v{source_config.version}"}'),
            config=source_config.config.copy(),  # Deep copy
            is_active=False,  # Don't auto-activate
            created_by=request.user.username if request.user.is_authenticated else None,
            notes=f"Duplicated from v{source_config.version}"
        )

        return Response(
            ProjectConfigDetailSerializer(new_config).data,
            status=status.HTTP_201_CREATED
        )
