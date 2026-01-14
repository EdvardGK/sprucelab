"""
IFC Repository - Database operations for IFC processing.

Handles bulk inserts and updates to the shared PostgreSQL database.
Uses asyncpg for async operations with batched inserts for performance.
"""

import uuid
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from core.database import get_connection, get_transaction


# =============================================================================
# Data Classes for bulk insert operations
# =============================================================================

@dataclass
class EntityData:
    """Data for a single IFC entity."""
    ifc_guid: str
    ifc_type: str
    name: Optional[str] = None
    description: Optional[str] = None
    storey_id: Optional[str] = None
    area: Optional[float] = None
    volume: Optional[float] = None
    length: Optional[float] = None
    height: Optional[float] = None
    perimeter: Optional[float] = None
    is_geometry_only: bool = False  # True if entity has no type, name, or properties


@dataclass
class PropertyData:
    """Data for a single property."""
    entity_id: str
    pset_name: str
    property_name: str
    property_value: Optional[str] = None
    property_type: Optional[str] = None


@dataclass
class SpatialData:
    """Data for spatial hierarchy entry."""
    entity_id: str
    parent_id: Optional[str]
    hierarchy_level: str
    path: List[str]


@dataclass
class MaterialData:
    """Data for a material."""
    material_guid: str
    name: str
    category: Optional[str] = None
    properties: Optional[Dict] = None


@dataclass
class TypeData:
    """Data for an IFC type.

    Types are enumerated from element ObjectType attributes (primary source).
    When an IfcTypeObject exists with matching name, metadata is enriched from it.
    """
    type_guid: str
    type_name: Optional[str]
    ifc_type: str
    predefined_type: Optional[str] = None  # From IfcTypeObject PredefinedType
    material: Optional[str] = None  # Primary material name for TypeBank identity
    properties: Optional[Dict] = None
    instance_count: int = 0  # Number of instances of this type
    has_ifc_type_object: bool = True  # True if backed by IfcTypeObject, False if synthetic from ObjectType


@dataclass
class SystemData:
    """Data for a system."""
    system_guid: str
    system_name: Optional[str]
    system_type: Optional[str]
    description: Optional[str] = None


@dataclass
class TypeAssignmentData:
    """Data for a type→entity assignment (IfcRelDefinesByType)."""
    entity_guid: str  # GUID of the element
    type_guid: str    # GUID of the type object


# =============================================================================
# Repository Class
# =============================================================================

