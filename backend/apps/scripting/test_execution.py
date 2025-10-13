"""
Test script execution system.

Run this from Django shell to test the script execution engine:

    python manage.py shell
    >>> from apps.scripting.test_execution import test_script_execution
    >>> test_script_execution()
"""
from apps.models.models import Model
from apps.scripting.models import Script
from apps.scripting.services import execute_script


def test_script_execution():
    """
    Test script execution with a simple script.
    """
    print("="*60)
    print("TESTING SCRIPT EXECUTION ENGINE")
    print("="*60)

    # Get first model from database
    model = Model.objects.filter(status='ready').first()

    if not model:
        print("❌ No models found with status='ready'")
        print("Please upload a model first.")
        return

    print(f"\n✅ Found model: {model.name} (ID: {model.id})")
    print(f"   Elements: {model.element_count}")

    # Get first script from database
    script = Script.objects.first()

    if not script:
        print("\n❌ No scripts found in database")
        print("Run: python manage.py load_builtin_scripts")
        return

    print(f"\n✅ Found script: {script.name}")
    print(f"   Category: {script.category}")

    # Execute script
    print(f"\n🚀 Executing script...")

    try:
        execution = execute_script(
            script_id=str(script.id),
            model_id=str(model.id),
            parameters={}
        )

        print(f"\n✅ Execution completed!")
        print(f"   Status: {execution.status}")
        print(f"   Duration: {execution.duration_ms}ms")

        if execution.status == 'success':
            print(f"\n📊 Results:")
            print(f"   {execution.result_data}")

            print(f"\n📝 Output Log:")
            print("   " + "\n   ".join(execution.output_log.split('\n')[:10]))

        else:
            print(f"\n❌ Error:")
            print(f"   {execution.error_message}")

    except Exception as e:
        print(f"\n❌ Execution failed: {str(e)}")

    print("\n" + "="*60)
    print("TEST COMPLETE")
    print("="*60)


def test_all_scripts():
    """
    Test all scripts in the database.
    """
    print("="*60)
    print("TESTING ALL SCRIPTS")
    print("="*60)

    model = Model.objects.filter(status='ready').first()

    if not model:
        print("❌ No models found")
        return

    scripts = Script.objects.all()

    if not scripts:
        print("❌ No scripts found")
        print("Run: python manage.py load_builtin_scripts")
        return

    print(f"\n✅ Found {scripts.count()} scripts")
    print(f"✅ Testing with model: {model.name}\n")

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
                print(f"   Result: {list(execution.result_data.keys())}")
            else:
                print(f"❌ FAILED")
                print(f"   Error: {execution.error_message[:100]}...")

        except Exception as e:
            print(f"❌ EXCEPTION: {str(e)[:100]}...")

    print("\n" + "="*60)
    print("ALL TESTS COMPLETE")
    print("="*60)


if __name__ == '__main__':
    test_script_execution()
