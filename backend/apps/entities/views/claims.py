"""
ViewSets for the claim layer (Phase 6, Sprint 6.2).

ClaimViewSet — list + detail + promote/reject/supersede/conflicts actions +
bulk-assign/bulk-resolve/bulk-dismiss.
All mutations support ``?dry_run=true`` so agents can plan-then-execute.
"""
from __future__ import annotations

from django.utils import timezone

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
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


class ClaimViewSet(viewsets.ModelViewSet):
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
      ?assignee=<user_id>      filter by assigned user id
      ?assignee=me             filter by the requesting user
    """
    queryset = Claim.objects.all()
    serializer_class = ClaimSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return ClaimListSerializer
        return ClaimSerializer

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            'POST',
            detail='Claims are emitted by extraction; create via the extractor, not the API.',
        )

    def update(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            'PUT',
            detail='Full-replace not supported on claims; PATCH the specific fields you want to change.',
        )

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            'DELETE',
            detail='Claims cannot be deleted; use reject or bulk-dismiss to mark them as ignored.',
        )

    def get_queryset(self):
        qs = Claim.objects.select_related(
            'source_file', 'document', 'extraction_run', 'scope',
            'promoted_to_config', 'superseded_by', 'assignee',
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

        assignee_q = self.request.query_params.get('assignee')
        if assignee_q:
            if assignee_q == 'me' and self.request.user.is_authenticated:
                qs = qs.filter(assignee=self.request.user)
            else:
                try:
                    qs = qs.filter(assignee_id=int(assignee_q))
                except (ValueError, TypeError):
                    pass

        return qs.order_by('-extracted_at')

    def perform_update(self, serializer):
        """Stamp assigned_at when assignee transitions from null → user."""
        instance = serializer.instance
        new_assignee = serializer.validated_data.get('assignee', instance.assignee)
        if instance.assignee is None and new_assignee is not None:
            serializer.save(assigned_at=timezone.now())
        else:
            serializer.save()

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

    # -------------------------------------------------------------------------
    # Bulk operations
    # -------------------------------------------------------------------------

    @action(detail=False, methods=['post'], url_path='bulk-assign')
    def bulk_assign(self, request):
        """
        POST /api/types/claims/bulk-assign/

        Body: {"claim_ids": ["<uuid>", ...], "assignee_id": <int>|null}
        ?dry_run=true — returns what would change without writing.

        Returns: {"updated": N, "skipped": [{"id": ..., "reason": ...}], "dry_run": bool}
        """
        dry_run = _bool_param(request.query_params.get('dry_run'))
        data = request.data or {}
        claim_ids = data.get('claim_ids') or []
        assignee_id = data.get('assignee_id')  # may be null (unassign)

        if not isinstance(claim_ids, list):
            return Response(
                {'error': "'claim_ids' must be a list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve assignee user
        assignee = None
        if assignee_id is not None:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                assignee = User.objects.get(pk=assignee_id)
            except User.DoesNotExist:
                return Response(
                    {'error': f'User {assignee_id} not found'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        claims = list(Claim.objects.filter(id__in=claim_ids))
        found_ids = {str(c.id) for c in claims}
        skipped = [
            {'id': cid, 'reason': 'not_found'}
            for cid in claim_ids
            if cid not in found_ids
        ]

        updated = len(claims)

        if not dry_run:
            now = timezone.now()
            for claim in claims:
                old_assignee = claim.assignee
                claim.assignee = assignee
                if old_assignee is None and assignee is not None:
                    claim.assigned_at = now
                elif assignee is None:
                    claim.assigned_at = None
            Claim.objects.bulk_update(claims, ['assignee', 'assigned_at'])

        return Response({
            'updated': updated,
            'skipped': skipped,
            'dry_run': dry_run,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='bulk-resolve')
    def bulk_resolve(self, request):
        """
        POST /api/types/claims/bulk-resolve/

        Body: {"claim_ids": ["<uuid>", ...]}
        ?dry_run=true — returns what would change without writing.

        Calls promote_claim() for each unresolved claim.
        Claims not in 'unresolved' status are skipped.

        Returns: {"updated": N, "skipped": [{"id": ..., "reason": ...}], "dry_run": bool}
        """
        dry_run = _bool_param(request.query_params.get('dry_run'))
        data = request.data or {}
        claim_ids = data.get('claim_ids') or []

        if not isinstance(claim_ids, list):
            return Response(
                {'error': "'claim_ids' must be a list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        claims = list(Claim.objects.select_related('source_file').filter(id__in=claim_ids))
        found_ids = {str(c.id) for c in claims}
        skipped = [
            {'id': cid, 'reason': 'not_found'}
            for cid in claim_ids
            if cid not in found_ids
        ]

        updated = 0
        for claim in claims:
            if claim.status != 'unresolved':
                skipped.append({'id': str(claim.id), 'reason': f'already_{claim.status}'})
                continue
            if dry_run:
                updated += 1
            else:
                try:
                    promote_claim(claim, decided_by=request.user, dry_run=False)
                    updated += 1
                except ClaimStateError as exc:
                    skipped.append({'id': str(claim.id), 'reason': str(exc)})

        return Response({
            'updated': updated,
            'skipped': skipped,
            'dry_run': dry_run,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='bulk-dismiss')
    def bulk_dismiss(self, request):
        """
        POST /api/types/claims/bulk-dismiss/

        Body: {"claim_ids": ["<uuid>", ...], "reason": "<string>"}
        ?dry_run=true — returns what would change without writing.
        'reason' is required (mirrors reject_claim contract).

        Returns: {"updated": N, "skipped": [{"id": ..., "reason": ...}], "dry_run": bool}
        """
        dry_run = _bool_param(request.query_params.get('dry_run'))
        data = request.data or {}
        claim_ids = data.get('claim_ids') or []
        reason = (data.get('reason') or '').strip()

        if not isinstance(claim_ids, list):
            return Response(
                {'error': "'claim_ids' must be a list"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not reason:
            return Response(
                {'error': "'reason' is required for bulk-dismiss"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        claims = list(Claim.objects.filter(id__in=claim_ids))
        found_ids = {str(c.id) for c in claims}
        skipped = [
            {'id': cid, 'reason': 'not_found'}
            for cid in claim_ids
            if cid not in found_ids
        ]

        updated = 0
        for claim in claims:
            if claim.status != 'unresolved':
                skipped.append({'id': str(claim.id), 'reason': f'already_{claim.status}'})
                continue
            if dry_run:
                updated += 1
            else:
                try:
                    reject_claim(claim, reason=reason, decided_by=request.user, dry_run=False)
                    updated += 1
                except ClaimStateError as exc:
                    skipped.append({'id': str(claim.id), 'reason': str(exc)})

        return Response({
            'updated': updated,
            'skipped': skipped,
            'dry_run': dry_run,
        }, status=status.HTTP_200_OK)