class IFCRepository:
    """
    Repository for IFC database operations.

    All methods are async and use batched operations for performance.
    """

    ENTITY_BATCH_SIZE = 500
    PROPERTY_BATCH_SIZE = 1000

    async def update_model_status(
        self,
        model_id: str,
        status: Optional[str] = None,
        parsing_status: Optional[str] = None,
        geometry_status: Optional[str] = None,
        validation_status: Optional[str] = None,
        ifc_schema: Optional[str] = None,
        element_count: Optional[int] = None,
        storey_count: Optional[int] = None,
        system_count: Optional[int] = None,
        processing_error: Optional[str] = None,
    ) -> bool:
        """Update model status fields."""
        updates = []
        values = []
        param_idx = 1

        if status is not None:
            updates.append(f"status = ${param_idx}")
            values.append(status)
            param_idx += 1

        if parsing_status is not None:
            updates.append(f"parsing_status = ${param_idx}")
            values.append(parsing_status)
            param_idx += 1

        if geometry_status is not None:
            updates.append(f"geometry_status = ${param_idx}")
            values.append(geometry_status)
            param_idx += 1

        if validation_status is not None:
            updates.append(f"validation_status = ${param_idx}")
            values.append(validation_status)
            param_idx += 1

        if ifc_schema is not None:
            updates.append(f"ifc_schema = ${param_idx}")
            values.append(ifc_schema)
            param_idx += 1

        if element_count is not None:
            updates.append(f"element_count = ${param_idx}")
            values.append(element_count)
            param_idx += 1

        if storey_count is not None:
            updates.append(f"storey_count = ${param_idx}")
            values.append(storey_count)
            param_idx += 1

        if system_count is not None:
            updates.append(f"system_count = ${param_idx}")
            values.append(system_count)
            param_idx += 1

        if processing_error is not None:
            updates.append(f"processing_error = ${param_idx}")
            values.append(processing_error)
            param_idx += 1

        # Always update updated_at
        updates.append(f"updated_at = ${param_idx}")
        values.append(datetime.now(timezone.utc))
        param_idx += 1

        if not updates:
            return False

        # Add model_id as last parameter
        values.append(uuid.UUID(model_id))

        query = f"""
            UPDATE models
            SET {', '.join(updates)}
            WHERE id = ${param_idx}
        """

        async with get_connection() as conn:
            result = await conn.execute(query, *values)
            return result == "UPDATE 1"

    async def bulk_insert_entities(
        self,
        model_id: str,
        entities: List[EntityData],
    ) -> Dict[str, str]:
        """
        Bulk insert IFC entities.

        Returns:
            Dict mapping ifc_guid to entity_id (UUID)
        """
        if not entities:
            return {}

        guid_to_id = {}
        model_uuid = uuid.UUID(model_id)

        async with get_transaction() as conn:
            for i in range(0, len(entities), self.ENTITY_BATCH_SIZE):
                batch = entities[i:i + self.ENTITY_BATCH_SIZE]
                records = []

                for entity in batch:
                    entity_id = uuid.uuid4()
                    guid_to_id[entity.ifc_guid] = str(entity_id)

                    # Convert storey_id string to UUID if present
                    storey_uuid = uuid.UUID(entity.storey_id) if entity.storey_id else None

                    records.append((
                        entity_id,
                        model_uuid,
                        entity.ifc_guid,
                        entity.ifc_type,
                        entity.name,
                        entity.description,
                        storey_uuid,
                        entity.area,
                        entity.volume,
                        entity.length,
                        entity.height,
                        entity.perimeter,
                        False,  # is_removed - default to False for new entities
                        entity.is_geometry_only,
                    ))

                await conn.executemany(
                    """
                    INSERT INTO ifc_entities (
                        id, model_id, ifc_guid, ifc_type, name, description,
                        storey_id, area, volume, length, height, perimeter, is_removed,
                        is_geometry_only
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    ON CONFLICT (model_id, ifc_guid) DO NOTHING
                    """,
                    records
                )

        return guid_to_id

    async def bulk_insert_properties(
        self,
        properties: List[PropertyData],
    ) -> int:
        """
        Bulk insert property sets.

        Returns:
            Number of properties inserted
        """
        if not properties:
            return 0

        count = 0
        async with get_transaction() as conn:
            for i in range(0, len(properties), self.PROPERTY_BATCH_SIZE):
                batch = properties[i:i + self.PROPERTY_BATCH_SIZE]
                records = []

                for prop in batch:
                    records.append((
                        uuid.uuid4(),
                        uuid.UUID(prop.entity_id),
                        prop.pset_name,
                        prop.property_name,
                        prop.property_value,
                        prop.property_type,
                    ))

                await conn.executemany(
                    """
                    INSERT INTO property_sets (
                        id, entity_id, pset_name, property_name, property_value, property_type
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    records
                )
                count += len(batch)

        return count

    async def bulk_insert_spatial_hierarchy(
        self,
        model_id: str,
        items: List[SpatialData],
    ) -> int:
        """
        Bulk insert spatial hierarchy entries.

        Returns:
            Number of entries inserted
        """
        if not items:
            return 0

        model_uuid = uuid.UUID(model_id)
        records = []

        for item in items:
            entity_uuid = uuid.UUID(item.entity_id)
            parent_uuid = uuid.UUID(item.parent_id) if item.parent_id else None

            records.append((
                uuid.uuid4(),
                model_uuid,
                entity_uuid,
                parent_uuid,
                item.hierarchy_level,
                item.path,
            ))

        async with get_transaction() as conn:
            await conn.executemany(
                """
                INSERT INTO spatial_hierarchy (
                    id, model_id, entity_id, parent_id, hierarchy_level, path
                ) VALUES ($1, $2, $3, $4, $5, $6)
                """,
                records
            )

        return len(items)

    async def bulk_insert_materials(
        self,
        model_id: str,
        materials: List[MaterialData],
    ) -> Dict[str, str]:
        """
        Bulk insert materials.

        Returns:
            Dict mapping material_guid to material_id (UUID)
        """
        if not materials:
            return {}

        guid_to_id = {}
        model_uuid = uuid.UUID(model_id)
        records = []

        for material in materials:
            material_id = uuid.uuid4()
            guid_to_id[material.material_guid] = str(material_id)

            records.append((
                material_id,
                model_uuid,
                material.material_guid,
                material.name,
                material.category,
                json.dumps(material.properties or {}),
            ))

        async with get_transaction() as conn:
            await conn.executemany(
                """
                INSERT INTO materials (
                    id, model_id, material_guid, name, category, properties
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (model_id, material_guid) DO NOTHING
                """,
                records
            )

        return guid_to_id

    async def bulk_insert_types(
        self,
        model_id: str,
        types: List[TypeData],
    ) -> Dict[str, str]:
        """
        Bulk insert IFC types.

        Types are derived from element ObjectType attributes (primary source).
        has_ifc_type_object indicates whether the type is backed by a real IfcTypeObject.

        Returns:
            Dict mapping type_guid to type_id (UUID)
        """
        if not types:
            return {}

        guid_to_id = {}
        model_uuid = uuid.UUID(model_id)
        records = []

        for type_data in types:
            type_id = uuid.uuid4()
            guid_to_id[type_data.type_guid] = str(type_id)

            records.append((
                type_id,
                model_uuid,
                type_data.type_guid,
                type_data.type_name,
                type_data.ifc_type,
                type_data.predefined_type,
                json.dumps(type_data.properties or {}),
                type_data.instance_count,
                type_data.has_ifc_type_object,
            ))

        async with get_transaction() as conn:
            await conn.executemany(
                """
                INSERT INTO ifc_types (
                    id, model_id, type_guid, type_name, ifc_type, predefined_type, properties, instance_count, has_ifc_type_object
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (model_id, type_guid) DO NOTHING
                """,
                records
            )

        return guid_to_id

    async def bulk_insert_systems(
        self,
        model_id: str,
        systems: List[SystemData],
    ) -> Dict[str, str]:
        """
        Bulk insert systems.

        Returns:
            Dict mapping system_guid to system_id (UUID)
        """
        if not systems:
            return {}

        guid_to_id = {}
        model_uuid = uuid.UUID(model_id)
        records = []

        for system in systems:
            system_id = uuid.uuid4()
            guid_to_id[system.system_guid] = str(system_id)

            records.append((
                system_id,
                model_uuid,
                system.system_guid,
                system.system_name,
                system.system_type,
                system.description,
            ))

        async with get_transaction() as conn:
            await conn.executemany(
                """
                INSERT INTO systems (
                    id, model_id, system_guid, system_name, system_type, description
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (model_id, system_guid) DO NOTHING
                """,
                records
            )

        return guid_to_id

    async def bulk_insert_type_assignments(
        self,
        assignments: List[TypeAssignmentData],
        entity_guid_to_id: Dict[str, str],
        type_guid_to_id: Dict[str, str],
    ) -> int:
        """
        Bulk insert type→entity assignments.

        Args:
            assignments: List of type assignment data
            entity_guid_to_id: Map of entity GUID to entity UUID
            type_guid_to_id: Map of type GUID to type UUID

        Returns:
            Number of assignments inserted
        """
        if not assignments:
            return 0

        records = []
        for assignment in assignments:
            entity_id = entity_guid_to_id.get(assignment.entity_guid)
            type_id = type_guid_to_id.get(assignment.type_guid)

            if entity_id and type_id:
                records.append((
                    uuid.UUID(entity_id),
                    uuid.UUID(type_id),
                ))

        if not records:
            return 0

        async with get_transaction() as conn:
            await conn.executemany(
                """
                INSERT INTO type_assignments (entity_id, type_id)
                VALUES ($1, $2)
                ON CONFLICT (entity_id, type_id) DO NOTHING
                """,
                records
            )

        return len(records)

    async def create_processing_report(
        self,
        model_id: str,
        started_at: datetime,
        completed_at: Optional[datetime] = None,
        duration_seconds: Optional[float] = None,
        overall_status: str = "failed",
        ifc_schema: Optional[str] = None,
        file_size_bytes: int = 0,
        stage_results: Optional[List[Dict]] = None,
        total_entities_processed: int = 0,
        total_entities_skipped: int = 0,
        total_entities_failed: int = 0,
        errors: Optional[List[Dict]] = None,
        catastrophic_failure: bool = False,
        failure_stage: Optional[str] = None,
        failure_exception: Optional[str] = None,
        failure_traceback: Optional[str] = None,
        summary: Optional[str] = None,
        verification_data: Optional[Dict] = None,
    ) -> str:
        """
        Create a processing report.

        Returns:
            The report ID (UUID string)
        """
        report_id = uuid.uuid4()
        model_uuid = uuid.UUID(model_id)

        async with get_connection() as conn:
            await conn.execute(
                """
                INSERT INTO processing_reports (
                    id, model_id, started_at, completed_at, duration_seconds,
                    overall_status, ifc_schema, file_size_bytes,
                    stage_results, total_entities_processed, total_entities_skipped,
                    total_entities_failed, errors, catastrophic_failure,
                    failure_stage, failure_exception, failure_traceback, summary,
                    verification_data
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
                )
                """,
                report_id,
                model_uuid,
                started_at,
                completed_at,
                duration_seconds,
                overall_status,
                ifc_schema,
                file_size_bytes,
                json.dumps(stage_results or []),
                total_entities_processed,
                total_entities_skipped,
                total_entities_failed,
                json.dumps(errors or []),
                catastrophic_failure,
                failure_stage,
                failure_exception,
                failure_traceback,
                summary,
                json.dumps(verification_data or {}),
            )

        return str(report_id)

    async def delete_model_data(self, model_id: str) -> Dict[str, int]:
        """
        Delete all data for a model (for re-processing).

        Returns:
            Dict with counts of deleted records per table
        """
        model_uuid = uuid.UUID(model_id)
        deleted = {}

        async with get_transaction() as conn:
            # Delete in order to respect foreign keys
            # Property sets reference entities
            result = await conn.execute(
                """
                DELETE FROM property_sets
                WHERE entity_id IN (
                    SELECT id FROM ifc_entities WHERE model_id = $1
                )
                """,
                model_uuid
            )
            deleted["property_sets"] = int(result.split()[-1]) if result else 0

            # Type assignments reference entities and types
            result = await conn.execute(
                """
                DELETE FROM type_assignments
                WHERE entity_id IN (
                    SELECT id FROM ifc_entities WHERE model_id = $1
                )
                """,
                model_uuid
            )
            deleted["type_assignments"] = int(result.split()[-1]) if result else 0

            # Spatial hierarchy
            result = await conn.execute(
                "DELETE FROM spatial_hierarchy WHERE model_id = $1",
                model_uuid
            )
            deleted["spatial_hierarchy"] = int(result.split()[-1]) if result else 0

            # Systems
            result = await conn.execute(
                "DELETE FROM systems WHERE model_id = $1",
                model_uuid
            )
            deleted["systems"] = int(result.split()[-1]) if result else 0

            # Type bank observations (references ifc_types, must delete first)
            result = await conn.execute(
                "DELETE FROM type_bank_observations WHERE source_model_id = $1",
                model_uuid
            )
            deleted["type_bank_observations"] = int(result.split()[-1]) if result else 0

            # Types
            result = await conn.execute(
                "DELETE FROM ifc_types WHERE model_id = $1",
                model_uuid
            )
            deleted["types"] = int(result.split()[-1]) if result else 0

            # Materials
            result = await conn.execute(
                "DELETE FROM materials WHERE model_id = $1",
                model_uuid
            )
            deleted["materials"] = int(result.split()[-1]) if result else 0

            # Entities (last, as others reference it)
            result = await conn.execute(
                "DELETE FROM ifc_entities WHERE model_id = $1",
                model_uuid
            )
            deleted["entities"] = int(result.split()[-1]) if result else 0

        return deleted

    async def link_types_to_typebank(
        self,
        model_id: str,
        types: List[TypeData],
        type_guid_to_id: Dict[str, str],
    ) -> Dict[str, int]:
        """
        Link extracted types to TypeBank (create entries and observations).

        For each TypeData:
        1. Get or create TypeBankEntry based on identity tuple
        2. Create TypeBankObservation linking to the model's IFCType

        Args:
            model_id: UUID of the model being processed
            types: List of extracted TypeData
            type_guid_to_id: Map of type GUID to type UUID (from bulk_insert_types)

        Returns:
            Dict with stats: entries_created, entries_reused, observations_created
        """
        stats = {
            'entries_created': 0,
            'entries_reused': 0,
            'observations_created': 0,
        }

        if not types:
            return stats

        model_uuid = uuid.UUID(model_id)
        now = datetime.now(timezone.utc)

        async with get_transaction() as conn:
            for type_data in types:
                try:
                    # Look up or create TypeBankEntry
                    # Identity: (ifc_class, type_name, predefined_type, material)
                    entry_row = await conn.fetchrow(
                        """
                        SELECT id FROM type_bank_entries
                        WHERE ifc_class = $1
                          AND type_name = $2
                          AND predefined_type = $3
                          AND material = $4
                        """,
                        type_data.ifc_type,
                        type_data.type_name or '',
                        type_data.predefined_type or 'NOTDEFINED',
                        type_data.material or '',
                    )

                    if entry_row:
                        entry_id = entry_row['id']
                        stats['entries_reused'] += 1
                    else:
                        # Create new TypeBankEntry
                        entry_id = uuid.uuid4()
                        await conn.execute(
                            """
                            INSERT INTO type_bank_entries (
                                id, ifc_class, type_name, predefined_type, material,
                                mapping_status, source_model_count, total_instance_count,
                                created_by, created_at, updated_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                            """,
                            entry_id,
                            type_data.ifc_type,
                            type_data.type_name or '',
                            type_data.predefined_type or 'NOTDEFINED',
                            type_data.material or '',
                            'pending',
                            1,  # source_model_count
                            0,  # total_instance_count (updated later)
                            'ifc_parser',
                            now,
                            now,
                        )
                        stats['entries_created'] += 1

                    # Get the IFCType UUID for this type
                    type_id_str = type_guid_to_id.get(type_data.type_guid)
                    if not type_id_str:
                        continue

                    type_uuid = uuid.UUID(type_id_str)

                    # Check if observation already exists
                    existing_obs = await conn.fetchrow(
                        """
                        SELECT id FROM type_bank_observations
                        WHERE type_bank_entry_id = $1 AND source_type_id = $2
                        """,
                        entry_id,
                        type_uuid,
                    )

                    if not existing_obs:
                        # Create TypeBankObservation
                        obs_id = uuid.uuid4()
                        await conn.execute(
                            """
                            INSERT INTO type_bank_observations (
                                id, type_bank_entry_id, source_model_id, source_type_id,
                                instance_count, property_variations, observed_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                            """,
                            obs_id,
                            entry_id,
                            model_uuid,
                            type_uuid,
                            0,  # instance_count (updated after type assignments)
                            json.dumps({}),
                            now,
                        )
                        stats['observations_created'] += 1

                        # Update source_model_count on TypeBankEntry
                        await conn.execute(
                            """
                            UPDATE type_bank_entries
                            SET source_model_count = (
                                SELECT COUNT(DISTINCT source_model_id)
                                FROM type_bank_observations
                                WHERE type_bank_entry_id = $1
                            ),
                            updated_at = $2
                            WHERE id = $1
                            """,
                            entry_id,
                            now,
                        )

                except Exception as e:
                    # Log error but continue processing
                    print(f"[TypeBank] Error linking type {type_data.type_guid}: {e}")

        return stats

    async def update_typebank_instance_counts(self, model_id: str) -> int:
        """
        Update instance counts on TypeBankEntry and TypeBankObservation.

        Called after type_assignments are inserted.
        Counts how many entities are assigned to each type.

        Returns:
            Number of observations updated
        """
        model_uuid = uuid.UUID(model_id)
        now = datetime.now(timezone.utc)
        updated = 0

        async with get_transaction() as conn:
            # Get all observations for this model
            observations = await conn.fetch(
                """
                SELECT o.id, o.type_bank_entry_id, o.source_type_id
                FROM type_bank_observations o
                WHERE o.source_model_id = $1
                """,
                model_uuid
            )

            for obs in observations:
                # Count type assignments for this type
                count_row = await conn.fetchrow(
                    """
                    SELECT COUNT(*) as cnt
                    FROM type_assignments
                    WHERE type_id = $1
                    """,
                    obs['source_type_id']
                )
                instance_count = count_row['cnt'] if count_row else 0

                # Update observation
                await conn.execute(
                    """
                    UPDATE type_bank_observations
                    SET instance_count = $1
                    WHERE id = $2
                    """,
                    instance_count,
                    obs['id']
                )
                updated += 1

            # Update total_instance_count on TypeBankEntries
            entry_ids = set(obs['type_bank_entry_id'] for obs in observations)
            for entry_id in entry_ids:
                await conn.execute(
                    """
                    UPDATE type_bank_entries
                    SET total_instance_count = (
                        SELECT COALESCE(SUM(instance_count), 0)
                        FROM type_bank_observations
                        WHERE type_bank_entry_id = $1
                    ),
                    updated_at = $2
                    WHERE id = $1
                    """,
                    entry_id,
                    now
                )

        return updated


# Singleton instance
ifc_repository = IFCRepository()
