"""
Script execution engine.

Executes Python scripts on model data with sandboxing and error handling.
"""
import sys
import io
from datetime import datetime
from typing import Dict, Any, Optional
from django.utils import timezone
from apps.models.models import Model
from apps.scripting.models import Script, ScriptExecution
from .context import build_script_context, get_safe_builtins


def execute_script(
    script_id: str,
    model_id: str,
    parameters: Optional[Dict[str, Any]] = None
) -> ScriptExecution:
    """
    Execute a script on a model.

    Steps:
    1. Create ScriptExecution record (status='queued')
    2. Build script context (model data access)
    3. Execute script code with restricted globals
    4. Capture stdout/stderr
    5. Update ScriptExecution with results (status='success' or 'error')

    Args:
        script_id: UUID of the script to execute
        model_id: UUID of the model to run the script on
        parameters: User-provided parameters (optional)

    Returns:
        ScriptExecution object with results
    """
    # Get script and model objects
    try:
        script = Script.objects.get(id=script_id)
        model = Model.objects.get(id=model_id)
    except (Script.DoesNotExist, Model.DoesNotExist) as e:
        raise ValueError(f"Script or Model not found: {e}")

    parameters = parameters or {}

    # Create execution record
    execution = ScriptExecution.objects.create(
        script=script,
        model=model,
        parameters=parameters,
        status='queued',
    )

    try:
        # Update status to running
        execution.status = 'running'
        execution.started_at = timezone.now()
        execution.save()

        # Build script context
        context = build_script_context(model, parameters)

        # Execute script
        result = run_script_code(
            code=script.code,
            context=context,
            timeout=300  # 5 minutes
        )

        # Update execution with success
        execution.status = 'success'
        execution.output_log = result['output']
        execution.result_data = result['return_value']
        execution.result_files = result.get('files', [])

    except Exception as e:
        # Update execution with error
        execution.status = 'error'
        execution.error_message = str(e)
        execution.output_log = result.get('output', '') if 'result' in locals() else f"Error: {str(e)}"

    finally:
        # Always update completed_at and duration
        execution.completed_at = timezone.now()
        execution.calculate_duration()
        execution.save()

    return execution


def run_script_code(
    code: str,
    context: Dict[str, Any],
    timeout: int = 300
) -> Dict[str, Any]:
    """
    Execute Python code with restricted globals and capture output.

    Args:
        code: Python code to execute
        context: Dictionary with model data and helper functions
        timeout: Maximum execution time in seconds (not implemented yet)

    Returns:
        Dictionary with output and return value

    Security:
    - Restricted builtins (no open, exec, eval, etc.)
    - No __import__ or __builtins__ access
    - Limited to whitelisted modules (numpy, pandas, ifcopenshell)

    TODO: Implement actual timeout mechanism (subprocess or signal)
    TODO: Implement file system access restrictions
    TODO: Implement memory limits
    """
    # Capture stdout/stderr
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = captured_output = io.StringIO()
    sys.stderr = captured_errors = io.StringIO()

    # Build restricted globals
    script_globals = {
        '__builtins__': get_safe_builtins(),
        **context  # Add model data and helper functions
    }

    # Local scope for script execution
    script_locals = {}

    try:
        # Execute the script
        exec(code, script_globals, script_locals)

        # Get return value if script defines a 'result' variable
        return_value = script_locals.get('result', {})

        # Combine output
        output = captured_output.getvalue()
        errors = captured_errors.getvalue()
        if errors:
            output = f"{output}\n\nErrors:\n{errors}"

        return {
            'output': output,
            'return_value': return_value if isinstance(return_value, dict) else {},
            'files': []  # TODO: Implement file storage
        }

    except Exception as e:
        # Capture any exceptions during execution
        output = captured_output.getvalue()
        errors = captured_errors.getvalue()

        error_output = f"{output}\n\nErrors:\n{errors}\n\nException: {str(e)}"

        raise Exception(error_output)

    finally:
        # Restore stdout/stderr
        sys.stdout = old_stdout
        sys.stderr = old_stderr


def validate_script_code(code: str) -> Dict[str, Any]:
    """
    Validate script code before execution.

    Checks:
    - Syntax errors
    - Dangerous imports
    - Dangerous function calls

    Returns:
        Dictionary with validation results

    TODO: Implement AST-based validation to block:
    - import os, import subprocess
    - open(), eval(), exec(), compile()
    - __import__, __builtins__
    """
    try:
        # Check for syntax errors
        compile(code, '<string>', 'exec')

        # Basic string checks (not foolproof, but better than nothing)
        dangerous_keywords = [
            'import os',
            'import sys',
            'import subprocess',
            'import socket',
            '__import__',
            '__builtins__',
            'eval(',
            'exec(',
            'compile(',
            'open(',
        ]

        found_dangerous = []
        for keyword in dangerous_keywords:
            if keyword in code:
                found_dangerous.append(keyword)

        if found_dangerous:
            return {
                'valid': False,
                'errors': [f"Dangerous keyword found: {kw}" for kw in found_dangerous],
                'warnings': []
            }

        return {
            'valid': True,
            'errors': [],
            'warnings': []
        }

    except SyntaxError as e:
        return {
            'valid': False,
            'errors': [f"Syntax error: {str(e)}"],
            'warnings': []
        }
