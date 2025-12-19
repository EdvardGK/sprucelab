"""
Processing Orchestrator - Coordinates IFC parsing and database writes.

This is the main entry point for processing IFC files.
It coordinates between:
- IFCParserService (extracts data from IFC file)
- IFCRepository (writes data to database)
"""

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, Dict, List
from concurrent.futures import ThreadPoolExecutor

from services.ifc_parser import IFCParserService, ParseResult
from repositories.ifc_repository import (
    IFCRepository, EntityData, PropertyData, SpatialData
)


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
    processing_report_id: Optional[str] = None
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

    async def process_model(
        self,
        model_id: str,
        file_path: str,
        skip_geometry: bool = True,
    ) -> ProcessingResult:
        """
        Process an IFC file and write results to database.

        Args:
            model_id: UUID of the Model record in Django database
            file_path: Path to the IFC file
            skip_geometry: Whether to skip geometry extraction (always True for now)

        Returns:
            ProcessingResult with counts and status
        """
        result = ProcessingResult(model_id=model_id)
        start_time = time.time()

        try:
            # ==================== Update Status: Parsing ====================
            print(f"\n[Orchestrator] Processing model {model_id}")
            print(f"[Orchestrator] File: {file_path}")

            await self.repository.update_model_status(
                model_id,
                status='processing',
                parsing_status='parsing',
            )

            # ==================== Parse IFC File ====================
            # Run parser in thread pool since ifcopenshell is blocking
            loop = __import__('asyncio').get_event_loop()
            parse_result: ParseResult = await loop.run_in_executor(
                self._executor,
                self.parser.parse_file,
                file_path
            )

            result.ifc_schema = parse_result.ifc_schema
            result.stage_results = parse_result.stage_results
            result.errors = parse_result.errors

            if not parse_result.success:
                # Parsing failed
                error_msg = "IFC parsing failed"
                if parse_result.errors:
                    error_msg = parse_result.errors[0].get('message', error_msg)

                result.error = error_msg
                result.status = 'error'

                await self.repository.update_model_status(
                    model_id,
                    status='error',
                    parsing_status='failed',
                    processing_error=error_msg,
                )

                # Still create a processing report
                result.processing_report_id = await self._create_report(
                    model_id, start_time, result, parse_result, is_failure=True
                )

                return result

            # ==================== Write to Database ====================
            print("[Orchestrator] Writing to database...")

            # Step 1: Create spatial hierarchy entities first (we need their IDs for storeys)
            spatial_entities = []
            for item in parse_result.spatial_items:
                # Find the corresponding spatial element in IFC
                spatial_entities.append(EntityData(
                    ifc_guid=item.entity_id,  # entity_id contains the GUID at this point
                    ifc_type=self._get_ifc_type_for_hierarchy(item.hierarchy_level),
                    name=None,  # Will be updated below
                ))

            # Actually we need to extract names from the parse result
            # For now, create entities without names
            print(f"[Orchestrator] Writing {len(spatial_entities)} spatial entities...")
            spatial_guid_to_id = await self.repository.bulk_insert_entities(
                model_id, spatial_entities
            )

            # Build storey GUID to DB ID map for element linking
            storey_guid_to_db_id = {}
            for item in parse_result.spatial_items:
                if item.hierarchy_level == 'storey':
                    db_id = spatial_guid_to_id.get(item.entity_id)
                    if db_id:
                        storey_guid_to_db_id[item.entity_id] = db_id

            # Step 2: Write spatial hierarchy records
            spatial_data_with_ids = []
            for item in parse_result.spatial_items:
                entity_db_id = spatial_guid_to_id.get(item.entity_id)
                if entity_db_id:
                    spatial_data_with_ids.append(SpatialData(
                        entity_id=entity_db_id,
                        parent_id=None,  # TODO: resolve parent relationships
                        hierarchy_level=item.hierarchy_level,
                        path=item.path,
                    ))

            await self.repository.bulk_insert_spatial_hierarchy(model_id, spatial_data_with_ids)
            result.storey_count = len([i for i in parse_result.spatial_items if i.hierarchy_level == 'storey'])

            # Step 3: Write materials
            print(f"[Orchestrator] Writing {len(parse_result.materials)} materials...")
            material_guid_to_id = await self.repository.bulk_insert_materials(
                model_id, parse_result.materials
            )
            result.material_count = len(parse_result.materials)

            # Step 4: Write types
            print(f"[Orchestrator] Writing {len(parse_result.types)} types...")
            type_guid_to_id = await self.repository.bulk_insert_types(
                model_id, parse_result.types
            )
            result.type_count = len(parse_result.types)

            # Step 5: Write systems
            print(f"[Orchestrator] Writing {len(parse_result.systems)} systems...")
            system_guid_to_id = await self.repository.bulk_insert_systems(
                model_id, parse_result.systems
            )
            result.system_count = len(parse_result.systems)

            # Step 6: Write elements (with storey references resolved)
            print(f"[Orchestrator] Writing {len(parse_result.entities)} entities...")

            # Update storey_id in entities from GUID to DB ID
            for entity in parse_result.entities:
                if entity.storey_id and entity.storey_id in storey_guid_to_db_id:
                    entity.storey_id = storey_guid_to_db_id[entity.storey_id]
                else:
                    entity.storey_id = None

            entity_guid_to_id = await self.repository.bulk_insert_entities(
                model_id, parse_result.entities
            )
            result.element_count = len(parse_result.entities)

            # Merge spatial GUIDs into entity map for property linking
            all_guid_to_id = {**spatial_guid_to_id, **entity_guid_to_id}

            # Step 7: Write type assignments
            print(f"[Orchestrator] Writing {len(parse_result.type_assignments)} type assignments...")
            type_assignment_count = await self.repository.bulk_insert_type_assignments(
                parse_result.type_assignments,
                entity_guid_to_id,  # entity GUID → DB ID
                type_guid_to_id,    # type GUID → DB ID
            )
            print(f"[Orchestrator] Created {type_assignment_count} type assignments")

            # Step 8: Write properties (with entity references resolved)
            print(f"[Orchestrator] Writing {len(parse_result.properties)} properties...")

            # Update entity_id in properties from GUID to DB ID
            properties_with_ids = []
            for prop in parse_result.properties:
                entity_db_id = all_guid_to_id.get(prop.entity_id)
                if entity_db_id:
                    properties_with_ids.append(PropertyData(
                        entity_id=entity_db_id,
                        pset_name=prop.pset_name,
                        property_name=prop.property_name,
                        property_value=prop.property_value,
                        property_type=prop.property_type,
                    ))

            await self.repository.bulk_insert_properties(properties_with_ids)
            result.property_count = len(properties_with_ids)

            # ==================== Update Status: Ready ====================
            await self.repository.update_model_status(
                model_id,
                status='ready',
                parsing_status='parsed',
                geometry_status='skipped' if skip_geometry else 'pending',
                ifc_schema=parse_result.ifc_schema,
                element_count=result.element_count,
                storey_count=result.storey_count,
                system_count=result.system_count,
                processing_error='',  # Clear any previous error
            )

            result.success = True
            result.status = 'ready'
            result.duration_seconds = time.time() - start_time

            # ==================== Create Processing Report ====================
            result.processing_report_id = await self._create_report(
                model_id, start_time, result, parse_result, is_failure=False
            )

            print(f"\n[Orchestrator] Complete in {result.duration_seconds:.2f}s")
            print(f"  Elements: {result.element_count}")
            print(f"  Properties: {result.property_count}")
            print(f"  Report ID: {result.processing_report_id}")

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

            # Create failure report
            try:
                result.processing_report_id = await self.repository.create_processing_report(
                    model_id=model_id,
                    started_at=datetime.fromtimestamp(start_time, tz=timezone.utc),
                    completed_at=datetime.now(timezone.utc),
                    duration_seconds=result.duration_seconds,
                    overall_status='failed',
                    stage_results=result.stage_results,
                    errors=result.errors + [{
                        'stage': 'orchestrator',
                        'severity': 'critical',
                        'message': str(e),
                        'timestamp': datetime.now().isoformat(),
                    }],
                    catastrophic_failure=True,
                    failure_exception=str(e),
                    summary=f"CATASTROPHIC FAILURE: {e}",
                )
            except Exception:
                pass  # Don't fail on report creation failure

            return result

    def _get_ifc_type_for_hierarchy(self, level: str) -> str:
        """Get the IFC type for a hierarchy level."""
        type_map = {
            'project': 'IfcProject',
            'site': 'IfcSite',
            'building': 'IfcBuilding',
            'storey': 'IfcBuildingStorey',
        }
        return type_map.get(level, 'IfcSpatialStructureElement')

    async def _create_report(
        self,
        model_id: str,
        start_time: float,
        result: ProcessingResult,
        parse_result: ParseResult,
        is_failure: bool,
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
        )


# Singleton instance
processing_orchestrator = ProcessingOrchestrator()
