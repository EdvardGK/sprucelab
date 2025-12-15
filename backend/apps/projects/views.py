from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Sum, Q, F
from django.db.models.functions import Coalesce
from .models import Project
from .serializers import ProjectSerializer


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
