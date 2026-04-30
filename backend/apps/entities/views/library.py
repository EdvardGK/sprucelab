"""
ViewSets for the Three-Library Architecture: MaterialLibrary, ProductLibrary,
ProductComposition, and GlobalTypeLibrary.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Prefetch
from django_filters.rest_framework import DjangoFilterBackend
from ..models import (
    TypeBankEntry, TypeBankObservation,
    MaterialLibrary, ProductLibrary, ProductComposition,
)
from ..serializers import (
    TypeBankEntrySerializer, TypeBankEntryListSerializer, TypeBankEntryUpdateSerializer,
    MaterialLibrarySerializer, MaterialLibraryListSerializer,
    ProductLibrarySerializer, ProductLibraryListSerializer, ProductCompositionSerializer,
)


class MaterialLibraryViewSet(viewsets.ModelViewSet):
    """
    API endpoint for MaterialLibrary (global canonical materials).

    MaterialLibrary contains Enova EPD material categories with:
    - Physical properties (density, thermal conductivity)
    - EPD data (GWP, Reduzer ProductID)
    - Unit of measurement (m3, m2, m, kg)

    List endpoints:
    GET /api/material-library/ - List all materials (paginated)
    GET /api/material-library/?category=gypsum_standard - Filter by category
    GET /api/material-library/?source=enova - Filter by source
    GET /api/material-library/?search=concrete - Search by name

    Detail endpoints:
    GET /api/material-library/{id}/ - Get material details
    POST /api/material-library/ - Create material
    PATCH /api/material-library/{id}/ - Update material
    DELETE /api/material-library/{id}/ - Delete material

    Actions:
    GET /api/material-library/categories/ - List available categories
    GET /api/material-library/summary/ - Get summary statistics
    """

    queryset = MaterialLibrary.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'source', 'unit', 'reused_status']
    search_fields = ['name', 'category', 'description', 'manufacturer', 'product_name']
    ordering_fields = ['name', 'category', 'gwp_a1_a3', 'density_kg_m3', 'created_at']
    ordering = ['category', 'name']

    def get_serializer_class(self):
        if self.action == 'list':
            return MaterialLibraryListSerializer
        return MaterialLibrarySerializer

    @action(detail=False, methods=['get'], url_path='categories')
    def categories(self, request):
        """
        List all material categories with counts.

        GET /api/material-library/categories/

        Returns list of {category, category_display, count} for populated categories.
        """
        from django.db.models import Count

        categories = MaterialLibrary.objects.values('category').annotate(
            count=Count('id')
        ).order_by('category')

        # Add display names
        category_choices = dict(MaterialLibrary.CATEGORY_CHOICES)
        result = []
        for cat in categories:
            result.append({
                'category': cat['category'],
                'category_display': category_choices.get(cat['category'], cat['category']),
                'count': cat['count'],
            })

        # Also include empty categories (for reference)
        populated_categories = {cat['category'] for cat in categories}
        for code, display in MaterialLibrary.CATEGORY_CHOICES:
            if code not in populated_categories:
                result.append({
                    'category': code,
                    'category_display': display,
                    'count': 0,
                })

        return Response(sorted(result, key=lambda x: x['category']))

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Get MaterialLibrary summary statistics.

        GET /api/material-library/summary/

        Returns:
        - total: Total materials
        - by_source: Count per source
        - by_unit: Count per unit
        - with_epd: Count with Reduzer ProductID
        - with_gwp: Count with GWP data
        """
        total = MaterialLibrary.objects.count()

        by_source = dict(
            MaterialLibrary.objects.filter(source__isnull=False)
            .exclude(source='')
            .values('source')
            .annotate(count=Count('id'))
            .values_list('source', 'count')
        )

        by_unit = dict(
            MaterialLibrary.objects.values('unit')
            .annotate(count=Count('id'))
            .values_list('unit', 'count')
        )

        with_epd = MaterialLibrary.objects.filter(
            reduzer_product_id__isnull=False
        ).exclude(reduzer_product_id='').count()

        with_gwp = MaterialLibrary.objects.filter(
            gwp_a1_a3__isnull=False
        ).count()

        return Response({
            'total': total,
            'by_source': by_source,
            'by_unit': by_unit,
            'with_epd': with_epd,
            'with_gwp': with_gwp,
            'epd_coverage_percent': round((with_epd / total * 100) if total > 0 else 0, 1),
        })


