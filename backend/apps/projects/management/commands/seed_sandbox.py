"""
Seed the public agent sandbox.

Creates (or refreshes) a single Project named "Sandbox" plus a read-only
AgentRegistration whose token can be published on the /agents marketing page.
Idempotent: safe to re-run. Prints the freshly-minted token once on creation
so the operator can copy it into the public docs.

Usage:
    python manage.py seed_sandbox
    python manage.py seed_sandbox --rotate-token   # mint a new token

The sandbox is intentionally scoped read-only. Writes (file uploads,
classifications, claim promotions) require beta access. The point of the
sandbox is to let an agent confirm Sprucelab's surface is real before its
human asks for an account.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.projects.models import Project
from apps.automation.models import AgentRegistration


SANDBOX_PROJECT_NAME = "Sandbox"
SANDBOX_AGENT_NAME = "public-sandbox"
SANDBOX_AGENT_HOSTNAME = "www.sprucelab.io"
SANDBOX_DESCRIPTION = (
    "Public read-only sandbox project. Token is intentionally public — "
    "use it to confirm Sprucelab's API surface from any agent. Writes are "
    "denied; apply for early access at https://www.sprucelab.io/ for a real "
    "operator token."
)


class Command(BaseCommand):
    help = "Seed (or refresh) the public agent sandbox project + read-only token."

    def add_arguments(self, parser):
        parser.add_argument(
            "--rotate-token",
            action="store_true",
            help="Force-mint a new API key for the sandbox agent.",
        )

    @transaction.atomic
    def handle(self, *args, rotate_token: bool = False, **opts):
        project, project_created = Project.objects.get_or_create(
            name=SANDBOX_PROJECT_NAME,
            defaults={"description": SANDBOX_DESCRIPTION},
        )
        if not project_created and project.description != SANDBOX_DESCRIPTION:
            project.description = SANDBOX_DESCRIPTION
            project.save(update_fields=["description", "updated_at"])

        agent = AgentRegistration.objects.filter(name=SANDBOX_AGENT_NAME).first()
        token: str | None = None
        agent_created = False

        if agent is None:
            token, token_hash = AgentRegistration.generate_api_key()
            agent = AgentRegistration.objects.create(
                name=SANDBOX_AGENT_NAME,
                hostname=SANDBOX_AGENT_HOSTNAME,
                api_key_hash=token_hash,
                scope="read_only",
                capabilities=["sandbox", "discovery"],
                is_active=True,
            )
            agent_created = True
        elif rotate_token:
            token, token_hash = AgentRegistration.generate_api_key()
            agent.api_key_hash = token_hash
            agent.scope = "read_only"
            agent.is_active = True
            agent.save(update_fields=["api_key_hash", "scope", "is_active", "updated_at"])

        # Scope the agent to just the sandbox project (drop any other links).
        agent.projects.set([project])

        self.stdout.write(self.style.SUCCESS(
            f"Sandbox project: {project.id} ({'created' if project_created else 'updated'})"
        ))
        self.stdout.write(self.style.SUCCESS(
            f"Sandbox agent:   {agent.id} ({'created' if agent_created else 'updated'})"
        ))
        if token is not None:
            self.stdout.write(self.style.WARNING(
                f"\nSandbox token (write this down — won't be shown again):\n  {token}\n"
            ))
            self.stdout.write(self.style.HTTP_INFO(
                "Set this token via SPRUCELAB_SANDBOX_TOKEN in the frontend env "
                "to surface it on /agents, or paste it into the docs."
            ))
        else:
            self.stdout.write(self.style.HTTP_INFO(
                "Token unchanged. Pass --rotate-token to mint a new one."
            ))
