"""
`python manage.py embed_token …` — local-only embed token management.

The same operations are available via HTTP (`/api/embed/tokens/`) for the
spruce CLI; the management command exists so a fresh checkout can mint a
token without first wiring up Supabase auth in the calling environment.

Subcommands:
    create   — issue a new token (raw value printed once)
    list     — list tokens (no raw values)
    revoke   — mark a token revoked
    refresh  — rotate a token (revokes the old, prints the new raw)

All subcommands accept ``--json`` for machine-readable output.
"""
from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from apps.embed.models import EmbedToken
from apps.embed.services import token_service
from apps.projects.models import Project


SUBCOMMANDS = ('create', 'list', 'revoke', 'refresh')


class Command(BaseCommand):
    help = 'Embed-token lifecycle: create / list / revoke / refresh'

    def add_arguments(self, parser):
        sub = parser.add_subparsers(
            dest='subcommand',
            required=True,
            metavar='{create,list,revoke,refresh}',
        )

        # create
        create = sub.add_parser('create', help='Issue a new embed token.')
        create.add_argument('--project', required=True, help='Project UUID')
        create.add_argument('--name', required=True, help='Operator-facing label')
        create.add_argument(
            '--origin',
            action='append',
            default=[],
            metavar='URL',
            required=True,
            help='Allowed parent origin (repeatable, at least one required)',
        )
        create.add_argument(
            '--capability',
            action='append',
            default=None,
            metavar='CAP',
            help='Capability string (repeatable). Defaults to read:instances + read:capabilities + read:dashboards.',
        )
        create.add_argument('--ttl', type=int, default=EmbedToken.DEFAULT_TTL_SECONDS,
                            help=f'Token TTL in seconds (default {EmbedToken.DEFAULT_TTL_SECONDS})')
        create.add_argument('--json', action='store_true', help='JSON output')

        # list
        listc = sub.add_parser('list', help='List tokens (no raw values).')
        listc.add_argument('--project', help='Filter by project UUID')
        listc.add_argument('--include-revoked', action='store_true')
        listc.add_argument('--json', action='store_true')

        # revoke
        revoke = sub.add_parser('revoke', help='Revoke a token by id or 8-char prefix.')
        revoke.add_argument('id_or_prefix', help='Full UUID or 8-char prefix')
        revoke.add_argument('--reason', default='', help='Audit note')
        revoke.add_argument('--json', action='store_true')

        # refresh
        refresh = sub.add_parser('refresh', help='Rotate a token (revokes the old).')
        refresh.add_argument('raw_token', help='The current raw token to rotate')
        refresh.add_argument('--json', action='store_true')

    def handle(self, *args, **options):
        sub = options['subcommand']
        emit_json = options.get('json', False)
        if sub == 'create':
            self._create(options, emit_json)
        elif sub == 'list':
            self._list(options, emit_json)
        elif sub == 'revoke':
            self._revoke(options, emit_json)
        elif sub == 'refresh':
            self._refresh(options, emit_json)
        else:
            raise CommandError(f'unknown subcommand: {sub}')

    # ---- subcommand handlers ----------------------------------------------

    def _create(self, options, emit_json):
        project = self._project(options['project'])
        token, raw = token_service.issue_token(
            name=options['name'],
            project=project,
            allowed_origins=options['origin'],
            capabilities=options['capability'],
            ttl_seconds=options['ttl'],
        )
        record = _serialize(token, include_raw=raw)
        self._emit(record, emit_json)

    def _list(self, options, emit_json):
        project = self._project(options['project']) if options.get('project') else None
        qs = token_service.list_tokens(
            project=project,
            include_revoked=options['include_revoked'],
        )
        rows = [_serialize(t) for t in qs]
        if emit_json:
            self.stdout.write(json.dumps({'count': len(rows), 'results': rows}, indent=2))
        else:
            for row in rows:
                self.stdout.write(
                    f"{row['prefix']}…  {row['name']}  → "
                    f"project={row['project_id']}  "
                    f"caps={','.join(row['capabilities'])}  "
                    f"expires={row['expires_at']}  "
                    f"revoked={row['revoked_at'] or '-'}"
                )

    def _revoke(self, options, emit_json):
        try:
            token = token_service.revoke_token(
                token_id_or_prefix=options['id_or_prefix'],
                reason=options['reason'],
            )
        except token_service.TokenNotFound as e:
            raise CommandError(str(e))
        except token_service.EmbedTokenError as e:
            raise CommandError(str(e))
        self._emit(_serialize(token), emit_json)

    def _refresh(self, options, emit_json):
        try:
            token, raw = token_service.refresh_token(raw_token=options['raw_token'])
        except token_service.TokenNotFound as e:
            raise CommandError(str(e))
        except token_service.TokenInactive as e:
            raise CommandError(str(e))
        self._emit(_serialize(token, include_raw=raw), emit_json)

    # ---- helpers ----------------------------------------------------------

    def _project(self, project_id: str) -> Project:
        project = Project.objects.filter(id=project_id).first()
        if project is None:
            raise CommandError(f'no project with id {project_id!r}')
        return project

    def _emit(self, record: dict, emit_json: bool) -> None:
        if emit_json:
            self.stdout.write(json.dumps(record, indent=2))
        else:
            for k in ('id', 'name', 'project_id', 'prefix',
                      'capabilities', 'allowed_origins', 'ttl_seconds',
                      'expires_at', 'created_at', 'revoked_at',
                      'revoked_reason'):
                if k in record:
                    self.stdout.write(f'{k}: {record[k]}')
            if 'raw_token' in record:
                self.stdout.write(self.style.SUCCESS(
                    f"\nraw_token (shown once): {record['raw_token']}"
                ))


def _serialize(token: EmbedToken, *, include_raw: str | None = None) -> dict:
    payload = {
        'id': str(token.id),
        'name': token.name,
        'project_id': str(token.project_id),
        'prefix': token.prefix,
        'allowed_origins': list(token.allowed_origins or []),
        'capabilities': list(token.capabilities or []),
        'ttl_seconds': token.ttl_seconds,
        'expires_at': token.expires_at.isoformat() if token.expires_at else None,
        'created_at': token.created_at.isoformat() if token.created_at else None,
        'last_used_at': token.last_used_at.isoformat() if token.last_used_at else None,
        'revoked_at': token.revoked_at.isoformat() if token.revoked_at else None,
        'revoked_reason': token.revoked_reason,
    }
    if include_raw is not None:
        payload['raw_token'] = include_raw
    return payload
