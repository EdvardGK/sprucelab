"""
API views for entities app.
"""
from datetime import datetime
from io import BytesIO
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from .models import (
    ProcessingReport, IFCEntity, PropertySet, SpatialHierarchy,
    IFCType, Material, TypeMapping, TypeDefinitionLayer, MaterialMapping, NS3451Code
)
from .serializers import (
    ProcessingReportSerializer, IFCEntitySerializer,
    NS3451CodeSerializer, TypeMappingSerializer, TypeDefinitionLayerSerializer,
    MaterialMappingSerializer, IFCTypeWithMappingSerializer, MaterialWithMappingSerializer
)
from .services.excel_export import export_types_to_excel
from .services.excel_import import import_types_from_excel
from .services.reduzer_export import export_types_to_reduzer


class ProcessingReportViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing processing reports.

    list: Get all processing reports
    retrieve: Get a single processing report

    Filtering:
    - ?model={model_id} - Filter by model
    - ?overall_status=success|partial|failed - Filter by status
    - ?catastrophic_failure=true|false - Filter by catastrophic failures only

    Ordering:
    - ?ordering=-started_at (default: newest first)
    - ?ordering=duration_seconds (sort by duration)
    - ?ordering=total_entities_failed (sort by failure count)
    """
    queryset = ProcessingReport.objects.all()
    serializer_class = ProcessingReportSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['model', 'overall_status', 'catastrophic_failure']
    ordering_fields = ['started_at', 'duration_seconds', 'total_entities_failed']
    ordering = ['-started_at']  # Default: newest first


def get_entity_location(entity):
    """
    Get the full spatial location for an entity.

    Returns dict with:
    - storey_name: Name of the building storey
    - building_name: Name of the building
    - site_name: Name of the site
    - spaces: List of space names the element is in
    """
    location = {
        'storey_name': None,
        'building_name': None,
        'site_name': None,
        'spaces': [],
    }

    if not entity.storey_id:
        return location

    try:
        # Get the storey entity
        storey = IFCEntity.objects.filter(id=entity.storey_id).first()
        if storey:
            location['storey_name'] = storey.name

            # Try to get building and site from SpatialHierarchy
            hierarchy = SpatialHierarchy.objects.filter(
                entity=storey,
                model=entity.model
            ).first()

            if hierarchy and hierarchy.path:
                # Path is array of GUIDs from project to this element
                # Look up each GUID to get names
                path_guids = hierarchy.path

                # Get all entities in the path
                path_entities = IFCEntity.objects.filter(
                    model=entity.model,
                    ifc_guid__in=path_guids
                ).values('ifc_guid', 'ifc_type', 'name')

                # Map GUID to entity data
                guid_to_entity = {e['ifc_guid']: e for e in path_entities}

                for guid in path_guids:
                    if guid in guid_to_entity:
                        ent = guid_to_entity[guid]
                        if ent['ifc_type'] == 'IfcBuilding' or 'Building' in (ent['ifc_type'] or ''):
                            location['building_name'] = ent['name']
                        elif ent['ifc_type'] == 'IfcSite' or 'Site' in (ent['ifc_type'] or ''):
                            location['site_name'] = ent['name']

        # Check for containing spaces (IfcSpace)
        # Look for elements that might contain this entity via IfcRelContainedInSpatialStructure
        # For now, we'll check if there are any IfcSpace entities that reference this element
        # This is done via graph edges if available
        from .models import GraphEdge
        space_edges = GraphEdge.objects.filter(
            model=entity.model,
            target_entity=entity,
            relationship_type='IfcRelContainedInSpatialStructure',
            source_entity__ifc_type='IfcSpace'
        ).select_related('source_entity')

        for edge in space_edges:
            if edge.source_entity.name:
                location['spaces'].append(edge.source_entity.name)

    except Exception as e:
        # Log but don't fail - location is nice-to-have
        print(f"Error getting location for entity {entity.id}: {e}")

    return location


class IFCEntityViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for IFC entities.

    list: Get entities (use ?model={id} to filter by model, ?express_id={id} for specific entity)
    retrieve: Get a single entity with full property sets

    Filtering:
    - ?model={model_id} - Filter by model (required for list)
    - ?express_id={express_id} - Filter by express ID (for viewer selection)
    - ?ifc_type={type} - Filter by IFC type (IfcWall, IfcDoor, etc.)
    - ?ifc_guid={guid} - Filter by IFC GUID
    """
    queryset = IFCEntity.objects.all()
    serializer_class = IFCEntitySerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['model', 'ifc_type', 'ifc_guid', 'express_id']
    ordering_fields = ['ifc_type', 'name']
    ordering = ['ifc_type', 'name']

    def list(self, request, *args, **kwargs):
        """
        List entities with optional filters.
        For selection by express_id, use the get_by_express_id action instead.
        """
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='by-express-id')
    def get_by_express_id(self, request):
        """
        Get an entity by model ID and express ID (for viewer selection).

        GET /api/entities/by-express-id/?model={model_id}&express_id={express_id}

        Note: Express IDs are NOT stored in the database. This endpoint fetches
        all entities for the model and finds the one at the corresponding index.
        """
        model_id = request.query_params.get('model')
        express_id_str = request.query_params.get('express_id')

        if not model_id or not express_id_str:
            return Response({
                'error': 'Both model and express_id are required'
            }, status=400)

        try:
            express_id = int(express_id_str)
        except ValueError:
            return Response({
                'error': 'express_id must be an integer'
            }, status=400)

        # Look up entity by express_id (stored during IFC parsing)
        entity = None
        fallback_used = False
        try:
            entity = IFCEntity.objects.get(model_id=model_id, express_id=express_id)
        except IFCEntity.DoesNotExist:
            # Fallback for models parsed before express_id was stored
            # Just return first entity - accurate selection requires re-parsing
            entity = IFCEntity.objects.filter(model_id=model_id).first()
            fallback_used = True

        if not entity:
            return Response({
                'error': f'No entities found in model'
            }, status=404)

        # Get property sets
        properties = PropertySet.objects.filter(entity=entity)

        # Group properties by Pset name
        psets = {}
        for prop in properties:
            pset_name = prop.pset_name
            if pset_name not in psets:
                psets[pset_name] = []
            psets[pset_name].append({
                'name': prop.property_name,
                'value': prop.property_value,
                'type': prop.property_type,
            })

        # Get full location info
        location = get_entity_location(entity)

        # Build response
        data = {
            'id': str(entity.id),
            'express_id': entity.express_id,
            'ifc_guid': entity.ifc_guid,
            'ifc_type': entity.ifc_type,
            'predefined_type': entity.predefined_type,
            'object_type': entity.object_type,
            'name': entity.name,
            'description': entity.description,
            'model_id': str(entity.model_id),
            'storey_id': str(entity.storey_id) if entity.storey_id else None,
            # Location (resolved names)
            'storey_name': location['storey_name'],
            'building_name': location['building_name'],
            'site_name': location['site_name'],
            'spaces': location['spaces'],
            # Quantities
            'area': entity.area,
            'volume': entity.volume,
            'length': entity.length,
            'height': entity.height,
            'perimeter': entity.perimeter,
            # Property sets (grouped)
            'property_sets': psets,
        }

        # Add warning if fallback was used (model needs re-parsing)
        if fallback_used:
            data['_warning'] = 'Model missing express_id data. Re-parse for accurate element selection.'

        return Response(data)

    def retrieve(self, request, *args, **kwargs):
        """
        Get a single entity with full property sets grouped by Pset name.
        """
        entity = self.get_object()

        # Get all property sets for this entity
        properties = PropertySet.objects.filter(entity=entity)

        # Group properties by Pset name
        psets = {}
        for prop in properties:
            pset_name = prop.pset_name
            if pset_name not in psets:
                psets[pset_name] = []
            psets[pset_name].append({
                'name': prop.property_name,
                'value': prop.property_value,
                'type': prop.property_type,
            })

        # Get full location info
        location = get_entity_location(entity)

        # Build response
        data = {
            'id': str(entity.id),
            'express_id': entity.express_id,
            'ifc_guid': entity.ifc_guid,
            'ifc_type': entity.ifc_type,
            'predefined_type': entity.predefined_type,
            'object_type': entity.object_type,
            'name': entity.name,
            'description': entity.description,
            'model_id': str(entity.model_id),
            'storey_id': str(entity.storey_id) if entity.storey_id else None,
            # Location (resolved names)
            'storey_name': location['storey_name'],
            'building_name': location['building_name'],
            'site_name': location['site_name'],
            'spaces': location['spaces'],
            # Quantities
            'area': entity.area,
            'volume': entity.volume,
            'length': entity.length,
            'height': entity.height,
            'perimeter': entity.perimeter,
            # Property sets (grouped)
            'property_sets': psets,
        }

        return Response(data)


