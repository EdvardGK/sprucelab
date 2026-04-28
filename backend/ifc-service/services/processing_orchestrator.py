"""
Processing Orchestrator - Coordinates IFC parsing and database writes.

This is the main entry point for processing IFC files.
It coordinates between:
- IFCParserService (extracts data from IFC file)
- IFCRepository (writes data to database)
"""

import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional, Dict, List
from concurrent.futures import ThreadPoolExecutor

from core.database import get_connection
from services.ifc_parser import IFCParserService, ParseResult, TypesOnlyResult
from repositories.ifc_repository import (
    IFCRepository, EntityData, PropertyData, SpatialData
)


def _length_unit_name(scale: float) -> Optional[str]:
    """Map an ifcopenshell length_unit_scale (factor to meters) to a friendly name."""
    if scale is None:
        return None
    by_name = {
        'mm': 0.001,
        'cm': 0.01,
        'm': 1.0,
        'km': 1000.0,
        'in': 0.0254,
        'ft': 0.3048,
    }
    for name, factor in by_name.items():
        if abs(scale - factor) < 1e-6:
            return name
    return None


@dataclass
class ProcessingResult:
    """Result of processing an IFC file."""
    success: bool = False
    model_id: str = ""
    status: str = "failed"  # 'parsing', 'parsed', 'ready', 'error'

    # Counts
    element_count: int = 0
    storey_count: int = 0
    system_count: int = 0
    property_count: int = 0
    material_count: int = 0
    type_count: int = 0

    # Processing info
    ifc_schema: Optional[str] = None
    extraction_run_id: Optional[str] = None
    duration_seconds: float = 0.0
    error: Optional[str] = None

    # Stage results for detailed reporting
    stage_results: List[Dict] = field(default_factory=list)
    errors: List[Dict] = field(default_factory=list)


