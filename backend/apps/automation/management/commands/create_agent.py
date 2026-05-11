"""
Mint a new AgentRegistration token from the shell.

Usage:
    python manage.py create_agent --name claude-cli --scope admin
    python manage.py create_agent --name nightly-pipeline --scope operator --hostname ci-runner
    python manage.py create_agent --name read-dashboard --scope read_only

Prints the API key once (to stdout) and the agent UUID. The key cannot be
retrieved later — copy it immediately. This is the bootstrap path while
the in-app token-management UI doesn't exist yet.
"""
from __future__ import annotations

import json
import sys

from django.core.management.base import BaseCommand, CommandError

from apps.automation.models import AgentRegistration


class Command(BaseCommand):
    help = 'Create a new agent token (one-time key shown on stdout).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--name', required=True,
            help='Human-readable agent name (e.g. "claude-cli-edkjo").',
        )
        parser.add_argument(
            '--scope', default='operator',
            choices=[c[0] for c in AgentRegistration.SCOPE_CHOICES],
            help='Authorization scope. Defaults to "operator".',
        )
        parser.add_argument(
            '--hostname', default='cli',
            help='Optional hostname tag for audit. Defaults to "cli".',
        )
        parser.add_argument(
            '--json', action='store_true',
            help='Emit a single JSON object on stdout (for piping into config files).',
        )

    def handle(self, *args, **opts):
        name = opts['name']
        scope = opts['scope']
        hostname = opts['hostname']
        json_out = opts['json']

        if AgentRegistration.objects.filter(name=name).exists():
            raise CommandError(
                f'An agent named "{name}" already exists. '
                f'Pick a unique name or delete the existing one first.'
            )

        api_key, api_key_hash = AgentRegistration.generate_api_key()
        agent = AgentRegistration.objects.create(
            name=name,
            hostname=hostname,
            scope=scope,
            api_key_hash=api_key_hash,
        )

        payload = {
            'id': str(agent.id),
            'name': agent.name,
            'scope': agent.scope,
            'api_key': api_key,  # one-time
        }

        if json_out:
            self.stdout.write(json.dumps(payload, indent=2))
            return

        # Human-readable output: key is the load-bearing line. Make it copyable.
        self.stdout.write(self.style.SUCCESS(f'Agent created: {agent.name} (scope: {agent.scope})'))
        self.stdout.write(f'  id:      {agent.id}')
        self.stdout.write('')
        self.stdout.write(self.style.WARNING('  API key (shown ONCE — save it now):'))
        self.stdout.write(f'  {api_key}')
        self.stdout.write('')
        self.stdout.write('Configure the CLI:')
        self.stdout.write(f'  spruce auth register --url <BASE_URL> --token {api_key}')
