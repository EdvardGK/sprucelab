"""
Management command to load NS-3451 codes from ifcforge data.

Usage:
    python manage.py load_ns3451_codes
    python manage.py load_ns3451_codes --clear  # Clear existing before loading
"""

import json
from pathlib import Path
from django.core.management.base import BaseCommand
from apps.entities.models import NS3451Code


# Path to ifcforge NS3451 data
IFCFORGE_NS3451_PATH = Path("/home/edkjo/dev/ifcforge/data/output/ns3451_2022_classification.json")


class Command(BaseCommand):
    help = "Load NS-3451:2022 codes from ifcforge classification data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing NS3451 codes before loading",
        )
        parser.add_argument(
            "--file",
            type=str,
            default=str(IFCFORGE_NS3451_PATH),
            help="Path to NS3451 JSON file",
        )

    def handle(self, *args, **options):
        file_path = Path(options["file"])

        if not file_path.exists():
            self.stderr.write(self.style.ERROR(f"File not found: {file_path}"))
            return

        # Load JSON data
        self.stdout.write(f"Loading NS-3451 codes from {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            codes_data = json.load(f)

        if options["clear"]:
            deleted, _ = NS3451Code.objects.all().delete()
            self.stdout.write(f"Cleared {deleted} existing codes")

        # Process codes
        created = 0
        updated = 0
        errors = 0

        for item in codes_data:
            try:
                # Handle code format - can be float (21.0) or int
                raw_code = item.get("Code")
                if raw_code is None:
                    continue

                # Convert to string, removing .0 if present
                if isinstance(raw_code, float):
                    if raw_code == int(raw_code):
                        code = str(int(raw_code))
                    else:
                        code = str(raw_code)
                else:
                    code = str(raw_code)

                name = item.get("Name", "").strip()
                if not name:
                    continue

                # Clean guidance text (remove PDF artifacts)
                guidance = item.get("Guidance")
                if guidance and isinstance(guidance, str):
                    guidance = guidance.replace("(cid:465)", "å").strip()
                elif guidance != guidance:  # NaN check
                    guidance = None

                level = item.get("Level", 3)

                # Calculate parent code
                parent_code = self._get_parent_code(code)

                # Create or update
                obj, was_created = NS3451Code.objects.update_or_create(
                    code=code,
                    defaults={
                        "name": name,
                        "guidance": guidance,
                        "level": level,
                        "parent_code": parent_code,
                    }
                )

                if was_created:
                    created += 1
                else:
                    updated += 1

            except Exception as e:
                errors += 1
                self.stderr.write(f"Error processing {item}: {e}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Done! Created: {created}, Updated: {updated}, Errors: {errors}"
            )
        )
        self.stdout.write(f"Total NS-3451 codes in database: {NS3451Code.objects.count()}")

    def _get_parent_code(self, code: str) -> str | None:
        """
        Get parent code based on hierarchy.

        Examples:
            '222' -> '22'
            '22' -> '2'
            '2' -> None
            '2221' -> '222'
        """
        if len(code) <= 1:
            return None
        return code[:-1]