# =============================================================================
# WAREHOUSE VIEWSETS - NS3451, Types, Materials, Mappings
# =============================================================================

class NS3451CodeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for NS-3451 classification codes (reference data).

    GET /api/ns3451-codes/ - List all codes
    GET /api/ns3451-codes/{code}/ - Get single code
    GET /api/ns3451-codes/?level=2 - Filter by hierarchy level
    GET /api/ns3451-codes/?parent_code=22 - Get children of a code
    GET /api/ns3451-codes/?search=betong - Search by name
    GET /api/ns3451-codes/hierarchy/ - Get nested hierarchy tree
    """
    queryset = NS3451Code.objects.all()
    serializer_class = NS3451CodeSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['level', 'parent_code']
    search_fields = ['code', 'name', 'name_en']
    ordering = ['code']

    @action(detail=False, methods=['get'], url_path='hierarchy')
    def hierarchy(self, request):
        """
        Get NS3451 codes as a nested hierarchy tree for cascading selectors.

        GET /api/ns3451-codes/hierarchy/

        Returns nested structure:
        {
            "2": {
                "code": "2",
                "name": "Bygning",
                "children": {
                    "21": {
                        "code": "21",
                        "name": "Grunn og fundamenter",
                        "children": {...}
                    }
                }
            }
        }
        """
        codes = NS3451Code.objects.all().order_by('code')

        # Build nested hierarchy
        hierarchy = {}

        for code_obj in codes:
            code = code_obj.code
            level = code_obj.level

            node = {
                'code': code,
                'name': code_obj.name,
                'name_en': code_obj.name_en,
                'guidance': code_obj.guidance,
                'level': level,
                'children': {}
            }

            if level == 1:
                # Level 1: Top level
                hierarchy[code] = node
            elif level == 2:
                # Level 2: Parent is first digit
                parent_code = code[0]
                if parent_code in hierarchy:
                    hierarchy[parent_code]['children'][code] = node
            elif level == 3:
                # Level 3: Parent is first 2 digits
                parent_l1 = code[0]
                parent_l2 = code[:2]
                if parent_l1 in hierarchy:
                    if parent_l2 in hierarchy[parent_l1]['children']:
                        hierarchy[parent_l1]['children'][parent_l2]['children'][code] = node
            elif level == 4:
                # Level 4: Parent is first 3 digits
                parent_l1 = code[0]
                parent_l2 = code[:2]
                parent_l3 = code[:3]
                if parent_l1 in hierarchy:
                    if parent_l2 in hierarchy[parent_l1]['children']:
                        if parent_l3 in hierarchy[parent_l1]['children'][parent_l2]['children']:
                            hierarchy[parent_l1]['children'][parent_l2]['children'][parent_l3]['children'][code] = node

        return Response(hierarchy)


class IFCTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for IFC types with mapping status.

    GET /api/types/?model={id} - List types for a model (required)
    GET /api/types/{id}/ - Get single type with mapping
    GET /api/types/?model={id}&ifc_type=IfcWallType - Filter by IFC class

    Returns instance_count (how many entities use this type) and
    mapping object (NS3451 code, status, etc.)
    """
    queryset = IFCType.objects.select_related('mapping', 'mapping__ns3451').all()
    serializer_class = IFCTypeWithMappingSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['model', 'ifc_type']
    search_fields = ['type_name', 'ifc_type']
    ordering = ['ifc_type', 'type_name']

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

    @action(detail=True, methods=['get'], url_path='instances')
    def instances(self, request, pk=None):
        """
        Get entity instances for a type (for viewer navigation).

        GET /api/types/{id}/instances/
        GET /api/types/{id}/instances/?limit=50&offset=0

        Returns list of entities assigned to this type with their GUIDs and metadata.
        Used by the Instance Viewer to navigate through type instances.
        """
        ifc_type = self.get_object()

        # Get pagination params
        limit = int(request.query_params.get('limit', 100))
        offset = int(request.query_params.get('offset', 0))

        # Get total count
        total_count = ifc_type.assignments.count()

        # Get entities through TypeAssignment relationship
        entities = IFCEntity.objects.filter(
            type_assignments__type=ifc_type
        ).order_by('name', 'ifc_guid').values(
            'id', 'ifc_guid', 'name', 'ifc_type', 'storey_id'
        )[offset:offset + limit]

        return Response({
            'type_id': str(ifc_type.id),
            'type_name': ifc_type.type_name,
            'type_guid': ifc_type.type_guid,
            'ifc_type': ifc_type.ifc_type,
            'model_id': str(ifc_type.model_id),
            'total_count': total_count,
            'offset': offset,
            'limit': limit,
            'instances': list(entities)
        })

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

        GET /api/entities/types/export-reduzer/?model={id}&include_unmapped=false

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


