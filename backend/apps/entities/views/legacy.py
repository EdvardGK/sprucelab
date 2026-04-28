"""
Legacy ViewSets for processing reports and IFC entities.

These endpoints are deprecated as part of the types-only architecture migration.
Entity data is no longer stored; the viewer fetches properties directly from FastAPI.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from ..models import (
    ProcessingReport, IFCEntity, PropertySet, SpatialHierarchy,
)
from ..serializers import ProcessingReportSerializer, IFCEntitySerializer


class ProcessingReportViewSet(viewsets.ViewSet):
    """
    DEPRECATED compat shim.

    The Phase 2 data foundation replaced ProcessingReport with ExtractionRun.
    Frontend pages still on the old endpoint (/api/types/processing-reports/)
    keep working because we re-shape live ExtractionRun rows into the legacy
    ProcessingReport response schema here. Slated for removal in Phase 2.5
    once the frontend migrates.
    """

    def _qs(self):
        # Local import to avoid circular import at module load.
        from apps.models.models import ExtractionRun
        qs = ExtractionRun.objects.select_related(
            'source_file', 'source_file__project',
        )

        model_id = self.request.query_params.get('model')
        if model_id:
            qs = qs.filter(source_file__derived_models__id=model_id)

        overall_status = self.request.query_params.get('overall_status')
        if overall_status:
            mapping = {'success': 'completed', 'partial': 'completed', 'failed': 'failed'}
            qs = qs.filter(status=mapping.get(overall_status, overall_status))

        catastrophic = self.request.query_params.get('catastrophic_failure')
        if catastrophic is not None:
            want = catastrophic.lower() in ('1', 'true', 'yes')
            qs = qs.filter(status='failed') if want else qs.exclude(status='failed')

        ordering = self.request.query_params.get('ordering', '-started_at')
        if ordering in {'started_at', '-started_at', 'duration_seconds', '-duration_seconds'}:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by('-started_at')

        return qs

    def _shape(self, run):
        """Project an ExtractionRun row back into ProcessingReport's wire shape."""
        sf = run.source_file
        derived = sf.derived_models.first() if sf else None
        qr = run.quality_report or {}
        return {
            'id': str(run.id),
            'model': str(derived.id) if derived else None,
            'model_name': derived.name if derived else None,
            'model_id': str(derived.id) if derived else None,
            'project_id': str(sf.project_id) if sf else None,
            'project_name': sf.project.name if sf and sf.project else None,
            'started_at': run.started_at,
            'completed_at': run.completed_at,
            'duration_seconds': run.duration_seconds,
            'overall_status': (
                'success' if run.status == 'completed'
                else 'failed' if run.status == 'failed'
                else 'partial'
            ),
            'ifc_schema': qr.get('ifc_schema'),
            'file_size_bytes': qr.get('file_size_bytes', 0),
            'stage_results': run.log_entries or [],
            'total_entities_processed': qr.get('total_entities_processed', qr.get('total_elements', 0)),
            'total_entities_skipped': qr.get('total_entities_skipped', 0),
            'total_entities_failed': qr.get('total_entities_failed', 0),
            'errors': [],
            'catastrophic_failure': run.status == 'failed',
            'failure_stage': None,
            'failure_exception': run.error_message if run.status == 'failed' else None,
            'failure_traceback': None,
            'summary': None,
            'verification_data': qr,
        }

    def list(self, request):
        runs = list(self._qs()[:200])
        results = [self._shape(r) for r in runs]
        return Response({'count': len(results), 'next': None, 'previous': None, 'results': results})

    def retrieve(self, request, pk=None):
        from apps.models.models import ExtractionRun
        try:
            run = ExtractionRun.objects.select_related(
                'source_file', 'source_file__project',
            ).get(pk=pk)
        except ExtractionRun.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(self._shape(run))


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
        from ..models import GraphEdge
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

    DEPRECATED: This ViewSet is deprecated as of the types-only architecture migration.
    Entity data is no longer stored in the database. The viewer fetches properties
    directly from FastAPI which queries the IFC file.

    This endpoint may return empty results or stale data.
    Use FastAPI /ifc/{file_id}/elements/by-express-id/{express_id} instead.

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

        GET /api/types/by-express-id/?model={model_id}&express_id={express_id}

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
