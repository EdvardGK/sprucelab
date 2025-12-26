"""Pipeline execution engine."""
import io
import sys
import traceback
from pathlib import Path
from typing import Dict, Any, Optional, List
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from .config import get_work_dir
from .api_client import SprucelabClient

console = Console()


class StepResult:
    """Result of a step execution."""

    def __init__(
        self,
        success: bool,
        log: str = "",
        data: Optional[Dict] = None,
        files: Optional[List[str]] = None,
        error: str = ""
    ):
        self.success = success
        self.log = log
        self.data = data or {}
        self.files = files or []
        self.error = error


class BaseStepExecutor:
    """Base class for step executors."""

    def __init__(self, work_dir: Path, config: Dict[str, Any], context: Dict[str, Any]):
        self.work_dir = work_dir
        self.config = config
        self.context = context  # Shared context between steps

    def run(self) -> StepResult:
        """Execute the step. Override in subclasses."""
        raise NotImplementedError


class ScriptStepExecutor(BaseStepExecutor):
    """Execute a script step."""

    def run(self) -> StepResult:
        script_id = self.config.get("script_id")
        parameters = self.config.get("parameters", {})

        # Capture stdout/stderr
        output = io.StringIO()
        old_stdout = sys.stdout
        old_stderr = sys.stderr

        try:
            sys.stdout = output
            sys.stderr = output

            # TODO: Fetch script code from API and execute
            # For now, just log what would happen
            print(f"Would execute script: {script_id}")
            print(f"Parameters: {parameters}")

            return StepResult(
                success=True,
                log=output.getvalue(),
                data={"script_id": script_id}
            )

        except Exception as e:
            return StepResult(
                success=False,
                log=output.getvalue(),
                error=str(e)
            )
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr


class CDESyncStepExecutor(BaseStepExecutor):
    """Execute a CDE sync step."""

    def run(self) -> StepResult:
        cde_type = self.config.get("cde_type", "dalux")
        action = self.config.get("action", "download")
        folder_path = self.config.get("folder_path", "/")
        file_pattern = self.config.get("file_pattern", "*")
        connection_id = self.config.get("connection_id")

        output_lines = []
        output_lines.append(f"CDE Sync: {cde_type}")
        output_lines.append(f"Action: {action}")
        output_lines.append(f"Folder: {folder_path}")
        output_lines.append(f"Pattern: {file_pattern}")

        try:
            # TODO: Implement actual CDE sync
            # For now, simulate the operation
            if action == "download":
                output_lines.append("Downloading files...")
                # In real implementation:
                # - Get credentials from API
                # - Initialize CDE client (Dalux, BIM360)
                # - Download files matching pattern to work_dir
                downloaded_files = []
                output_lines.append(f"Downloaded {len(downloaded_files)} files")

                # Store output files in context for next step
                self.context["downloaded_files"] = downloaded_files

            elif action == "upload":
                output_lines.append("Uploading files...")
                # In real implementation:
                # - Get files from context or config
                # - Upload to CDE
                files_to_upload = self.context.get("output_files", [])
                output_lines.append(f"Would upload {len(files_to_upload)} files")

            return StepResult(
                success=True,
                log="\n".join(output_lines),
                data={"cde_type": cde_type, "action": action}
            )

        except Exception as e:
            return StepResult(
                success=False,
                log="\n".join(output_lines),
                error=str(e)
            )


class FileTransformStepExecutor(BaseStepExecutor):
    """Execute a file transformation step."""

    def run(self) -> StepResult:
        operation = self.config.get("operation", "merge")
        options = self.config.get("options", {})

        output_lines = []
        output_lines.append(f"File Transform: {operation}")

        try:
            if operation == "merge":
                # Merge IFC files
                input_files = self.context.get("downloaded_files", [])
                output_lines.append(f"Merging {len(input_files)} files...")

                # TODO: Use ifcopenshell to merge files
                # merged_file = merge_ifc_files(input_files, self.work_dir)

                output_file = self.work_dir / "merged.ifc"
                output_lines.append(f"Output: {output_file}")

                self.context["output_files"] = [str(output_file)]

            return StepResult(
                success=True,
                log="\n".join(output_lines),
                data={"operation": operation},
                files=self.context.get("output_files", [])
            )

        except Exception as e:
            return StepResult(
                success=False,
                log="\n".join(output_lines),
                error=str(e)
            )