class TypeMappingViewSet(viewsets.ModelViewSet):
    """
    API endpoint for type → NS3451 mappings.

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
        Bulk update multiple type mappings.

        POST /api/type-mappings/bulk-update/
        Body: {
            "mappings": [
                {"ifc_type_id": "uuid", "ns3451_code": "222", "mapping_status": "mapped"},
                ...
            ]
        }
        """
        mappings_data = request.data.get('mappings', [])
        if not mappings_data:
            return Response({'error': 'mappings array is required'}, status=status.HTTP_400_BAD_REQUEST)

        updated = 0
        created = 0
        errors = []

        for item in mappings_data:
            ifc_type_id = item.get('ifc_type_id')
            ns3451_code = item.get('ns3451_code')
            mapping_status = item.get('mapping_status', 'mapped')

            try:
                mapping, was_created = TypeMapping.objects.update_or_create(
                    ifc_type_id=ifc_type_id,
                    defaults={
                        'ns3451_code': ns3451_code,
                        'ns3451_id': ns3451_code,  # FK uses code as PK
                        'mapping_status': mapping_status,
                        'mapped_at': datetime.now() if mapping_status == 'mapped' else None,
                    }
                )
                if was_created:
                    created += 1
                else:
                    updated += 1
            except Exception as e:
                errors.append({'ifc_type_id': ifc_type_id, 'error': str(e)})

        return Response({
            'created': created,
            'updated': updated,
            'errors': errors
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


class MaterialViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for materials with mapping status.

    GET /api/materials/?model={id} - List materials for a model (required)
    GET /api/materials/{id}/ - Get single material with mapping
    """
    queryset = Material.objects.select_related('mapping').all()
    serializer_class = MaterialWithMappingSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['model', 'category']
    search_fields = ['name', 'category']
    ordering = ['name']

    @action(detail=False, methods=['get'], url_path='summary')
    def mapping_summary(self, request):
        """
        Get mapping summary for a model.

        GET /api/materials/summary/?model={id}
        """
        model_id = request.query_params.get('model')
        if not model_id:
            return Response({'error': 'model parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        materials = Material.objects.filter(model_id=model_id)
        total = materials.count()

        mapped = materials.filter(mapping__mapping_status='mapped').count()
        pending = materials.filter(mapping__mapping_status='pending').count()
        ignored = materials.filter(mapping__mapping_status='ignored').count()
        review = materials.filter(mapping__mapping_status='review').count()
        unmapped = total - (mapped + pending + ignored + review)

        return Response({
            'total': total,
            'mapped': mapped,
            'pending': pending + unmapped,
            'ignored': ignored,
            'review': review,
            'progress_percent': round((mapped / total * 100) if total > 0 else 0, 1)
        })


class MaterialMappingViewSet(viewsets.ModelViewSet):
    """
    API endpoint for material mappings.

    GET /api/material-mappings/?material__model={id} - List mappings for a model
    POST /api/material-mappings/ - Create mapping
    PATCH /api/material-mappings/{id}/ - Update mapping
    DELETE /api/material-mappings/{id}/ - Delete mapping
    """
    queryset = MaterialMapping.objects.select_related('material').all()
    serializer_class = MaterialMappingSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['material', 'material__model', 'mapping_status']
    ordering = ['-updated_at']

    def perform_update(self, serializer):
        """Set mapped_at timestamp when status changes to mapped."""
        instance = serializer.save()
        if instance.mapping_status == 'mapped' and not instance.mapped_at:
            instance.mapped_at = datetime.now()
            instance.save(update_fields=['mapped_at'])
