"""
Check processing report for a specific model to diagnose failures.

Usage:
    python django-test/check_processing_report.py <model_name>
    python django-test/check_processing_report.py G55_RIE
"""
import os
import sys
import django

# Add backend directory to path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, backend_dir)

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.models.models import Model
from apps.entities.models import ProcessingReport


def check_processing_report(model_name=None):
    """Check processing reports for debugging."""

    print("="*80)
    print("Processing Report Diagnostics")
    print("="*80)
    print()

    if model_name:
        # Check specific model
        models = Model.objects.filter(name=model_name).order_by('-created_at')

        if not models.exists():
            print(f"❌ No models found with name: {model_name}")
            return

        model = models.first()
        print(f"Model: {model.name} (v{model.version_number})")
        print(f"Status: {model.status}")
        print(f"Created: {model.created_at}")
        print()

        # Get processing reports for this model
        reports = ProcessingReport.objects.filter(model=model).order_by('-started_at')

        if not reports.exists():
            print("❌ No processing reports found for this model")
            return

        print(f"Found {reports.count()} processing report(s)")
        print()

        for i, report in enumerate(reports, 1):
            print(f"\n{'='*80}")
            print(f"Report #{i}: {report.id}")
            print(f"{'='*80}")
            print(f"Status: {report.overall_status}")
            print(f"Started: {report.started_at}")
            print(f"Completed: {report.completed_at}")
            print(f"Duration: {report.duration_seconds}s" if report.duration_seconds else "Duration: N/A")
            print(f"IFC Schema: {report.ifc_schema}")
            print(f"File Size: {report.file_size_bytes / (1024*1024):.2f} MB" if report.file_size_bytes else "File Size: N/A")
            print()

            # Show stage results
            if report.stage_results:
                print("Stage Results:")
                print("-"*80)
                for stage in report.stage_results:
                    status_icon = "✅" if stage['status'] == 'success' else "⚠️" if stage['status'] == 'partial' else "❌"
                    print(f"{status_icon} {stage['stage']:20s} | {stage['message']}")
                    if stage.get('errors'):
                        for error in stage['errors'][:3]:  # Show first 3 errors
                            print(f"    ↳ {error}")
                print()

            # Show errors
            if report.errors:
                print(f"Errors ({len(report.errors)}):")
                print("-"*80)

                # Group by severity
                critical = [e for e in report.errors if e.get('severity') == 'critical']
                errors = [e for e in report.errors if e.get('severity') == 'error']
                warnings = [e for e in report.errors if e.get('severity') == 'warning']

                if critical:
                    print(f"❌ CRITICAL ({len(critical)}):")
                    for err in critical[:5]:
                        print(f"   - {err.get('message', 'No message')}")
                        if err.get('element_guid'):
                            print(f"     Element: {err['element_guid']} ({err.get('element_type', 'Unknown')})")
                    print()

                if errors:
                    print(f"❌ ERRORS ({len(errors)}):")
                    for err in errors[:5]:
                        print(f"   - {err.get('message', 'No message')}")
                        if err.get('element_guid'):
                            print(f"     Element: {err['element_guid']} ({err.get('element_type', 'Unknown')})")
                    print()

                if warnings:
                    print(f"⚠️  WARNINGS ({len(warnings)}):")
                    for err in warnings[:5]:
                        print(f"   - {err.get('message', 'No message')}")
                    if len(warnings) > 5:
                        print(f"   ... and {len(warnings) - 5} more warnings")
                    print()

            # Show catastrophic failure details
            if report.catastrophic_failure:
                print("❌ CATASTROPHIC FAILURE")
                print("-"*80)
                print(f"Stage: {report.failure_stage}")
                print(f"Exception: {report.failure_exception}")
                print()
                if report.failure_traceback:
                    print("Traceback:")
                    print(report.failure_traceback)
                print()

            # Show summary
            if report.summary:
                print("Summary:")
                print("-"*80)
                print(report.summary)
                print()

            # Show entity counts
            print("Entity Counts:")
            print("-"*80)
            print(f"Total Processed: {report.total_entities_processed}")
            print(f"Total Skipped: {report.total_entities_skipped}")
            print(f"Total Failed: {report.total_entities_failed}")
            print()

    else:
        # Show all recent failed models
        print("Recent Failed Models:")
        print("-"*80)

        failed_models = Model.objects.filter(status='error').order_by('-created_at')[:10]

        if not failed_models.exists():
            print("✅ No failed models found!")
            return

        for model in failed_models:
            print(f"📄 {model.name} (v{model.version_number})")
            print(f"   Status: {model.status}")
            print(f"   Error: {model.processing_error or 'No error message'}")
            print(f"   Created: {model.created_at}")

            # Get latest report
            report = ProcessingReport.objects.filter(model=model).order_by('-started_at').first()
            if report:
                print(f"   Report: {report.id} ({report.overall_status})")
            print()


if __name__ == '__main__':
    model_name = sys.argv[1] if len(sys.argv) > 1 else None
    check_processing_report(model_name)