class DistributionStepExecutor(BaseStepExecutor):
    """Execute a distribution step."""

    def run(self) -> StepResult:
        destination = self.config.get("destination", "sprucelab")
        options = self.config.get("options", {})

        output_lines = []
        output_lines.append(f"Distribution: {destination}")

        try:
            files = self.context.get("output_files", [])
            output_lines.append(f"Files to distribute: {len(files)}")

            if destination == "sprucelab":
                # Upload to Sprucelab project
                output_lines.append("Uploading to Sprucelab...")
                # TODO: Implement upload to Sprucelab storage

            elif destination == "cde":
                # Upload to CDE
                output_lines.append("Uploading to CDE...")
                # TODO: Use CDE sync to upload

            return StepResult(
                success=True,
                log="\n".join(output_lines),
                data={"destination": destination, "file_count": len(files)}
            )

        except Exception as e:
            return StepResult(
                success=False,
                log="\n".join(output_lines),
                error=str(e)
            )


# Step type to executor mapping
STEP_EXECUTORS = {
    "script": ScriptStepExecutor,
    "cde_sync": CDESyncStepExecutor,
    "file_transform": FileTransformStepExecutor,
    "distribution": DistributionStepExecutor,
}


class PipelineExecutor:
    """Execute a complete pipeline run."""

    def __init__(self, client: SprucelabClient, run_id: str):
        self.client = client
        self.run_id = run_id
        self.work_dir = get_work_dir(run_id)
        self.context: Dict[str, Any] = {}  # Shared context between steps

    def execute(self):
        """Execute all steps in the pipeline."""
        run = self.client.get_run(self.run_id)
        steps = run.get("step_runs", [])

        console.print(f"\n[bold]Executing pipeline with {len(steps)} steps[/bold]\n")

        all_success = True
        error_message = ""

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:

            for step_run in steps:
                step_id = step_run["step"]
                step_name = step_run["step_name"]
                step_type = step_run["step_type"]

                task = progress.add_task(f"Running: {step_name}", total=None)

                try:
                    # Get step config from the run data
                    step_config = self._get_step_config(run, step_id)

                    # Mark step as started
                    self.client.step_start(self.run_id, step_id)

                    # Execute step
                    result = self._execute_step(step_type, step_config)

                    # Report result
                    status = "success" if result.success else "failed"
                    self.client.step_complete(
                        self.run_id,
                        step_id,
                        status=status,
                        output_log=result.log,
                        result_data=result.data,
                        error_message=result.error,
                        output_files=result.files
                    )

                    if result.success:
                        progress.update(task, description=f"[green]✓ {step_name}[/green]")
                    else:
                        progress.update(task, description=f"[red]✗ {step_name}[/red]")
                        all_success = False
                        error_message = result.error

                        # Check if we should continue
                        if not step_config.get("continue_on_failure", False):
                            console.print(f"\n[red]Step failed: {result.error}[/red]")
                            break

                except Exception as e:
                    progress.update(task, description=f"[red]✗ {step_name}[/red]")
                    error_msg = str(e)
                    console.print(f"\n[red]Step error: {error_msg}[/red]")

                    self.client.step_complete(
                        self.run_id,
                        step_id,
                        status="failed",
                        output_log=traceback.format_exc(),
                        error_message=error_msg
                    )

                    all_success = False
                    error_message = error_msg
                    break

        # Complete the run
        result = self.client.run_complete(self.run_id, error_message=error_message)

        if all_success:
            console.print(f"\n[green]Pipeline completed successfully![/green]")
        else:
            console.print(f"\n[red]Pipeline completed with errors[/red]")

        console.print(f"Status: {result.get('status')}")
        if result.get('duration_ms'):
            console.print(f"Duration: {result['duration_ms']}ms")

    def _get_step_config(self, run: Dict, step_id: str) -> Dict[str, Any]:
        """Get step configuration from run data."""
        # Find the step in the pipeline
        for step_run in run.get("step_runs", []):
            if step_run["step"] == step_id:
                # The full step config should be in the pipeline
                # For now, return basic info
                return {
                    "step_type": step_run["step_type"],
                    "step_name": step_run["step_name"],
                }
        return {}

    def _execute_step(self, step_type: str, config: Dict[str, Any]) -> StepResult:
        """Execute a single step."""
        executor_class = STEP_EXECUTORS.get(step_type)

        if not executor_class:
            return StepResult(
                success=False,
                error=f"Unknown step type: {step_type}"
            )

        executor = executor_class(self.work_dir, config, self.context)
        return executor.run()
