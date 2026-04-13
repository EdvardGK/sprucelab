from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import UserProfile

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Bootstrap a user by email: set Django staff+superuser flags AND mark "
        "their UserProfile as approved so they can reach the platform immediately. "
        "Used to approve yourself (or any tester) after they've signed up via the "
        "Supabase signup flow."
    )

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True, help='Email of the user to promote.')

    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        users = list(User.objects.filter(email__iexact=email))

        if not users:
            raise CommandError(
                f"No user with email '{email}'. Sign up once via the frontend first, "
                "then re-run this command."
            )
        if len(users) > 1:
            raise CommandError(
                f"Found {len(users)} users with email '{email}'. Resolve duplicates manually."
            )

        user = users[0]
        user_changed = []
        if not user.is_superuser:
            user.is_superuser = True
            user_changed.append('is_superuser')
        if not user.is_staff:
            user.is_staff = True
            user_changed.append('is_staff')
        if user_changed:
            user.save(update_fields=user_changed)

        profile = UserProfile.objects.filter(user=user).first()
        profile_changed = []
        if profile is None:
            self.stdout.write(
                self.style.WARNING(
                    f"User '{email}' has no UserProfile yet. "
                    "This usually means they've authenticated via /api but never "
                    "called a protected endpoint. The profile will be created on "
                    "their next API call and will auto-approve because the user "
                    "is now a superuser."
                )
            )
        else:
            if profile.approval_status != UserProfile.APPROVAL_APPROVED:
                profile.approval_status = UserProfile.APPROVAL_APPROVED
                profile.approved_at = timezone.now()
                profile.approved_by = user
                profile.save(update_fields=[
                    'approval_status', 'approved_at', 'approved_by', 'updated_at',
                ])
                profile_changed = ['approval_status', 'approved_at']

        summary = []
        if user_changed:
            summary.append(f"user: {', '.join(user_changed)}")
        if profile_changed:
            summary.append(f"profile: {', '.join(profile_changed)}")
        if not summary:
            self.stdout.write(
                self.style.SUCCESS(f"{user.email} is already a staff superuser with an approved profile.")
            )
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"Bootstrapped {user.email} (id={user.id}): {' | '.join(summary)}."
            )
        )
