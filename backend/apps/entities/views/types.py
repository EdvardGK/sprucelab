"""
ViewSets for IFC types, type mappings, and type definition layers.

Core of the types-only architecture: types are extracted from IFC models,
classified via NS3451, and enriched with material layers for LCA export.
"""
from datetime import datetime
from io import BytesIO
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from django.http import HttpResponse
from django.db.models import Count, Prefetch
from django_filters.rest_framework import DjangoFilterBackend
from ..models import (
    IFCType, TypeMapping, TypeDefinitionLayer, PropertySet,
)
from ..serializers import (
    IFCTypeWithMappingSerializer, TypeMappingSerializer, TypeDefinitionLayerSerializer,
)
from ..services.excel_export import export_types_to_excel
from ..services.excel_import import import_types_from_excel
from ..services.reduzer_export import export_types_to_reduzer


class IFCTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for IFC types with mapping status.

    GET /api/types/?model={id} - List types for a model (required)
    GET /api/types/{id}/ - Get single type with mapping
    GET /api/types/?model={id}&ifc_type=IfcWallType - Filter by IFC class

    Returns instance_count (how many entities use this type) and
    mapping object (NS3451 code, status, etc.)

    Note: Pagination disabled - types are small and mapping workflow needs all of them.
    Typical models have 50-500 types; even 1000+ types is fine to return at once.
    """
    queryset = IFCType.objects.select_related(
        'mapping', 'mapping__ns3451'
    ).prefetch_related(
        Prefetch('mapping__definition_layers', queryset=TypeDefinitionLayer.objects.order_by('layer_order'))
    ).all()
    serializer_class = IFCTypeWithMappingSerializer
    pagination_class = None  # Return all types - needed for mapping workflow
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['model', 'ifc_type']
    search_fields = ['type_name', 'ifc_type']
    ordering = ['ifc_type', 'type_name']

    def get_queryset(self):
        """
        Filter types by default to exclude those with 0 instances.

        Use ?include_unused=true to show all types including unused ones.
        This reduces noise from template types that have no instances in the model.
        """
        qs = super().get_queryset()

        include_unused = self.request.query_params.get('include_unused', 'false').lower() == 'true'
        if not include_unused:
            # Use stored instance_count field (populated during parsing)
            qs = qs.filter(instance_count__gt=0)

        return qs

    @action(detail=False, methods=['get'], url_path='summary')
    def mapping_summary(self, request):
        """
        Get mapping summary for a model.

        GET /api/types/summary/?model={id}

        Returns counts: total, mapped, pending, ignored, review
        """
        model_id = request.query_params.get('model')
        if not model_id:
            return Response({'error': 'model parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        types = IFCType.objects.filter(model_id=model_id)
        total = types.count()

        # Count by mapping status
        mapped = types.filter(mapping__mapping_status='mapped').count()
        pending = types.filter(mapping__mapping_status='pending').count()
        ignored = types.filter(mapping__mapping_status='ignored').count()
        review = types.filter(mapping__mapping_status='review').count()
        unmapped = total - (mapped + pending + ignored + review)

        return Response({
            'total': total,
            'mapped': mapped,
            'pending': pending + unmapped,  # Treat unmapped as pending
            'ignored': ignored,
            'review': review,
            'progress_percent': round((mapped / total * 100) if total > 0 else 0, 1)
        })

    @action(detail=False, methods=['get'], url_path='consolidated')
    def consolidated(self, request):
        """
        Get types consolidated by signature (ifc_type + type_name + key properties).

        GET /api/types/types/consolidated/?model={id}

        Creates a "type signature" for ML-style grouping:
        - ifc_type: IfcColumnType
        - type_name: CFRS 150x150x10
        - is_external: False
        - load_bearing: True
        - material: S355

        Two types with same name but different key properties = different consolidated types.
        """
        model_id = request.query_params.get('model')
        if not model_id:
            return Response({'error': 'model parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        from ..models import TypeAssignment
        from collections import defaultdict

        # Key properties for type signature (order matters for consistency)
        KEY_PROPERTIES = ['IsExternal', 'LoadBearing', 'FireRating', 'Reference']

        # First pass: group by (ifc_type, type_name) to get candidate groups
        type_groups = IFCType.objects.filter(model_id=model_id).values(
            'ifc_type', 'type_name'
        ).annotate(guid_count=Count('id')).order_by('ifc_type', 'type_name')

        results = []
        for group in type_groups:
            # Get all types in this name group
            types_in_group = IFCType.objects.filter(
                model_id=model_id,
                ifc_type=group['ifc_type'],
                type_name=group['type_name']
            )
            type_ids = list(types_in_group.values_list('id', flat=True))

            # Get entities for these types
            entity_ids = list(TypeAssignment.objects.filter(
                type_id__in=type_ids
            ).values_list('entity_id', flat=True))

            # Extract key property values (most common value for each property)
            signature_props = {}
            for prop_name in KEY_PROPERTIES:
                values = list(PropertySet.objects.filter(
                    entity_id__in=entity_ids,
                    property_name=prop_name
                ).values_list('property_value', flat=True))
                if values:
                    # Use most common value as the signature value
                    from collections import Counter
                    most_common = Counter(values).most_common(1)
                    signature_props[prop_name.lower()] = most_common[0][0] if most_common else None

            # Get representative type for mapping info
            rep_type = types_in_group.select_related('mapping', 'mapping__ns3451').first()

            # Get material from entities (common property)
            materials = list(PropertySet.objects.filter(
                entity_id__in=entity_ids,
                property_name__in=['Structural Material', 'Material']
            ).values_list('property_value', flat=True).distinct()[:3])

            # Get mapping info
            mapping_status = None
            ns3451_code = None
            ns3451_name = None
            if rep_type and hasattr(rep_type, 'mapping') and rep_type.mapping:
                mapping_status = rep_type.mapping.mapping_status
                ns3451_code = rep_type.mapping.ns3451_code
                if rep_type.mapping.ns3451:
                    ns3451_name = rep_type.mapping.ns3451.name

            results.append({
                'ifc_type': group['ifc_type'],
                'type_name': group['type_name'],
                'guid_count': group['guid_count'],
                'instance_count': len(entity_ids),
                'representative_id': str(rep_type.id) if rep_type else None,
                # Key properties for ML signature
                'is_external': signature_props.get('isexternal'),
                'load_bearing': signature_props.get('loadbearing'),
                'fire_rating': signature_props.get('firerating'),
                'reference': signature_props.get('reference'),
                'materials': materials,
                # Mapping info
                'mapping_status': mapping_status,
                'ns3451_code': ns3451_code,
                'ns3451_name': ns3451_name,
            })

        return Response({
            'model_id': model_id,
            'consolidated_count': len(results),
            'raw_type_count': IFCType.objects.filter(model_id=model_id).count(),
            'types': results
        })

    @action(detail=False, methods=['post'], url_path='map-consolidated')
    def map_consolidated(self, request):
        """
        Apply mapping to ALL types matching (ifc_type, type_name) at once.

        POST /api/types/types/map-consolidated/
        {
            "model_id": "uuid",
            "ifc_type": "IfcColumnType",
            "type_name": "CFRS 150x150x10",
            "ns3451_code": "234",
            "mapping_status": "mapped",
            "representative_unit": "stk",
            "notes": "Steel columns"
        }

        This finds all IFCType records matching (model_id, ifc_type, type_name)
        and creates/updates TypeMapping for each one.

        Returns:
        {
            "success": true,
            "types_updated": 37,
            "mapping_data": { ... }
        }
        """
        model_id = request.data.get('model_id')
        ifc_type = request.data.get('ifc_type')
        type_name = request.data.get('type_name')

        if not all([model_id, ifc_type, type_name]):
            return Response(
                {'error': 'model_id, ifc_type, and type_name are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Find all matching types
        matching_types = IFCType.objects.filter(
            model_id=model_id,
            ifc_type=ifc_type,
            type_name=type_name
        )

        if not matching_types.exists():
            return Response(
                {'error': f'No types found matching {ifc_type} / {type_name}'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Extract mapping fields from request
        mapping_fields = {}
        for field in ['ns3451_code', 'mapping_status', 'representative_unit', 'notes', 'mapped_by']:
            if field in request.data:
                mapping_fields[field] = request.data[field]

        # Default status to 'mapped' if ns3451_code provided
        if 'ns3451_code' in mapping_fields and mapping_fields['ns3451_code']:
            mapping_fields.setdefault('mapping_status', 'mapped')
            mapping_fields['mapped_at'] = datetime.now()

        # Create/update TypeMapping for each matching type
        updated_count = 0
        created_count = 0

        for ifc_type_obj in matching_types:
            mapping, created = TypeMapping.objects.update_or_create(
                ifc_type=ifc_type_obj,
                defaults=mapping_fields
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        return Response({
            'success': True,
            'types_matched': matching_types.count(),
            'mappings_created': created_count,
            'mappings_updated': updated_count,
            'mapping_data': mapping_fields
        })

    @action(detail=False, methods=['post'], url_path='verify')
    def verify(self, request):
        """
        Run verification engine on all types for a model.

        POST /api/types/verify/?model={id}
        Optional query param: project_id (auto-detected from model if not provided)

        Returns verification summary with per-type issues and health score.
        Updates TypeMapping.verification_status and verification_issues for each type.
        """
        model_id = request.query_params.get('model')
        if not model_id:
            return Response(
                {'error': 'model query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        project_id = request.query_params.get('project_id')

        try:
            from apps.entities.services.verification_engine import VerificationEngine
            engine = VerificationEngine()
            result = engine.verify_model(model_id, project_id=project_id)
            return Response(result.to_dict())
        except Exception as e:
            return Response(
                {'error': f'Verification failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'], url_path='instances')
    def instances(self, request, pk=None):
        """
        Get entity instances for a type (for viewer navigation).

        GET /api/types/{id}/instances/

        Queries the IFC file directly via FastAPI to get instance GUIDs.
        Used by the Instance Viewer to navigate through type instances.
        """
        import httpx
        from django.conf import settings

        ifc_type = self.get_object()

        # Get the model's IFC file URL
        model = ifc_type.model
        if not model.file_url:
            return Response({
                'type_id': str(ifc_type.id),
                'type_name': ifc_type.type_name,
                'type_guid': ifc_type.type_guid,
                'ifc_type': ifc_type.ifc_type,
                'model_id': str(model.id),
                'total_count': 0,
                'instances': [],
                'error': 'No IFC file available for this model'
            })

        # Get FastAPI base URL from settings (matches IFCServiceClient)
        fastapi_url = getattr(settings, 'IFC_SERVICE_URL', 'http://localhost:8001')

        try:
            with httpx.Client(timeout=60.0) as client:
                # Step 1: Load the IFC file into FastAPI (idempotent - returns cached file_id)
                open_response = client.post(
                    f"{fastapi_url}/api/v1/ifc/open/url",
                    json={"file_url": model.file_url}
                )
                open_response.raise_for_status()
                file_id = open_response.json()['file_id']

                # Step 2: Get type instances
                instances_response = client.get(
                    f"{fastapi_url}/api/v1/ifc/{file_id}/types/{ifc_type.type_guid}/instances"
                )
                instances_response.raise_for_status()
                data = instances_response.json()

                return Response({
                    'type_id': str(ifc_type.id),
                    'type_name': ifc_type.type_name,
                    'type_guid': ifc_type.type_guid,
                    'ifc_type': ifc_type.ifc_type,
                    'model_id': str(model.id),
                    'total_count': data['total_count'],
                    'instances': data['instances']
                })

        except httpx.HTTPStatusError as e:
            return Response({
                'type_id': str(ifc_type.id),
                'type_name': ifc_type.type_name,
                'type_guid': ifc_type.type_guid,
                'ifc_type': ifc_type.ifc_type,
                'model_id': str(model.id),
                'total_count': 0,
                'instances': [],
                'error': f'FastAPI error: {e.response.status_code} - {e.response.text}'
            }, status=e.response.status_code)
        except Exception as e:
            return Response({
                'type_id': str(ifc_type.id),
                'type_name': ifc_type.type_name,
                'type_guid': ifc_type.type_guid,
                'ifc_type': ifc_type.ifc_type,
                'model_id': str(model.id),
                'total_count': 0,
                'instances': [],
                'error': f'Failed to query IFC file: {str(e)}'
            }, status=500)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        """
        Export types to Excel template for batch mapping.

        GET /api/types/export-excel/?model={id}

        Returns Excel file with:
        - Editable columns (A-D): NS3451 Code, Unit, Notes, Status
        - Read-only columns (E-R): Type metadata and aggregated properties
        - Rows grouped by IfcEntity
        """
        model_id = request.query_params.get('model')
        if not model_id:
            return Response(
                {'error': 'model parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check model exists and has types
        type_count = IFCType.objects.filter(model_id=model_id).count()
        if type_count == 0:
            return Response(
                {'error': 'No types found for this model'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            # Get model name for filename
            from apps.models.models import Model
            model = Model.objects.filter(id=model_id).first()
            model_name = model.name if model else 'unknown'

            # Generate Excel file
            excel_buffer = export_types_to_excel(model_id)

            # Build filename
            date_str = datetime.now().strftime('%Y-%m-%d')
            filename = f"types_{model_name}_{date_str}.xlsx"
            # Sanitize filename
            filename = "".join(c for c in filename if c.isalnum() or c in '._-')

            # Return as file download
            response = HttpResponse(
                excel_buffer.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response

        except Exception as e:
            return Response(
                {'error': f'Failed to generate Excel: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'], url_path='export-reduzer')
    def export_reduzer(self, request):
        """
        Export types to Reduzer-compatible Excel format for LCA import.

        GET /api/types/types/export-reduzer/?model={id}&include_unmapped=false

        Returns Excel file with Reduzer import format:
        - description: Type name
        - NS3451:2009: Building classification code
        - quantity: Aggregated quantity from instances
        - unit: Unit of measurement (stk, m, m2, m3)
        - component: Discipline or NS3451 category grouping
        - productIDType: Product ID type (EPD, NOBB, etc.)
        - productID: Product/EPD identifier
        - notes: Additional notes

        Only includes types with NS3451 mapping unless include_unmapped=true.
        Types with material layers expand to multiple rows (one per EPD).
        """
        model_id = request.query_params.get('model')
        include_unmapped = request.query_params.get('include_unmapped', 'false').lower() == 'true'

        if not model_id:
            return Response(
                {'error': 'model parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check model exists
        from apps.models.models import Model
        model = Model.objects.filter(id=model_id).first()
        if not model:
            return Response(
                {'error': 'Model not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check for mapped types
        if not include_unmapped:
            mapped_count = IFCType.objects.filter(
                model_id=model_id,
                mapping__ns3451_code__isnull=False
            ).exclude(mapping__ns3451_code='').count()

            if mapped_count == 0:
                return Response(
                    {'error': 'No mapped types found. Map types to NS3451 codes first or use include_unmapped=true'},
                    status=status.HTTP_404_NOT_FOUND
                )

        try:
            # Generate Reduzer Excel file
            excel_buffer = export_types_to_reduzer(model_id, include_unmapped=include_unmapped)

            # Build filename
            date_str = datetime.now().strftime('%Y-%m-%d')
            model_name = model.name if model else 'unknown'
            filename = f"reduzer_{model_name}_{date_str}.xlsx"
            # Sanitize filename
            filename = "".join(c for c in filename if c.isalnum() or c in '._-')

            # Return as file download
            response = HttpResponse(
                excel_buffer.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response

        except Exception as e:
            return Response(
                {'error': f'Failed to generate Reduzer export: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'], url_path='import-excel', parser_classes=[MultiPartParser])
    def import_excel(self, request):
        """
        Import type mappings from Excel file.

        POST /api/types/import-excel/
        Body (multipart/form-data):
        - file: Excel file (.xlsx)
        - model_id: UUID of the model

        Returns:
        {
            "success": true,
            "summary": {"total_rows": 45, "updated": 42, "created": 0, "skipped": 2, "error_count": 1},
            "errors": [{"row": 15, "type_guid": "abc123", "error": "Invalid NS3451 code: 999"}],
            "warnings": [{"row": 8, "type_guid": "def456", "warning": "NS3451 code empty, status set to pending"}]
        }
        """
        file = request.FILES.get('file')
        model_id = request.data.get('model_id')

        if not file:
            return Response(
                {'error': 'file is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not model_id:
            return Response(
                {'error': 'model_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate file type
        if not file.name.endswith('.xlsx'):
            return Response(
                {'error': 'File must be an Excel file (.xlsx)'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check model exists
        type_count = IFCType.objects.filter(model_id=model_id).count()
        if type_count == 0:
            return Response(
                {'error': 'No types found for this model'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            # Read file content
            file_content = BytesIO(file.read())

            # Get username if authenticated
            username = None
            if request.user and request.user.is_authenticated:
                username = request.user.username or request.user.email

            # Import
            result = import_types_from_excel(model_id, file_content, username)

            return Response(result.to_dict())

        except Exception as e:
            return Response(
                {'error': f'Failed to import Excel: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'], url_path='dashboard-metrics')
    def dashboard_metrics(self, request):
        """
        Get dashboard metrics for a project or specific model.

        GET /api/types/dashboard-metrics/?project_id={id}
        GET /api/types/dashboard-metrics/?model_id={id}

        Returns:
        - project_summary: Overall health score, status counts
        - models: Per-model breakdown with health scores
        - by_discipline: Aggregated by discipline (ARK, RIB, etc.)

        Health Score Formula (0-100):
        - Classification score (30%): types with NS3451 code
        - Unit score (15%): types with representative_unit
        - Material score (25%): types with at least 1 material layer with quantity
        - Verification score (30%): types passing verification (no errors)

        Status thresholds:
        - healthy (green): >= 80
        - warning (yellow): >= 50
        - critical (red): < 50
        """
        from django.db.models import Count, Q, Exists, OuterRef
        from apps.models.models import Model

        project_id = request.query_params.get('project_id')
        model_id = request.query_params.get('model_id')

        if not project_id and not model_id:
            return Response(
                {'error': 'project_id or model_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        def calculate_health_score(types_qs):
            """Calculate health score for a queryset of types."""
            total = types_qs.count()
            if total == 0:
                return {
                    'total': 0,
                    'health_score': 0,
                    'status': 'critical',
                    'classification_score': 0,
                    'unit_score': 0,
                    'material_score': 0,
                    'verification_score': 0,
                    'verification_passed': 0,
                    'verification_warning': 0,
                    'verification_failed': 0,
                    'verification_pending': 0,
                }

            # Classification score (30%): types with NS3451 code
            with_ns3451 = types_qs.filter(
                mapping__ns3451_code__isnull=False
            ).exclude(mapping__ns3451_code='').count()
            classification_score = (with_ns3451 / total) * 100

            # Unit score (15%): types with representative_unit
            with_unit = types_qs.filter(
                mapping__representative_unit__isnull=False
            ).exclude(mapping__representative_unit='').count()
            unit_score = (with_unit / total) * 100

            # Material score (25%): types with at least 1 material layer with quantity > 0
            has_material_layer = TypeDefinitionLayer.objects.filter(
                type_mapping=OuterRef('mapping'),
                quantity_per_unit__gt=0
            )
            with_materials = types_qs.filter(
                mapping__isnull=False
            ).annotate(
                has_layers=Exists(has_material_layer)
            ).filter(has_layers=True).count()
            material_score = (with_materials / total) * 100

            # Verification score (30%): types with no verification errors
            # verification_status: pending, auto (engine-checked), verified (human), flagged (errors)
            verified_ok = types_qs.filter(
                mapping__verification_status__in=['auto', 'verified']
            ).exclude(
                mapping__verification_status='flagged'
            ).count()
            verification_failed = types_qs.filter(
                mapping__verification_status='flagged'
            ).count()
            verification_pending = types_qs.filter(
                Q(mapping__verification_status='pending') | Q(mapping__isnull=True)
            ).count()
            # For score: only count non-pending types (verified types / checked types)
            checked = total - verification_pending
            verification_score = (verified_ok / checked * 100) if checked > 0 else 0

            # Composite health score
            health_score = round(
                classification_score * 0.30 +
                unit_score * 0.15 +
                material_score * 0.25 +
                verification_score * 0.30,
                1
            )

            # Status threshold
            if health_score >= 80:
                health_status = 'healthy'
            elif health_score >= 50:
                health_status = 'warning'
            else:
                health_status = 'critical'

            return {
                'total_types': total,
                'health_score': health_score,
                'status': health_status,
                'classification_percent': round(classification_score, 1),
                'unit_percent': round(unit_score, 1),
                'material_percent': round(material_score, 1),
                'verification_percent': round(verification_score, 1),
                'verification_passed': verified_ok,
                'verification_warning': 0,  # counted via issues, not status
                'verification_failed': verification_failed,
                'verification_pending': verification_pending,
            }

        def get_status_counts(types_qs):
            """Get mapping status counts."""
            total = types_qs.count()
            mapped = types_qs.filter(mapping__mapping_status='mapped').count()
            pending = types_qs.filter(
                Q(mapping__mapping_status='pending') | Q(mapping__isnull=True)
            ).count()
            ignored = types_qs.filter(mapping__mapping_status='ignored').count()
            review = types_qs.filter(mapping__mapping_status='review').count()
            followup = types_qs.filter(mapping__mapping_status='followup').count()

            return {
                'total': total,
                'mapped': mapped,
                'pending': pending,
                'ignored': ignored,
                'review': review,
                'followup': followup,
                'progress_percent': round((mapped / total * 100) if total > 0 else 0, 1),
            }

        # Single model mode
        if model_id:
            types_qs = IFCType.objects.filter(model_id=model_id, instance_count__gt=0)
            model = Model.objects.filter(id=model_id).first()

            if not model:
                return Response({'error': 'Model not found'}, status=status.HTTP_404_NOT_FOUND)

            health = calculate_health_score(types_qs)
            counts = get_status_counts(types_qs)

            return Response({
                'mode': 'model',
                'model_id': model_id,
                'model_name': model.name,
                **health,
                **counts,
            })

        # Project mode - aggregate across all models
        models = Model.objects.filter(project_id=project_id)
        if not models.exists():
            return Response({'error': 'No models found for this project'}, status=status.HTTP_404_NOT_FOUND)

        # Project-level aggregation
        all_types = IFCType.objects.filter(
            model__project_id=project_id,
            instance_count__gt=0
        )
        project_health = calculate_health_score(all_types)
        project_counts = get_status_counts(all_types)

        # Per-model breakdown
        model_breakdown = []
        for model in models:
            model_types = IFCType.objects.filter(model=model, instance_count__gt=0)
            if model_types.count() == 0:
                continue  # Skip models with no types

            m_health = calculate_health_score(model_types)
            m_counts = get_status_counts(model_types)

            # Get discipline from model name or mapping
            discipline = None
            if model.name:
                # Try to extract discipline from model name (e.g., "ARK_Model.ifc")
                for disc in ['ARK', 'RIB', 'RIV', 'RIE', 'RIBE', 'RIRV']:
                    if disc in model.name.upper():
                        discipline = disc
                        break

            model_breakdown.append({
                'id': str(model.id),
                'name': model.name,
                'discipline': discipline,
                'total_types': m_health['total_types'],
                'mapped': m_counts['mapped'],
                'pending': m_counts['pending'],
                'ignored': m_counts['ignored'],
                'review': m_counts['review'],
                'followup': m_counts['followup'],
                'health_score': m_health['health_score'],
                'status': m_health['status'],
            })

        # Sort by health score (worst first for attention)
        model_breakdown.sort(key=lambda x: x['health_score'])

        # By discipline aggregation
        by_discipline = {}
        for model_data in model_breakdown:
            disc = model_data['discipline'] or 'Unknown'
            if disc not in by_discipline:
                by_discipline[disc] = {
                    'total': 0,
                    'mapped': 0,
                    'model_count': 0,
                    'health_scores': [],
                }
            by_discipline[disc]['total'] += model_data['total_types']
            by_discipline[disc]['mapped'] += model_data['mapped']
            by_discipline[disc]['model_count'] += 1
            by_discipline[disc]['health_scores'].append(model_data['health_score'])

        # Calculate average health score per discipline
        for disc, data in by_discipline.items():
            if data['health_scores']:
                data['health_score'] = round(
                    sum(data['health_scores']) / len(data['health_scores']), 1
                )
            else:
                data['health_score'] = 0
            del data['health_scores']

        return Response({
            'mode': 'project',
            'project_id': project_id,
            'project_summary': {
                **project_health,
                **project_counts,
            },
            'models': model_breakdown,
            'by_discipline': by_discipline,
        })


class TypeMappingViewSet(viewsets.ModelViewSet):
    """
    API endpoint for type -> NS3451 mappings.

    GET /api/type-mappings/?ifc_type__model={id} - List mappings for a model
    POST /api/type-mappings/ - Create mapping
    PATCH /api/type-mappings/{id}/ - Update mapping (ns3451_code, status)
    DELETE /api/type-mappings/{id}/ - Delete mapping

    To map a type:
    1. Find or create TypeMapping for the IFCType
    2. PATCH with ns3451_code and mapping_status='mapped'
    """
    queryset = TypeMapping.objects.select_related('ifc_type', 'ns3451').all()
    serializer_class = TypeMappingSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['ifc_type', 'ifc_type__model', 'mapping_status', 'ns3451_code']
    ordering = ['-updated_at']

    def perform_update(self, serializer):
        """Set mapped_at timestamp when status changes to mapped."""
        instance = serializer.save()
        if instance.mapping_status == 'mapped' and not instance.mapped_at:
            instance.mapped_at = datetime.now()
            instance.save(update_fields=['mapped_at'])

    @action(detail=False, methods=['post'], url_path='bulk-update')
    def bulk_update(self, request):
        """
        Bulk update multiple type mappings (batch classification).

        POST /api/types/type-mappings/bulk-update/
        Body: {
            "mappings": [
                {
                    "ifc_type_id": "uuid",
                    "ns3451_code": "222",
                    "representative_unit": "m2",
                    "discipline": "ARK",
                    "notes": "Exterior bearing wall",
                    "mapping_status": "mapped"
                },
                ...
            ]
        }

        All fields except ifc_type_id are optional. Only provided fields are updated.
        If ns3451_code is set and mapping_status is omitted, status defaults to "mapped".
        """
        mappings_data = request.data.get('mappings', [])
        if not mappings_data:
            return Response({'error': 'mappings array is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Allowed fields for update
        ALLOWED_FIELDS = {
            'ns3451_code', 'representative_unit', 'discipline',
            'type_category', 'notes', 'mapping_status', 'confidence',
        }

        updated = 0
        created = 0
        errors = []

        for item in mappings_data:
            ifc_type_id = item.get('ifc_type_id')
            if not ifc_type_id:
                errors.append({'ifc_type_id': None, 'error': 'ifc_type_id is required'})
                continue

            # Build defaults dict from provided fields only
            defaults = {}
            for field in ALLOWED_FIELDS:
                if field in item:
                    defaults[field] = item[field]

            # If ns3451_code provided, also set the FK
            if 'ns3451_code' in defaults:
                defaults['ns3451_id'] = defaults['ns3451_code']

            # Auto-set status to mapped if classification provided but status omitted
            if 'ns3451_code' in defaults and 'mapping_status' not in defaults:
                defaults['mapping_status'] = 'mapped'

            # Set mapped_at timestamp
            if defaults.get('mapping_status') == 'mapped':
                defaults['mapped_at'] = datetime.now()

            try:
                mapping, was_created = TypeMapping.objects.update_or_create(
                    ifc_type_id=ifc_type_id,
                    defaults=defaults,
                )
                if was_created:
                    created += 1
                else:
                    updated += 1
            except Exception as e:
                errors.append({'ifc_type_id': str(ifc_type_id), 'error': str(e)})

        return Response({
            'created': created,
            'updated': updated,
            'error_count': len(errors),
            'errors': errors,
        })


class TypeDefinitionLayerViewSet(viewsets.ModelViewSet):
    """
    API endpoint for type definition layers (material composition).

    GET /api/type-definition-layers/?type_mapping={id} - List layers for a type mapping
    POST /api/type-definition-layers/ - Create layer
    PATCH /api/type-definition-layers/{id}/ - Update layer
    DELETE /api/type-definition-layers/{id}/ - Delete layer

    POST /api/type-definition-layers/bulk-update/ - Bulk create/update layers for a type

    Layers define the material composition of a type (e.g., wall layers:
    exterior cladding, insulation, structure, interior finish).
    """
    queryset = TypeDefinitionLayer.objects.select_related('type_mapping').all()
    serializer_class = TypeDefinitionLayerSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['type_mapping']
    ordering = ['type_mapping', 'layer_order']

    @action(detail=False, methods=['post'], url_path='bulk-update')
    def bulk_update(self, request):
        """
        Bulk create/update layers for a type mapping.

        POST /api/type-definition-layers/bulk-update/
        Body: {
            "type_mapping_id": "uuid",
            "layers": [
                {"layer_order": 1, "material_name": "Gypsum board", "thickness_mm": 12.5, "epd_id": null},
                {"layer_order": 2, "material_name": "Mineral wool", "thickness_mm": 150, "epd_id": "EPD-123"},
                {"layer_order": 3, "material_name": "Brick", "thickness_mm": 108, "epd_id": null}
            ]
        }

        This will:
        1. Delete existing layers for the type mapping
        2. Create new layers from the provided data
        """
        type_mapping_id = request.data.get('type_mapping_id')
        layers_data = request.data.get('layers', [])

        if not type_mapping_id:
            return Response({'error': 'type_mapping_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            type_mapping = TypeMapping.objects.get(id=type_mapping_id)
        except TypeMapping.DoesNotExist:
            return Response({'error': 'TypeMapping not found'}, status=status.HTTP_404_NOT_FOUND)

        # Delete existing layers
        TypeDefinitionLayer.objects.filter(type_mapping=type_mapping).delete()

        # Create new layers
        created_layers = []
        for layer_data in layers_data:
            layer = TypeDefinitionLayer.objects.create(
                type_mapping=type_mapping,
                layer_order=layer_data.get('layer_order', 1),
                material_name=layer_data.get('material_name', ''),
                thickness_mm=layer_data.get('thickness_mm', 0),
                epd_id=layer_data.get('epd_id'),
                notes=layer_data.get('notes', ''),
            )
            created_layers.append(TypeDefinitionLayerSerializer(layer).data)

        return Response({
            'type_mapping_id': str(type_mapping_id),
            'layers': created_layers,
            'count': len(created_layers)
        })
