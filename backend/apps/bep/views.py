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
from django.utils import timezone
from .models import (
    BEPTemplate,
    BEPConfiguration,
    TechnicalRequirement,
    MMIScaleDefinition,
    NamingConvention,
    RequiredPropertySet,
    ValidationRule,
    SubmissionMilestone,
    ProjectDiscipline,
    ProjectCoordinates,
    ProjectStorey,
    EIR,
    EIRRequirement,
    IDSSpecification,
    BEPResponse,
    BEPResponseItem,
    IDSValidationRun,
)
from .serializers import (
    BEPTemplateModelSerializer,
    BEPTemplateListSerializer,
    BEPConfigurationSerializer,
    BEPConfigurationListSerializer,
    BEPTemplateSerializer,
    TechnicalRequirementSerializer,
    MMIScaleDefinitionSerializer,
    NamingConventionSerializer,
    RequiredPropertySetSerializer,
    ValidationRuleSerializer,
    SubmissionMilestoneSerializer,
    ProjectDisciplineSerializer,
    ProjectCoordinatesSerializer,
    ProjectStoreySerializer,
    EIRSerializer,
    EIRListSerializer,
    EIRRequirementSerializer,
    IDSSpecificationSerializer,
    IDSSpecificationListSerializer,
    BEPResponseSerializer,
    BEPResponseListSerializer,
    BEPResponseItemSerializer,
    IDSValidationRunSerializer,
    IDSValidationRunListSerializer,
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
        queryset = BEPConfiguration.objects.select_related(
            'project', 'template'
        ).prefetch_related(
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

    def get_queryset(self):
        """Filter by BEP if ?bep= is provided."""
        queryset = TechnicalRequirement.objects.all()
        bep_id = self.request.query_params.get('bep', None)
        if bep_id:
            queryset = queryset.filter(bep_id=bep_id)
        return queryset


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


class BEPTemplateViewSet(viewsets.ModelViewSet):
    """
    API endpoints for BEP templates.

    Templates are reusable BEP configurations that projects can inherit from.
    System templates are read-only; user templates can be created/modified.
    """
    queryset = BEPTemplate.objects.all()
    serializer_class = BEPTemplateModelSerializer

    def get_serializer_class(self):
        """Use lightweight serializer for list view."""
        if self.action == 'list':
            return BEPTemplateListSerializer
        return BEPTemplateModelSerializer

    def get_queryset(self):
        """Filter by framework if provided."""
        queryset = BEPTemplate.objects.all()

        framework = self.request.query_params.get('framework', None)
        if framework:
            queryset = queryset.filter(framework=framework)

        # System templates first, then alphabetical
        return queryset.order_by('-is_system', 'name')

    def destroy(self, request, *args, **kwargs):
        """Prevent deletion of system templates."""
        template = self.get_object()
        if template.is_system:
            return Response(
                {'error': 'Cannot delete system templates'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        """Prevent modification of system templates."""
        template = self.get_object()
        if template.is_system:
            return Response(
                {'error': 'Cannot modify system templates'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)


class ProjectDisciplineViewSet(viewsets.ModelViewSet):
    """
    API endpoints for project disciplines.

    Manages discipline assignments for projects (ARK, RIB, RIV, etc.)
    with company contacts and software information.
    """
    queryset = ProjectDiscipline.objects.all()
    serializer_class = ProjectDisciplineSerializer

    def get_queryset(self):
        """Filter by project if provided."""
        queryset = ProjectDiscipline.objects.select_related('project')

        project_id = self.request.query_params.get('project', None)
        if project_id:
            queryset = queryset.filter(project_id=project_id)

        # Only active by default
        if self.request.query_params.get('include_inactive', None) != 'true':
            queryset = queryset.filter(is_active=True)

        return queryset.order_by('discipline_code')


class ProjectCoordinatesViewSet(viewsets.ModelViewSet):
    """
    API endpoints for project coordinates.

    Manages coordinate system configuration per project.
    One-to-one relationship with Project.
    """
    queryset = ProjectCoordinates.objects.all()
    serializer_class = ProjectCoordinatesSerializer

    def get_queryset(self):
        """Filter by project if provided."""
        queryset = ProjectCoordinates.objects.select_related('project')

        project_id = self.request.query_params.get('project', None)
        if project_id:
            queryset = queryset.filter(project_id=project_id)

        return queryset


class ProjectStoreyViewSet(viewsets.ModelViewSet):
    """
    API endpoints for project storeys.

    Manages expected floor/storey structure per project.
    Used for validation of IfcBuildingStorey elevations.
    """
    queryset = ProjectStorey.objects.all()
    serializer_class = ProjectStoreySerializer

    def get_queryset(self):
        """Filter by project if provided."""
        queryset = ProjectStorey.objects.select_related('project')

        project_id = self.request.query_params.get('project', None)
        if project_id:
            queryset = queryset.filter(project_id=project_id)

        return queryset.order_by('order', 'elevation_m')


# --- EIR / IDS / BEP Response ViewSets ---


class EIRViewSet(viewsets.ModelViewSet):
    """
    API endpoints for Employer's Information Requirements.

    GET /api/bep/eir/?project={id}
    POST /api/bep/eir/
    GET /api/bep/eir/{id}/
    PATCH /api/bep/eir/{id}/
    POST /api/bep/eir/{id}/issue/
    GET /api/bep/eir/{id}/compliance/
    """
    queryset = EIR.objects.all()
    serializer_class = EIRSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return EIRListSerializer
        return EIRSerializer

    def get_queryset(self):
        queryset = EIR.objects.select_related('project').prefetch_related(
            'requirements', 'ids_specifications'
        )
        project_id = self.request.query_params.get('project', None)
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        status_param = self.request.query_params.get('status', None)
        if status_param:
            queryset = queryset.filter(status=status_param)
        return queryset

    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        """Issue this EIR (status -> issued)."""
        eir = self.get_object()
        eir.status = 'issued'
        eir.issued_at = timezone.now()
        eir.save()
        return Response({
            'status': 'success',
            'message': f'EIR v{eir.version} issued',
            'issued_at': eir.issued_at,
        })

    @action(detail=True, methods=['get'])
    def compliance(self, request, pk=None):
        """
        Compliance summary for this EIR.

        Returns per-requirement: response status + latest validation results.
        """
        eir = self.get_object()
        requirements = eir.requirements.all().order_by('order', 'code')

        # Get latest response
        latest_response = eir.responses.order_by('-version').first()

        result = []
        for req in requirements:
            item_data = {
                'requirement_id': str(req.id),
                'code': req.code,
                'title': req.title,
                'category': req.category,
                'severity': req.severity,
                'has_ids': req.ids_specification is not None,
                'response_status': None,
                'latest_validation': None,
            }

            # Response status
            if latest_response:
                response_item = req.response_items.filter(
                    response=latest_response
                ).first()
                if response_item:
                    item_data['response_status'] = response_item.compliance_status

            # Latest validation (if IDS-backed)
            if req.ids_specification:
                latest_run = req.ids_specification.validation_runs.filter(
                    status='completed'
                ).order_by('-completed_at').first()
                if latest_run:
                    item_data['latest_validation'] = {
                        'run_id': str(latest_run.id),
                        'overall_pass': latest_run.overall_pass,
                        'specifications_passed': latest_run.specifications_passed,
                        'specifications_failed': latest_run.specifications_failed,
                        'completed_at': latest_run.completed_at,
                    }

            result.append(item_data)

        return Response(result)


class EIRRequirementViewSet(viewsets.ModelViewSet):
    """
    API endpoints for EIR requirements.

    GET /api/bep/eir-requirements/?eir={id}
    """
    queryset = EIRRequirement.objects.all()
    serializer_class = EIRRequirementSerializer

    def get_queryset(self):
        queryset = EIRRequirement.objects.select_related(
            'eir', 'ids_specification'
        )
        eir_id = self.request.query_params.get('eir', None)
        if eir_id:
            queryset = queryset.filter(eir_id=eir_id)
        category = self.request.query_params.get('category', None)
        if category:
            queryset = queryset.filter(category=category)
        return queryset.order_by('order', 'code')

    @action(detail=False, methods=['post'])
    def bulk(self, request):
        """Bulk create requirements."""
        items = request.data if isinstance(request.data, list) else [request.data]
        serializer = EIRRequirementSerializer(data=items, many=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class IDSSpecificationViewSet(viewsets.ModelViewSet):
    """
    API endpoints for IDS specifications.

    GET /api/bep/ids/?eir={id}&is_library=true
    POST /api/bep/ids/{id}/validate/ -- trigger validation against a model
    """
    queryset = IDSSpecification.objects.all()
    serializer_class = IDSSpecificationSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return IDSSpecificationListSerializer
        return IDSSpecificationSerializer

    def get_queryset(self):
        queryset = IDSSpecification.objects.select_related('eir')
        eir_id = self.request.query_params.get('eir', None)
        if eir_id:
            queryset = queryset.filter(eir_id=eir_id)
        is_library = self.request.query_params.get('is_library', None)
        if is_library == 'true':
            queryset = queryset.filter(is_library=True)
        return queryset

    @action(detail=True, methods=['post'])
    def validate(self, request, pk=None):
        """
        Trigger IDS validation against a model.

        POST /api/bep/ids/{id}/validate/
        Body: { "model_id": "uuid" }

        Creates an IDSValidationRun and calls FastAPI for validation.
        """
        ids_spec = self.get_object()
        model_id = request.data.get('model_id')
        if not model_id:
            return Response(
                {'error': 'model_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create validation run
        run = IDSValidationRun.objects.create(
            model_id=model_id,
            ids_specification=ids_spec,
            eir=ids_spec.eir,
            status='pending',
            triggered_by=str(request.user) if request.user.is_authenticated else 'anonymous',
        )

        # TODO: Call FastAPI service for actual validation (Step 6)
        # For now, return the run ID for polling
        return Response({
            'run_id': str(run.id),
            'status': 'pending',
            'message': 'Validation run created. IDS validation via FastAPI not yet wired.',
        }, status=status.HTTP_202_ACCEPTED)


class BEPResponseViewSet(viewsets.ModelViewSet):
    """
    API endpoints for BEP responses to EIR.

    GET /api/bep/responses/?eir={id}
    POST /api/bep/responses/{id}/submit/
    POST /api/bep/responses/{id}/auto-populate/
    """
    queryset = BEPResponse.objects.all()
    serializer_class = BEPResponseSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return BEPResponseListSerializer
        return BEPResponseSerializer

    def get_queryset(self):
        queryset = BEPResponse.objects.select_related(
            'eir', 'bep_configuration'
        ).prefetch_related('items')
        eir_id = self.request.query_params.get('eir', None)
        if eir_id:
            queryset = queryset.filter(eir_id=eir_id)
        return queryset

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit this BEP response."""
        response = self.get_object()
        response.status = 'submitted'
        response.submitted_at = timezone.now()
        response.save()
        # Update EIR status
        response.eir.status = 'responded'
        response.eir.save()
        return Response({
            'status': 'success',
            'message': 'BEP Response submitted',
            'submitted_at': response.submitted_at,
        })

    @action(detail=True, methods=['post'], url_path='auto-populate')
    def auto_populate(self, request, pk=None):
        """
        Auto-create BEPResponseItems for all EIR requirements.

        Creates one item per requirement with status='pending'.
        Skips requirements that already have items.
        """
        response = self.get_object()
        requirements = response.eir.requirements.all()
        existing_req_ids = set(
            response.items.values_list('requirement_id', flat=True)
        )

        created = []
        for req in requirements:
            if req.id not in existing_req_ids:
                item = BEPResponseItem.objects.create(
                    response=response,
                    requirement=req,
                    compliance_status='pending',
                )
                created.append(str(item.id))

        return Response({
            'created_count': len(created),
            'total_items': response.items.count(),
        })


class BEPResponseItemViewSet(viewsets.ModelViewSet):
    """API endpoints for individual BEP response items."""
    queryset = BEPResponseItem.objects.all()
    serializer_class = BEPResponseItemSerializer

    def get_queryset(self):
        queryset = BEPResponseItem.objects.select_related(
            'response', 'requirement'
        )
        response_id = self.request.query_params.get('response', None)
        if response_id:
            queryset = queryset.filter(response_id=response_id)
        return queryset.order_by('requirement__order')

    @action(detail=False, methods=['post'])
    def bulk(self, request):
        """Bulk update response items."""
        items = request.data if isinstance(request.data, list) else [request.data]
        updated = []
        for item_data in items:
            item_id = item_data.get('id')
            if not item_id:
                continue
            try:
                item = BEPResponseItem.objects.get(id=item_id)
                for field in ['compliance_status', 'method_description', 'issues',
                              'wishes', 'responsible_discipline', 'tool_notes']:
                    if field in item_data:
                        setattr(item, field, item_data[field])
                item.save()
                updated.append(str(item.id))
            except BEPResponseItem.DoesNotExist:
                continue
        return Response({'updated_count': len(updated)})


class IDSValidationRunViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoints for IDS validation runs (read-only).

    GET /api/bep/ids-runs/?model={id}&ids_specification={id}
    GET /api/bep/ids-runs/{id}/
    """
    queryset = IDSValidationRun.objects.all()
    serializer_class = IDSValidationRunSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return IDSValidationRunListSerializer
        return IDSValidationRunSerializer

    def get_queryset(self):
        queryset = IDSValidationRun.objects.select_related(
            'model', 'ids_specification', 'eir'
        )
        model_id = self.request.query_params.get('model', None)
        if model_id:
            queryset = queryset.filter(model_id=model_id)
        ids_id = self.request.query_params.get('ids_specification', None)
        if ids_id:
            queryset = queryset.filter(ids_specification_id=ids_id)
        eir_id = self.request.query_params.get('eir', None)
        if eir_id:
            queryset = queryset.filter(eir_id=eir_id)
        return queryset
