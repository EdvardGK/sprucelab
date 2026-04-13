from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Grant Django superuser + staff flags to an existing user by email. "
        "Used to bootstrap the first staff member after they sign in via Supabase OAuth."
    )

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True, help='Email of the user to promote.')

    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        users = list(User.objects.filter(email__iexact=email))

        if not users:
            raise CommandError(
                f"No user with email '{email}'. Sign in once via the frontend first, "
                "then re-run this command."
            )
        if len(users) > 1:
            raise CommandError(
                f"Found {len(users)} users with email '{email}'. Resolve duplicates manually."
            )

        user = users[0]
        changed = []
        if not user.is_superuser:
            user.is_superuser = True
            changed.append('is_superuser')
        if not user.is_staff:
            user.is_staff = True
            changed.append('is_staff')

        if not changed:
            self.stdout.write(self.style.SUCCESS(f"{user.email} is already a superuser."))
            return

        user.save(update_fields=changed)
        self.stdout.write(
            self.style.SUCCESS(
                f"Promoted {user.email} (id={user.id}): set {', '.join(changed)}."
            )
        )
