"""
ViewSets for NS3451 classification codes and semantic types.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from ..models import NS3451Code, SemanticType, SemanticTypeIFCMapping
from ..serializers import (
    NS3451CodeSerializer, SemanticTypeSerializer, SemanticTypeListSerializer,
)


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


class SemanticTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for semantic types (PA0802/IFC normalization reference data).

    GET /api/semantic-types/ - List all active semantic types
    GET /api/semantic-types/{id}/ - Get single semantic type with IFC mappings
    GET /api/semantic-types/?category=A-Structural - Filter by category
    GET /api/semantic-types/?search=beam - Search by name

    Actions:
    GET /api/semantic-types/by-category/ - Get types grouped by category
    GET /api/semantic-types/for-ifc-class/?ifc_class=IfcBeamType - Get types for IFC class
    """
    queryset = SemanticType.objects.filter(is_active=True).prefetch_related('ifc_mappings')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_active', 'canonical_ifc_class']
    search_fields = ['code', 'name_no', 'name_en', 'description']
    ordering = ['category', 'code']

    def get_serializer_class(self):
        if self.action == 'list':
            return SemanticTypeListSerializer
        return SemanticTypeSerializer

    @action(detail=False, methods=['get'], url_path='by-category')
    def by_category(self, request):
        """
        Get semantic types grouped by category.

        GET /api/semantic-types/by-category/

        Returns:
        {
            "A-Structural": [
                {"code": "AB", "name_en": "Beam", ...},
                {"code": "AS", "name_en": "Column", ...}
            ],
            "D-Openings": [...]
        }
        """
        types = self.get_queryset()
        grouped = {}

        for st in types:
            if st.category not in grouped:
                grouped[st.category] = []
            grouped[st.category].append(SemanticTypeListSerializer(st).data)

        return Response(grouped)

    @action(detail=False, methods=['get'], url_path='for-ifc-class')
    def for_ifc_class(self, request):
        """
        Get semantic types that match a given IFC class.

        GET /api/semantic-types/for-ifc-class/?ifc_class=IfcBeamType

        Returns list of matching semantic types with mapping info.
        """
        ifc_class = request.query_params.get('ifc_class')
        if not ifc_class:
            return Response(
                {'error': 'ifc_class query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Normalize IFC class (remove Type suffix)
        normalized_class = ifc_class
        if ifc_class.endswith('Type'):
            normalized_class = ifc_class[:-4]

        # Find mappings for this IFC class
        mappings = SemanticTypeIFCMapping.objects.filter(
            ifc_class__in=[ifc_class, normalized_class]
        ).select_related('semantic_type').order_by('-is_primary', '-confidence_hint')

        result = []
        seen_codes = set()

        for mapping in mappings:
            if mapping.semantic_type.code not in seen_codes:
                result.append({
                    'code': mapping.semantic_type.code,
                    'name_no': mapping.semantic_type.name_no,
                    'name_en': mapping.semantic_type.name_en,
                    'category': mapping.semantic_type.category,
                    'is_primary': mapping.is_primary,
                    'is_common_misuse': mapping.is_common_misuse,
                    'confidence_hint': mapping.confidence_hint,
                    'note': mapping.note,
                })
                seen_codes.add(mapping.semantic_type.code)

        return Response(result)