class ProductLibraryViewSet(viewsets.ModelViewSet):
    """
    API endpoint for ProductLibrary (discrete components).

    ProductLibrary contains products (windows, doors, fixtures) that are:
    - Counted in pieces (pcs/stk), not quantity (m3, m2, kg)
    - Either homogeneous (single material) or composite (multiple materials)
    - Linked to manufacturer specs, dimensions, datasheets

    List endpoints:
    GET /api/product-library/ - List all products (paginated)
    GET /api/product-library/?category=window - Filter by category
    GET /api/product-library/?manufacturer=Velux - Filter by manufacturer
    GET /api/product-library/?is_composite=true - Filter composite products
    GET /api/product-library/?search=skylight - Search by name

    Detail endpoints:
    GET /api/product-library/{id}/ - Get product details with compositions
    POST /api/product-library/ - Create product
    PATCH /api/product-library/{id}/ - Update product
    DELETE /api/product-library/{id}/ - Delete product

    Composition actions:
    GET /api/product-library/{id}/compositions/ - Get material composition
    POST /api/product-library/{id}/compositions/ - Add material to composition
    POST /api/product-library/{id}/set-compositions/ - Replace all compositions
    """

    queryset = ProductLibrary.objects.annotate(
        _composition_count=Count('compositions')
    ).all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'manufacturer', 'is_composite', 'material_category', 'reused_status']
    search_fields = ['name', 'category', 'manufacturer', 'product_code', 'description']
    ordering_fields = ['name', 'category', 'manufacturer', 'created_at']
    ordering = ['category', 'name']

    def get_serializer_class(self):
        if self.action == 'list':
            return ProductLibraryListSerializer
        return ProductLibrarySerializer

    @action(detail=True, methods=['get'], url_path='compositions')
    def compositions(self, request, pk=None):
        """
        Get material compositions for a product.

        GET /api/product-library/{id}/compositions/

        Returns list of ProductComposition entries for this product.
        """
        product = self.get_object()
        compositions = ProductComposition.objects.filter(
            product=product
        ).select_related('material').order_by('layer_order')

        serializer = ProductCompositionSerializer(compositions, many=True)
        return Response({
            'product_id': str(product.id),
            'product_name': product.name,
            'is_composite': product.is_composite,
            'compositions': serializer.data,
        })

    @action(detail=True, methods=['post'], url_path='set-compositions')
    def set_compositions(self, request, pk=None):
        """
        Replace all compositions for a product.

        POST /api/product-library/{id}/set-compositions/
        Body: {
            "compositions": [
                {"material_id": "uuid", "quantity": 1.5, "unit": "kg", "layer_order": 1},
                {"material_id": "uuid", "quantity": 0.5, "unit": "m2", "layer_order": 2}
            ]
        }

        This will:
        1. Delete existing compositions
        2. Create new compositions from provided data
        3. Auto-set is_composite=True if multiple compositions
        """
        product = self.get_object()
        compositions_data = request.data.get('compositions', [])

        # Delete existing compositions
        ProductComposition.objects.filter(product=product).delete()

        # Create new compositions
        created = []
        for i, comp_data in enumerate(compositions_data):
            material_id = comp_data.get('material_id')
            if not material_id:
                continue

            try:
                material = MaterialLibrary.objects.get(id=material_id)
            except MaterialLibrary.DoesNotExist:
                continue

            comp = ProductComposition.objects.create(
                product=product,
                material=material,
                quantity=comp_data.get('quantity', 1.0),
                unit=comp_data.get('unit', 'kg'),
                layer_order=comp_data.get('layer_order', i + 1),
                notes=comp_data.get('notes', ''),
            )
            created.append(comp)

        # Update is_composite flag
        product.is_composite = len(created) > 1
        product.save(update_fields=['is_composite'])

        serializer = ProductCompositionSerializer(created, many=True)
        return Response({
            'product_id': str(product.id),
            'product_name': product.name,
            'is_composite': product.is_composite,
            'compositions': serializer.data,
            'created_count': len(created),
        })

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Get ProductLibrary summary statistics.

        GET /api/product-library/summary/

        Returns:
        - total: Total products
        - by_category: Count per category
        - composite: Count of composite products
        - with_compositions: Count with material compositions defined
        """
        total = ProductLibrary.objects.count()

        by_category = dict(
            ProductLibrary.objects.filter(category__isnull=False)
            .exclude(category='')
            .values('category')
            .annotate(count=Count('id'))
            .values_list('category', 'count')
        )

        composite = ProductLibrary.objects.filter(is_composite=True).count()

        with_compositions = ProductLibrary.objects.annotate(
            comp_count=Count('compositions')
        ).filter(comp_count__gt=0).count()

        return Response({
            'total': total,
            'by_category': by_category,
            'composite': composite,
            'homogeneous': total - composite,
            'with_compositions': with_compositions,
        })


class ProductCompositionViewSet(viewsets.ModelViewSet):
    """
    API endpoint for ProductComposition (product -> material links).

    GET /api/product-compositions/?product={id} - Get compositions for a product
    POST /api/product-compositions/ - Add material to product
    PATCH /api/product-compositions/{id}/ - Update composition
    DELETE /api/product-compositions/{id}/ - Remove material from product
    """

    queryset = ProductComposition.objects.select_related('product', 'material').all()
    serializer_class = ProductCompositionSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['product', 'material']
    ordering = ['product', 'layer_order']


class GlobalTypeLibraryViewSet(viewsets.ModelViewSet):
    """
    Global Type Library API - Unified, type-centric view of all types across models.

    This is the PRIMARY interface for the Type Library UI, providing:
    - Global-first view of all types (not per-model)
    - Three-tier verification status (pending -> auto -> verified/flagged)
    - Filtering by project, model, IFC class, discipline, verification status
    - Empty types detection (types with 0 instances)
    - Verify and flag actions (human-only status changes)

    List endpoints:
    GET /api/type-library/ - All types (paginated)
    GET /api/type-library/?verification_status=pending - Filter by verification
    GET /api/type-library/?project_id={id} - Filter by project
    GET /api/type-library/?model_id={id} - Filter by model
    GET /api/type-library/?ifc_class=IfcWallType - Filter by IFC class
    GET /api/type-library/?has_materials=true - Only types with material layers

    Actions:
    GET /api/type-library/unified-summary/ - Dashboard stats with verification breakdown
    GET /api/type-library/empty-types/ - Types with instance_count=0
    POST /api/type-library/{id}/verify/ - Human verify (-> green)
    POST /api/type-library/{id}/flag/ - Human flag (-> red)
    POST /api/type-library/{id}/reset-verification/ - Reset to pending
    """

    queryset = TypeBankEntry.objects.select_related('ns3451', 'semantic_type').annotate(
        _observation_count=Count('observations')
    ).all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'ifc_class', 'mapping_status', 'verification_status',
        'ns3451_code', 'discipline', 'confidence'
    ]
    search_fields = ['type_name', 'canonical_name', 'material', 'ifc_class']
    ordering_fields = [
        'ifc_class', 'type_name', 'total_instance_count', 'source_model_count',
        'verification_status', 'verified_at', 'updated_at'
    ]
    ordering = ['ifc_class', 'type_name']

    def get_serializer_class(self):
        if self.action == 'list':
            return TypeBankEntryListSerializer
        elif self.action in ['update', 'partial_update']:
            return TypeBankEntryUpdateSerializer
        return TypeBankEntrySerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by project_id (types observed in this project)
        project_id = self.request.query_params.get('project_id')
        if project_id:
            queryset = queryset.filter(
                observations__source_model__project_id=project_id
            ).distinct()

        # Filter by model_id (types observed in this model)
        model_id = self.request.query_params.get('model_id')
        if model_id:
            queryset = queryset.filter(
                observations__source_model_id=model_id
            ).distinct()

        # Filter by has_materials (types with TypeDefinitionLayer entries)
        has_materials = self.request.query_params.get('has_materials')
        if has_materials == 'true':
            # Types that have TypeMapping with definition_layers
            queryset = queryset.filter(
                observations__source_type__type_mappings__definition_layers__isnull=False
            ).distinct()
        elif has_materials == 'false':
            queryset = queryset.exclude(
                observations__source_type__type_mappings__definition_layers__isnull=False
            ).distinct()

        # For detail views, prefetch observations and aliases
        if self.action == 'retrieve':
            queryset = queryset.prefetch_related(
                Prefetch('observations', queryset=TypeBankObservation.objects.select_related(
                    'source_model', 'source_model__project', 'source_type'
                ).order_by('-observed_at')),
                'aliases'
            )

        return queryset

    @action(detail=False, methods=['get'], url_path='unified-summary')
    def unified_summary(self, request):
        """
        Get unified Type Library dashboard summary with verification stats.

        GET /api/type-library/unified-summary/
        GET /api/type-library/unified-summary/?project_id={id}
        GET /api/type-library/unified-summary/?model_id={id}

        Returns:
        {
            "total": 1234,
            "by_verification_status": {
                "pending": 100,
                "auto": 200,
                "verified": 800,
                "flagged": 134
            },
            "by_mapping_status": {
                "mapped": 890,
                "pending": 300,
                "ignored": 20,
                "review": 24
            },
            "by_ifc_class": {"IfcWallType": 150, ...},
            "by_discipline": {"ARK": 400, ...},
            "empty_types_count": 42,
            "verification_progress_percent": 64.8
        }
        """
        queryset = self.filter_queryset(self.get_queryset())

        total = queryset.count()

        # By verification status
        by_verification = dict(
            queryset.values('verification_status')
            .annotate(count=Count('id'))
            .values_list('verification_status', 'count')
        )

        # By mapping status
        by_mapping = dict(
            queryset.values('mapping_status')
            .annotate(count=Count('id'))
            .values_list('mapping_status', 'count')
        )

        # By IFC class
        by_class = dict(
            queryset.values('ifc_class')
            .annotate(count=Count('id'))
            .values_list('ifc_class', 'count')
        )

        # By discipline (only for entries with discipline)
        by_discipline = dict(
            queryset.filter(discipline__isnull=False)
            .exclude(discipline='')
            .values('discipline')
            .annotate(count=Count('id'))
            .values_list('discipline', 'count')
        )

        # Empty types (instance_count = 0)
        empty_count = queryset.filter(total_instance_count=0).count()

        # Verification progress (verified / total)
        verified = by_verification.get('verified', 0)
        progress = round((verified / total * 100) if total > 0 else 0, 1)

        return Response({
            'total': total,
            'by_verification_status': by_verification,
            'by_mapping_status': by_mapping,
            'by_ifc_class': by_class,
            'by_discipline': by_discipline,
            'empty_types_count': empty_count,
            'verification_progress_percent': progress,
        })

    @action(detail=False, methods=['get'], url_path='empty-types')
    def empty_types(self, request):
        """
        Get types with instance_count=0 (empty types).

        These are IfcTypeObjects that exist in the model but have no entities
        referencing them -- unused type definitions loaded into the model.

        GET /api/type-library/empty-types/
        GET /api/type-library/empty-types/?project_id={id}
        """
        queryset = self.filter_queryset(self.get_queryset())
        queryset = queryset.filter(total_instance_count=0)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = TypeBankEntryListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = TypeBankEntryListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='verify')
    def verify(self, request, pk=None):
        """
        Human verify a type (set verification_status = 'verified').

        Only human action can set a type to verified (green).

        POST /api/type-library/{id}/verify/
        Body (optional): {"notes": "Verified after reviewing IFC schema"}

        Returns the updated TypeBankEntry.
        """
        from django.utils import timezone

        entry = self.get_object()
        entry.verification_status = 'verified'
        entry.verified_by = request.user if request.user.is_authenticated else None
        entry.verified_at = timezone.now()
        entry.flag_reason = None  # Clear any previous flag reason

        # Optionally update notes
        notes = request.data.get('notes')
        if notes:
            entry.notes = notes

        entry.save()

        serializer = TypeBankEntrySerializer(entry)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='flag')
    def flag(self, request, pk=None):
        """
        Human flag a type (set verification_status = 'flagged').

        Used when a type needs attention or the classification is incorrect.
        Requires a flag_reason.

        POST /api/type-library/{id}/flag/
        Body: {"flag_reason": "NS3451 code incorrect - should be 222.1"}

        Returns the updated TypeBankEntry.
        """
        from django.utils import timezone

        flag_reason = request.data.get('flag_reason')
        if not flag_reason:
            return Response(
                {'error': 'flag_reason is required when flagging a type'},
                status=status.HTTP_400_BAD_REQUEST
            )

        entry = self.get_object()
        entry.verification_status = 'flagged'
        entry.verified_by = request.user if request.user.is_authenticated else None
        entry.verified_at = timezone.now()
        entry.flag_reason = flag_reason

        entry.save()

        serializer = TypeBankEntrySerializer(entry)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='reset-verification')
    def reset_verification(self, request, pk=None):
        """
        Reset verification status to pending.

        Useful when starting fresh or when type has been modified significantly.

        POST /api/type-library/{id}/reset-verification/
        """
        entry = self.get_object()
        entry.verification_status = 'pending'
        entry.verified_by = None
        entry.verified_at = None
        entry.flag_reason = None
        entry.save()

        serializer = TypeBankEntrySerializer(entry)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='set-auto')
    def set_auto(self, request, pk=None):
        """
        Set verification status to auto-classified (for automation/ML).

        This is called by automation systems when they suggest a classification.
        The type should then appear in the "needs review" list for human verification.

        POST /api/type-library/{id}/set-auto/
        Body (optional): {"confidence": 0.85, "source": "ml_classifier_v2"}
        """
        entry = self.get_object()

        # Only allow setting to 'auto' if currently 'pending'
        # Don't override human decisions
        if entry.verification_status not in ['pending', 'auto']:
            return Response(
                {'error': 'Cannot set auto-classified status on types that have been verified or flagged'},
                status=status.HTTP_400_BAD_REQUEST
            )

        entry.verification_status = 'auto'

        # Update confidence if provided
        confidence = request.data.get('confidence')
        if confidence is not None:
            entry.confidence = float(confidence)

        entry.save()

        serializer = TypeBankEntrySerializer(entry)
        return Response(serializer.data)