class ProcessingOrchestrator:
    """
    Orchestrates IFC file processing.

    Flow:
    1. Update model status to 'parsing'
    2. Parse IFC file (extract all metadata)
    3. Write spatial hierarchy (creates storey entities first)
    4. Write materials, types, systems
    5. Write elements (with storey references)
    6. Write properties (with entity references)
    7. Update model status to 'ready'
    8. Create processing report
    """

    def __init__(
        self,
        parser: Optional[IFCParserService] = None,
        repository: Optional[IFCRepository] = None,
    ):
        self.parser = parser or IFCParserService()
        self.repository = repository or IFCRepository()
        self._executor = ThreadPoolExecutor(max_workers=2)

    async def process_model_types_only(
        self,
        model_id: str,
        file_path: str,
        source_file_id: Optional[str] = None,
        extraction_run_id: Optional[str] = None,
    ) -> ProcessingResult:
        """
        Simplified processing - types only, no entity storage.

        This is the new architecture where we only store types in the database.
        Properties and entity details are queried directly from IFC when needed.

        Flow:
        1. Update model status to 'parsing'
        2. Parse types only (fast - ~2 seconds)
        3. Write materials
        4. Write types (with instance_count)
        5. Link types to TypeBank
        6. Write systems
        7. Update model status to 'ready'
        8. Create processing report

        Args:
            model_id: UUID of the Model record in Django database
            file_path: Path to the IFC file

        Returns:
            ProcessingResult with counts and status
        """
        result = ProcessingResult(model_id=model_id)
        start_time = time.time()

        # Resolve / create the ExtractionRun for this run.
        run_id = await self._resolve_extraction_run(
            model_id=model_id,
            source_file_id=source_file_id,
            extraction_run_id=extraction_run_id,
        )
        if run_id:
            await self.repository.update_extraction_run(run_id, status='running')

        try:
            # ==================== Update Status: Parsing ====================
            print(f"\n[Orchestrator] Processing model {model_id} (types-only mode)")
            print(f"[Orchestrator] File: {file_path}")

            await self.repository.update_model_status(
                model_id,
                status='processing',
                parsing_status='parsing',
            )

            # ==================== Parse Types Only ====================
            # Run parser in thread pool since ifcopenshell is blocking
            loop = __import__('asyncio').get_event_loop()
            parse_result: TypesOnlyResult = await loop.run_in_executor(
                self._executor,
                self.parser.parse_types_only,
                file_path
            )

            result.ifc_schema = parse_result.ifc_schema

            if not parse_result.success:
                # Parsing failed
                error_msg = parse_result.error or "IFC parsing failed"
                result.error = error_msg
                result.status = 'error'

                await self.repository.update_model_status(
                    model_id,
                    status='error',
                    parsing_status='failed',
                    processing_error=error_msg,
                )

                # Mark the ExtractionRun failed
                result.extraction_run_id = run_id
                if run_id:
                    await self._finalize_extraction_run(
                        run_id, parse_result, result, start_time, status='failed',
                        error=error_msg,
                    )

                return result

            # ==================== Write to Database ====================
            print("[Orchestrator] Writing types and materials to database...")

            # Step 1: Write materials
            print(f"[Orchestrator] Writing {len(parse_result.materials)} materials...")
            await self.repository.bulk_insert_materials(model_id, parse_result.materials)
            result.material_count = len(parse_result.materials)

            # Step 2: Write types (with instance_count from parse_result)
            print(f"[Orchestrator] Writing {len(parse_result.types)} types...")
            type_guid_to_id = await self.repository.bulk_insert_types(
                model_id, parse_result.types
            )
            result.type_count = len(parse_result.types)

            # Step 3: Link types to TypeBank (create entries and observations)
            print(f"[Orchestrator] Linking types to TypeBank...")
            typebank_stats = await self.repository.link_types_to_typebank(
                model_id, parse_result.types, type_guid_to_id
            )
            print(f"[Orchestrator] TypeBank: {typebank_stats['entries_created']} new entries, "
                  f"{typebank_stats['entries_reused']} reused, "
                  f"{typebank_stats['observations_created']} observations")

            # Step 3b: Write TypeMapping + TypeDefinitionLayer rows from parsed IFC material layers
            types_with_layers = sum(1 for t in parse_result.types if t.definition_layers)
            print(f"[Orchestrator] Writing type definition layers ({types_with_layers} types have layers)...")
            layer_stats = await self.repository.bulk_insert_type_definition_layers(
                model_id, parse_result.types, type_guid_to_id
            )
            print(f"[Orchestrator] Layers: {layer_stats['mappings_created']} new mappings, "
                  f"{layer_stats['mappings_updated']} updated, "
                  f"{layer_stats['layers_created']} layers created, "
                  f"{layer_stats['layers_cleared']} layers cleared, "
                  f"{layer_stats['types_skipped']} types skipped")

            # Store stats for reporting
            result.storey_count = parse_result.storey_count
            result.element_count = parse_result.element_count  # Total elements (not stored, just for stats)

            # ==================== Update Status: Ready ====================
            await self.repository.update_model_status(
                model_id,
                status='ready',
                parsing_status='parsed',
                geometry_status='skipped',  # Viewer loads IFC directly
                ifc_schema=parse_result.ifc_schema,
                element_count=parse_result.element_count,  # Keep for display, even though not stored
                storey_count=parse_result.storey_count,
                processing_error='',
            )

            result.success = True
            result.status = 'ready'
            result.duration_seconds = time.time() - start_time

            # ==================== Finalize ExtractionRun ====================
            result.extraction_run_id = run_id
            if run_id:
                await self._finalize_extraction_run(
                    run_id, parse_result, result, start_time, status='completed',
                )

            print(f"\n[Orchestrator] Complete in {result.duration_seconds:.2f}s")
            print(f"  Types: {result.type_count} (with instance counts)")
            print(f"  Materials: {result.material_count}")
            print(f"  Total elements (not stored): {result.element_count}")
            print(f"  ExtractionRun ID: {result.extraction_run_id}")

            return result

        except Exception as e:
            # Catastrophic failure
            result.error = str(e)
            result.status = 'error'
            result.duration_seconds = time.time() - start_time

            print(f"\n[Orchestrator] FAILED: {e}")

            await self.repository.update_model_status(
                model_id,
                status='error',
                parsing_status='failed',
                processing_error=str(e),
            )

            # Mark the ExtractionRun failed
            result.extraction_run_id = run_id
            result.processing_report_id = run_id  # legacy alias
            if run_id:
                try:
                    await self.repository.update_extraction_run(
                        run_id,
                        status='failed',
                        completed_at=datetime.now(timezone.utc),
                        duration_seconds=result.duration_seconds,
                        error_message=str(e),
                        log_entries=[{
                            'ts': datetime.now(timezone.utc).isoformat(),
                            'level': 'critical',
                            'stage': 'orchestrator',
                            'message': str(e),
                        }],
                    )
                except Exception:
                    pass  # Don't fail on report write failure

            return result

    # ----------------------------------------------------------------------
    # Phase 2: ExtractionRun lifecycle (replaces _create_types_only_report)
    # ----------------------------------------------------------------------

    async def _resolve_extraction_run(
        self,
        *,
        model_id: str,
        source_file_id: Optional[str],
        extraction_run_id: Optional[str],
    ) -> Optional[str]:
        """
        Pick the ExtractionRun row to write into.

        Order of preference:
          1. extraction_run_id passed by Django (the dispatcher created one).
          2. source_file_id passed by Django -> create a fresh run.
          3. Look up Model.source_file_id from the DB -> create a fresh run.
          4. None: legacy Model with no SourceFile (pre-Phase-2 backfill); skip.
        """
        if extraction_run_id:
            return extraction_run_id

        if source_file_id:
            return await self.repository.create_extraction_run(
                source_file_id=source_file_id,
                status='running',
                extractor_version='ifc-service@types-only',
            )

        # Fall back to looking up the Model's source_file
        async with get_connection() as conn:
            row = await conn.fetchrow(
                "SELECT source_file_id FROM models WHERE id = $1",
                uuid.UUID(model_id),
            )
        if row and row['source_file_id']:
            return await self.repository.create_extraction_run(
                source_file_id=str(row['source_file_id']),
                status='running',
                extractor_version='ifc-service@types-only',
            )

        return None

    async def _finalize_extraction_run(
        self,
        run_id: str,
        parse_result: TypesOnlyResult,
        result: ProcessingResult,
        start_time: float,
        status: str,
        error: Optional[str] = None,
    ) -> None:
        """Write final state into the ExtractionRun row."""
        types_with_instances = sum(1 for t in parse_result.types if t.instance_count > 0)
        total_instances = sum(t.instance_count for t in parse_result.types)

        # quality_report: combine parser-provided one with run-level totals.
        quality_report: Dict[str, Any] = dict(getattr(parse_result, 'quality_report', {}) or {})
        quality_report.setdefault('total_elements', result.element_count)
        quality_report.setdefault('storey_count', result.storey_count)
        quality_report.setdefault('material_count', result.material_count)
        quality_report.setdefault('type_count', result.type_count)
        quality_report.setdefault('types_with_instances', types_with_instances)
        quality_report.setdefault('total_instances', total_instances)
        if parse_result.ifc_schema:
            quality_report.setdefault('ifc_schema', parse_result.ifc_schema)
        quality_report.setdefault('file_size_bytes', getattr(parse_result, 'file_size_bytes', 0))
        quality_report.setdefault('processing_mode', 'types_only')

        log_entries = list(getattr(parse_result, 'log_entries', []) or [])

        # Discovered units (length only for now — area/volume can be derived later)
        discovered_units: Dict[str, str] = {}
        unit_scale = getattr(parse_result, 'length_unit_scale', None)
        if unit_scale is not None:
            unit_name = _length_unit_name(unit_scale)
            if unit_name:
                discovered_units['length'] = unit_name

        await self.repository.update_extraction_run(
            run_id,
            status=status,
            completed_at=datetime.now(timezone.utc),
            duration_seconds=result.duration_seconds,
            discovered_units=discovered_units or None,
            quality_report=quality_report,
            log_entries=log_entries,
            error_message=error,
        )

    def _get_ifc_type_for_hierarchy(self, level: str) -> str:
        """Get the IFC type for a hierarchy level."""
        type_map = {
            'project': 'IfcProject',
            'site': 'IfcSite',
            'building': 'IfcBuilding',
            'storey': 'IfcBuildingStorey',
        }
        return type_map.get(level, 'IfcSpatialStructureElement')

    def _calculate_verification_data(
        self,
        parse_result: ParseResult,
        type_assignment_count: int,
    ) -> Dict:
        """
        Calculate verification stats for audit trail.

        This provides transparency about data quality, showing:
        - How many types have instances vs. are empty
        - How many entities are geometry-only (no meaningful metadata)
        - Verification timestamp and method
        """
        # Count types with instances (from type assignments)
        types_with_assignments = set()
        for assignment in parse_result.type_assignments:
            types_with_assignments.add(assignment.type_guid)

        types_total = len(parse_result.types)
        types_with_instances = len(types_with_assignments)
        types_without_instances = types_total - types_with_instances

        # Count entities
        entities_total = len(parse_result.entities)
        entities_geometry_only = sum(
            1 for e in parse_result.entities if e.is_geometry_only
        )
        entities_with_type = type_assignment_count

        return {
            'types_total': types_total,
            'types_with_instances': types_with_instances,
            'types_without_instances': types_without_instances,
            'entities_total': entities_total,
            'entities_with_type': entities_with_type,
            'entities_geometry_only': entities_geometry_only,
            'verified_at': datetime.now(timezone.utc).isoformat(),
            'verification_method': 'ifcopenshell',
        }

    async def _create_report(
        self,
        model_id: str,
        start_time: float,
        result: ProcessingResult,
        parse_result: ParseResult,
        is_failure: bool,
        verification_data: Optional[Dict] = None,
    ) -> str:
        """Create a processing report."""
        completed_at = datetime.now(timezone.utc)
        started_at = datetime.fromtimestamp(start_time, tz=timezone.utc)

        total_processed = (
            result.element_count +
            result.storey_count +
            result.material_count +
            result.type_count +
            result.system_count
        )

        summary = f"""
IFC Processing {'FAILED' if is_failure else 'Complete'}
========================================
Duration: {result.duration_seconds:.2f}s
IFC Schema: {result.ifc_schema or 'Unknown'}

Elements: {result.element_count}
Storeys: {result.storey_count}
Properties: {result.property_count}
Materials: {result.material_count}
Types: {result.type_count}
Systems: {result.system_count}

Errors: {len(result.errors)}
"""

        return await self.repository.create_processing_report(
            model_id=model_id,
            started_at=started_at,
            completed_at=completed_at,
            duration_seconds=result.duration_seconds,
            overall_status='failed' if is_failure else ('partial' if result.errors else 'success'),
            ifc_schema=result.ifc_schema,
            file_size_bytes=parse_result.file_size_bytes if parse_result else 0,
            stage_results=result.stage_results,
            total_entities_processed=total_processed,
            total_entities_skipped=0,
            total_entities_failed=len(result.errors),
            errors=result.errors,
            catastrophic_failure=is_failure and result.error is not None,
            failure_exception=result.error if is_failure else None,
            summary=summary,
            verification_data=verification_data or {},
        )


# Singleton instance
processing_orchestrator = ProcessingOrchestrator()
