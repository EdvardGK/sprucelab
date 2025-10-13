"""
REST API views for BEP (BIM Execution Plan) module.

Provides endpoints for:
- BEP configuration CRUD
- BEP templates listing
- Project BEP assignment
- MMI scale retrieval for analysis
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import (
    BEPConfiguration,
    TechnicalRequirement,
    MMIScaleDefinition,
    NamingConvention,
    RequiredPropertySet,
    ValidationRule,
    SubmissionMilestone,
)
from .serializers import (
    BEPConfigurationSerializer,
    BEPConfigurationListSerializer,
    BEPTemplateSerializer,
    TechnicalRequirementSerializer,
    MMIScaleDefinitionSerializer,
    NamingConventionSerializer,
    RequiredPropertySetSerializer,
    ValidationRuleSerializer,
    SubmissionMilestoneSerializer,
)


class BEPConfigurationViewSet(viewsets.ModelViewSet):
    """
    API endpoints for BEP configurations.

    - list: Get all BEPs (lightweight)
    - retrieve: Get BEP detail with all nested data
    - create: Create new BEP
    - update: Update BEP
    - destroy: Delete BEP
    - templates: List available BEP templates
    - activate: Activate a BEP (archives other active BEPs)
    """
    queryset = BEPConfiguration.objects.all()
    serializer_class = BEPConfigurationSerializer

    def get_serializer_class(self):
        """Use lightweight serializer for list view."""
        if self.action == 'list':
            return BEPConfigurationListSerializer
        return BEPConfigurationSerializer

    def get_queryset(self):
        """
        Filter BEPs by project if ?project= is provided.

        Examples:
            /api/bep/ - All BEPs
            /api/bep/?project={uuid} - BEPs for specific project
            /api/bep/?status=active - Only active BEPs
        """
        queryset = BEPConfiguration.objects.select_related('project').prefetch_related(
            'technical_requirements',
            'mmi_scale',
            'naming_conventions',
            'required_property_sets',
            'validation_rules',
            'milestones'
        )

        # Filter by project
        project_id = self.request.query_params.get('project', None)
        if project_id:
            queryset = queryset.filter(project_id=project_id)

        # Filter by status
        status_param = self.request.query_params.get('status', None)
        if status_param:
            queryset = queryset.filter(status=status_param)

        return queryset

    @action(detail=False, methods=['get'])
    def templates(self, request):
        """
        List available BEP templates.

        GET /api/bep/templates/

        Returns metadata about available templates that can be used
        to create new BEP configurations.
        """
        templates = [
            {
                'id': 'mmi-full',
                'name': 'MMI-veileder 2.0 - Full Scale',
                'description': 'Complete Norwegian MMI scale with all 19 official levels (0-600)',
                'framework': 'pofin',
                'mmi_scale_count': 19,
                'features': [
                    'Full 19-level scale from MMI-veileder 2.0',
                    'Official Norwegian and English names',
                    'Official color codes (hex and RGB)',
                    'Geometry and information requirements per level',
                    'Covers full lifecycle (foundation → facility management)'
                ],
                'recommended_for': 'Large infrastructure projects requiring full MMI granularity'
            },
            {
                'id': 'mmi-simple',
                'name': 'MMI-veileder 2.0 - Simplified',
                'description': 'Simplified MMI scale with 6 primary levels (100, 200, 300, 350, 400, 500)',
                'framework': 'pofin',
                'mmi_scale_count': 6,
                'features': [
                    'Simplified 6-level scale',
                    'Official Norwegian and English names',
                    'Official color codes',
                    'Covers main project phases',
                    'Easier to implement and track'
                ],
                'recommended_for': 'Standard building projects not requiring full granularity'
            },
            {
                'id': 'iso19650-basic',
                'name': 'ISO 19650 Basic',
                'description': 'Basic ISO 19650 configuration without POFIN-specific elements',
                'framework': 'iso19650',
                'mmi_scale_count': 0,
                'features': [
                    'Generic ISO 19650 framework',
                    'Technical requirements only',
                    'No MMI scale (use LOD instead)',
                    'International standard compliance'
                ],
                'recommended_for': 'International projects not using Norwegian standards'
            }
        ]

        serializer = BEPTemplateSerializer(templates, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """
        Activate a BEP configuration.

        POST /api/bep/{id}/activate/

        This will:
        1. Archive all other active BEPs for the same project
        2. Activate this BEP
        3. Set activated_at timestamp
        """
        bep = self.get_object()
        bep.activate()

        return Response({
            'status': 'success',
            'message': f'BEP v{bep.version} activated for {bep.project.name}',
            'activated_at': bep.activated_at
        })

    @action(detail=True, methods=['get'])
    def mmi_scale(self, request, pk=None):
        """
        Get MMI scale definitions for this BEP.

        GET /api/bep/{id}/mmi-scale/

        Returns all MMI levels with colors, requirements, and descriptions.
        Used by frontend MMIDashboard for dynamic scale display.
        """
        bep = self.get_object()
        mmi_definitions = bep.mmi_scale.all().order_by('mmi_level')

        serializer = MMIScaleDefinitionSerializer(mmi_definitions, many=True)
        return Response({
            'bep_id': str(bep.id),
            'bep_name': bep.name,
            'bep_version': bep.version,
            'scale_count': mmi_definitions.count(),
            'mmi_scale': serializer.data
        })


class MMIScaleDefinitionViewSet(viewsets.ModelViewSet):
    """
    API endpoints for MMI scale definitions.

    Allows CRUD operations on individual MMI levels.
    """
    queryset = MMIScaleDefinition.objects.all()
    serializer_class = MMIScaleDefinitionSerializer

    def get_queryset(self):
        """Filter by BEP if ?bep= is provided."""
        queryset = MMIScaleDefinition.objects.all()

        bep_id = self.request.query_params.get('bep', None)
        if bep_id:
            queryset = queryset.filter(bep_id=bep_id)

        return queryset.order_by('mmi_level')


class TechnicalRequirementViewSet(viewsets.ModelViewSet):
    """API endpoints for technical requirements."""
    queryset = TechnicalRequirement.objects.all()
    serializer_class = TechnicalRequirementSerializer


class NamingConventionViewSet(viewsets.ModelViewSet):
    """API endpoints for naming conventions."""
    queryset = NamingConvention.objects.all()
    serializer_class = NamingConventionSerializer

    def get_queryset(self):
        """Filter by BEP and/or category."""
        queryset = NamingConvention.objects.all()

        bep_id = self.request.query_params.get('bep', None)
        if bep_id:
            queryset = queryset.filter(bep_id=bep_id)

        category = self.request.query_params.get('category', None)
        if category:
            queryset = queryset.filter(category=category)

        return queryset


class RequiredPropertySetViewSet(viewsets.ModelViewSet):
    """API endpoints for required property sets."""
    queryset = RequiredPropertySet.objects.all()
    serializer_class = RequiredPropertySetSerializer

    def get_queryset(self):
        """Filter by BEP and/or IFC type."""
        queryset = RequiredPropertySet.objects.all()

        bep_id = self.request.query_params.get('bep', None)
        if bep_id:
            queryset = queryset.filter(bep_id=bep_id)

        ifc_type = self.request.query_params.get('ifc_type', None)
        if ifc_type:
            queryset = queryset.filter(ifc_type=ifc_type)

        return queryset


class ValidationRuleViewSet(viewsets.ModelViewSet):
    """API endpoints for validation rules."""
    queryset = ValidationRule.objects.all()
    serializer_class = ValidationRuleSerializer

    def get_queryset(self):
        """Filter by BEP and/or rule type."""
        queryset = ValidationRule.objects.all()

        bep_id = self.request.query_params.get('bep', None)
        if bep_id:
            queryset = queryset.filter(bep_id=bep_id)

        rule_type = self.request.query_params.get('rule_type', None)
        if rule_type:
            queryset = queryset.filter(rule_type=rule_type)

        # Only active rules by default
        if self.request.query_params.get('include_inactive', None) != 'true':
            queryset = queryset.filter(is_active=True)

        return queryset


class SubmissionMilestoneViewSet(viewsets.ModelViewSet):
    """API endpoints for submission milestones."""
    queryset = SubmissionMilestone.objects.all()
    serializer_class = SubmissionMilestoneSerializer

    def get_queryset(self):
        """Filter by BEP and/or status."""
        queryset = SubmissionMilestone.objects.all()

        bep_id = self.request.query_params.get('bep', None)
        if bep_id:
            queryset = queryset.filter(bep_id=bep_id)

        status_param = self.request.query_params.get('status', None)
        if status_param:
            queryset = queryset.filter(status=status_param)

        return queryset.order_by('milestone_order', 'target_date')
