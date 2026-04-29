"""
ViewSets for the claim layer (Phase 6, Sprint 6.2).

ClaimViewSet — list + detail + promote/reject/supersede/conflicts actions.
All mutations support ``?dry_run=true`` so agents can plan-then-execute.
"""
from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Claim
from ..serializers import ClaimSerializer, ClaimListSerializer
from ..services.claim_promotion import (
    ClaimStateError,
    find_conflicts,
    promote_claim,
    reject_claim,
    supersede_claim,
)


def _bool_param(value, default=False):
    if value is None:
        return default
    return str(value).lower() in ('1', 'true', 'yes')


class ClaimViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/types/claims/ — extracted normative statements.

    Filters:
      ?project=<uuid>
      ?scope=<uuid>
      ?source_file=<uuid>
      ?document=<uuid>
      ?status=unresolved|promoted|rejected|superseded
      ?claim_type=rule|spec|requirement|constraint|fact
      ?min_confidence=0.7      drop low-confidence noise
    """
    queryset = Claim.objects.all()
    serializer_class = ClaimSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return ClaimListSerializer
        return ClaimSerializer

    def get_queryset(self):
        qs = Claim.objects.select_related(
            'source_file', 'document', 'extraction_run', 'scope',
            'promoted_to_config', 'superseded_by',
        )

        project_id = self.request.query_params.get('project')
        if project_id:
            qs = qs.filter(source_file__project_id=project_id)

        scope_id = self.request.query_params.get('scope')
        if scope_id:
            qs = qs.filter(scope_id=scope_id)

        sf_id = self.request.query_params.get('source_file')
        if sf_id:
            qs = qs.filter(source_file_id=sf_id)

        doc_id = self.request.query_params.get('document')
        if doc_id:
            qs = qs.filter(document_id=doc_id)

        status_q = self.request.query_params.get('status')
        if status_q:
            qs = qs.filter(status=status_q)

        ctype = self.request.query_params.get('claim_type')
        if ctype:
            qs = qs.filter(claim_type=ctype)

        min_conf = self.request.query_params.get('min_confidence')
        if min_conf is not None:
            try:
                qs = qs.filter(confidence__gte=float(min_conf))
            except ValueError:
                pass

        return qs.order_by('-extracted_at')

    @action(detail=True, methods=['post'], url_path='promote')
    def promote(self, request, pk=None):
        """
        Promote a claim into the project's active ProjectConfig.

        Body:
          {"section": "claim_derived_rules", "rule_payload": {...}}
        Both fields optional — section defaults to 'claim_derived_rules',
        rule_payload defaults to the claim's normalized form.

        Query: ?dry_run=true returns the would-be result without persisting.
        """
        claim = self.get_object()
        dry_run = _bool_param(request.query_params.get('dry_run'))
        section = (request.data or {}).get('section')
        rule_payload = (request.data or {}).get('rule_payload')

        try:
            result = promote_claim(
                claim,
                section=section,
                rule_payload=rule_payload,
                decided_by=request.user,
                dry_run=dry_run,
            )
        except ClaimStateError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_409_CONFLICT)

        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """Mark this claim rejected with a reason."""
        claim = self.get_object()
        dry_run = _bool_param(request.query_params.get('dry_run'))
        reason = (request.data or {}).get('reason') or ''
        try:
            result = reject_claim(
                claim, reason=reason, decided_by=request.user, dry_run=dry_run,
            )
        except ClaimStateError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='supersede')
    def supersede(self, request, pk=None):
        """Mark this claim superseded by another claim (must be in the same project)."""
        claim = self.get_object()
        dry_run = _bool_param(request.query_params.get('dry_run'))
        new_id = (request.data or {}).get('superseded_by_claim_id')
        if not new_id:
            return Response(
                {'error': "'superseded_by_claim_id' is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            newer = Claim.objects.select_related('source_file').get(pk=new_id)
        except Claim.DoesNotExist:
            return Response(
                {'error': f'Claim {new_id} not found'},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            result = supersede_claim(
                claim, superseded_by=newer, decided_by=request.user, dry_run=dry_run,
            )
        except ClaimStateError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='conflicts')
    def conflicts(self, request, pk=None):
        """List claims in the same project with the same predicate+subject but a different value."""
        claim = self.get_object()
        rivals = find_conflicts(claim)
        return Response({
            'count': len(rivals),
            'results': ClaimListSerializer(rivals, many=True).data,
        })
