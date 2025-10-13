"""
Test Script Execution System

Run this script to test the script execution engine:
    python django-test/test_scripts.py
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.models.models import Model
from apps.scripting.models import Script
from apps.scripting.services import execute_script


def test_single_script():
    """Test executing a single script."""
    print("="*60)
    print("TESTING SINGLE SCRIPT EXECUTION")
    print("="*60)

    # Get first model
    model = Model.objects.filter(status='ready').first()
    if not model:
        print("\n❌ No models found with status='ready'")
        print("Please upload a model first.")
        return

    print(f"\n✅ Found model: {model.name}")
    print(f"   ID: {model.id}")
    print(f"   Elements: {model.element_count}")

    # Get first script
    script = Script.objects.first()
    if not script:
        print("\n❌ No scripts found")
        print("Run: python manage.py load_builtin_scripts")
        return

    print(f"\n✅ Found script: {script.name}")
    print(f"   Category: {script.category}")
    print(f"   ID: {script.id}")

    # Execute
    print(f"\n🚀 Executing script...\n")

    try:
        execution = execute_script(
            script_id=str(script.id),
            model_id=str(model.id),
            parameters={}
        )

        print(f"\n{'='*60}")
        print(f"EXECUTION COMPLETE")
        print(f"{'='*60}")
        print(f"Status: {execution.status}")
        print(f"Duration: {execution.duration_ms}ms")

        if execution.status == 'success':
            print(f"\n📊 Result Data:")
            for key, value in execution.result_data.items():
                if isinstance(value, (list, dict)) and len(str(value)) > 100:
                    print(f"   {key}: [... {len(value)} items ...]")
                else:
                    print(f"   {key}: {value}")

            print(f"\n📝 Output Log:")
            print("-"*60)
            print(execution.output_log)
            print("-"*60)

        else:
            print(f"\n❌ Error:")
            print(execution.error_message)

    except Exception as e:
        print(f"\n❌ Execution failed: {str(e)}")
        import traceback
        traceback.print_exc()


def test_all_scripts():
    """Test all scripts in the database."""
    print("="*60)
    print("TESTING ALL SCRIPTS")
    print("="*60)

    model = Model.objects.filter(status='ready').first()
    if not model:
        print("\n❌ No models found")
        return

    scripts = Script.objects.all()
    if not scripts:
        print("\n❌ No scripts found")
        return

    print(f"\n✅ Found {scripts.count()} scripts")
    print(f"✅ Testing with model: {model.name}")
    print(f"   Elements: {model.element_count}\n")

    results = []

    for i, script in enumerate(scripts, 1):
        print(f"\n[{i}/{scripts.count()}] Testing: {script.name}")
        print("-" * 40)

        try:
            execution = execute_script(
                script_id=str(script.id),
                model_id=str(model.id),
                parameters={}
            )

            if execution.status == 'success':
                print(f"✅ SUCCESS ({execution.duration_ms}ms)")
                result_keys = list(execution.result_data.keys())
                print(f"   Result keys: {result_keys}")
                results.append({
                    'script': script.name,
                    'status': 'success',
                    'duration_ms': execution.duration_ms,
                    'execution_id': str(execution.id)
                })
            else:
                print(f"❌ FAILED")
                error_preview = execution.error_message[:100] + "..." if len(execution.error_message) > 100 else execution.error_message
                print(f"   Error: {error_preview}")
                results.append({
                    'script': script.name,
                    'status': 'error',
                    'error': error_preview
                })

        except Exception as e:
            print(f"❌ EXCEPTION")
            error_msg = str(e)[:100] + "..." if len(str(e)) > 100 else str(e)
            print(f"   Exception: {error_msg}")
            results.append({
                'script': script.name,
                'status': 'exception',
                'error': error_msg
            })

    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    success_count = sum(1 for r in results if r['status'] == 'success')
    fail_count = len(results) - success_count

    print(f"\nTotal scripts: {len(results)}")
    print(f"✅ Successful: {success_count}")
    print(f"❌ Failed: {fail_count}")

    if success_count == len(results):
        print(f"\n🎉 All scripts executed successfully!")

    print("\nResults:")
    for r in results:
        status_icon = "✅" if r['status'] == 'success' else "❌"
        print(f"{status_icon} {r['script']}: {r['status']}")
        if r['status'] == 'success':
            print(f"   Duration: {r['duration_ms']}ms | Execution ID: {r['execution_id']}")


def check_database():
    """Check database for models and scripts."""
    print("="*60)
    print("DATABASE STATUS CHECK")
    print("="*60)

    # Check models
    models = Model.objects.all()
    ready_models = Model.objects.filter(status='ready')

    print(f"\n📦 Models:")
    print(f"   Total: {models.count()}")
    print(f"   Ready: {ready_models.count()}")

    if ready_models.exists():
        for model in ready_models:
            print(f"   - {model.name} ({model.element_count} elements)")

    # Check scripts
    scripts = Script.objects.all()

    print(f"\n📜 Scripts:")
    print(f"   Total: {scripts.count()}")

    if scripts.exists():
        for script in scripts:
            print(f"   - {script.name} ({script.category})")

    # Check executions
    from apps.scripting.models import ScriptExecution
    executions = ScriptExecution.objects.all()
    success_executions = ScriptExecution.objects.filter(status='success')

    print(f"\n🚀 Script Executions:")
    print(f"   Total: {executions.count()}")
    print(f"   Successful: {success_executions.count()}")

    if executions.exists():
        print(f"\n   Recent executions:")
        for execution in executions.order_by('-created_at')[:5]:
            print(f"   - {execution.script.name} on {execution.model.name}: {execution.status}")

    print("\n" + "="*60)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Test script execution system')
    parser.add_argument('--all', action='store_true', help='Test all scripts')
    parser.add_argument('--check', action='store_true', help='Check database status')

    args = parser.parse_args()

    if args.check:
        check_database()
    elif args.all:
        test_all_scripts()
    else:
        test_single_script()
