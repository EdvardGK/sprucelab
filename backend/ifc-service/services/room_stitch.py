"""
Room Stitch Service - Sprint 3: The Mapper

Provides spatial stitching between discrete MEP entities and rooms.
Uses point-in-volume logic to link vents, valves, fixtures to their containing rooms.

Key concepts:
- Discrete types: Point-based MEP elements (vents, valves, toilets, lights)
- Room volumes: IfcSpace geometry from primary ARK model (2D footprint + Z range)
- Basepoint: Entity centroid extracted from geometry

Flow:
1. Get room volumes from primary ARK model
2. Get discrete entities from MEP/other models
3. Extract basepoint (centroid) from each discrete entity
4. Check which room contains each basepoint
5. Create RoomAssignment records

Usage:
    from services.room_stitch import stitch_project_to_rooms, get_room_volumes

    result = stitch_project_to_rooms(project_id, ark_model_file, mep_model_files)
"""
import logging
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

import numpy as np

logger = logging.getLogger(__name__)

# =============================================================================
# Constants: Discrete IFC Types (point-based, not linear)
# =============================================================================

DISCRETE_IFC_TYPES = [
    # HVAC terminals
    'IfcAirTerminal',          # Vents, diffusers, grilles
    'IfcAirTerminalBox',       # VAV boxes
    # Valves and flow control
    'IfcValve',                # Valves
    'IfcDamper',               # Dampers
    'IfcFlowController',       # Generic flow controllers
    # Plumbing fixtures
    'IfcSanitaryTerminal',     # Toilets, sinks, urinals
    'IfcWasteTerminal',        # Drains, floor drains
    # Furniture and fixtures
    'IfcFurniture',            # Furniture
    'IfcSystemFurnitureElement',
    # Electrical
    'IfcLightFixture',         # Light fixtures
    'IfcOutlet',               # Electrical outlets
    'IfcJunctionBox',          # Junction boxes
    'IfcElectricAppliance',    # Appliances
    # Sensors and controls
    'IfcSensor',               # Sensors
    'IfcActuator',             # Actuators
    'IfcController',           # Controllers
    'IfcAlarm',                # Alarms, smoke detectors
    # Fire protection
    'IfcFireSuppressionTerminal',  # Sprinkler heads
    # Generic
    'IfcDistributionElement',  # Catch-all for MEP elements
]


@dataclass
class RoomVolume:
    """Represents a room's bounding volume for containment checks."""
    room_guid: str
    room_name: str
    room_entity_id: UUID

    # 2D footprint (list of (x,y) tuples forming polygon)
    footprint_coords: list[tuple[float, float]]

    # Z range (elevation bounds)
    z_min: float
    z_max: float

    # Optional storey reference
    storey_id: Optional[UUID] = None
    storey_name: Optional[str] = None


@dataclass
class EntityBasepoint:
    """Represents an entity's position for room assignment."""
    entity_guid: str
    entity_id: UUID
    ifc_type: str
    name: Optional[str]

    # Centroid coordinates
    x: float
    y: float
    z: float

    # Source model
    model_id: UUID


@dataclass
class RoomAssignmentResult:
    """Result of room stitching for a single entity."""
    entity_id: UUID
    entity_guid: str
    room_id: UUID
    room_guid: str
    room_name: str

    basepoint_x: float
    basepoint_y: float
    basepoint_z: float

    confidence: float


@dataclass
class StitchResult:
    """Result of stitching an entire project."""
    assignments_created: int
    entities_processed: int
    entities_unassigned: int
    rooms_used: int
    errors: list[str]


def point_in_room(
    point: tuple[float, float, float],
    room: RoomVolume,
) -> bool:
    """
    Check if a 3D point is inside a room volume.

    Uses simple Z-range check + 2D point-in-polygon (Shapely).

    Args:
        point: (x, y, z) coordinates
        room: RoomVolume with footprint and Z bounds

    Returns:
        True if point is inside room
    """
    x, y, z = point

    # Fast Z-range check first
    if not (room.z_min <= z <= room.z_max):
        return False

    # 2D point-in-polygon check
    try:
        from shapely.geometry import Point, Polygon

        if len(room.footprint_coords) < 3:
            logger.warning(f"Room {room.room_guid} has invalid footprint (< 3 points)")
            return False

        footprint = Polygon(room.footprint_coords)
        point_2d = Point(x, y)

        return footprint.contains(point_2d)

    except Exception as e:
        logger.error(f"Error checking point in room {room.room_guid}: {e}")
        return False


def extract_basepoint_from_geometry(
    shape_geometry,
    ifc_entity,
) -> Optional[tuple[float, float, float]]:
    """
    Extract centroid from IFC entity geometry.

    For discrete elements (vents, valves, etc.), the centroid works well
    as a single representative point for room assignment.

    Args:
        shape_geometry: ifcopenshell geometry shape
        ifc_entity: IFC entity object

    Returns:
        (x, y, z) centroid or None if extraction fails
    """
    try:
        # Get vertices from shape geometry
        if hasattr(shape_geometry, 'geometry'):
            verts = shape_geometry.geometry.verts
            if len(verts) == 0:
                return None

            # Reshape to Nx3 array
            vertices = np.array(verts).reshape(-1, 3)

            # Calculate centroid
            centroid = vertices.mean(axis=0)
            return (float(centroid[0]), float(centroid[1]), float(centroid[2]))

        # Fallback: try placement matrix
        if hasattr(ifc_entity, 'ObjectPlacement'):
            placement = ifc_entity.ObjectPlacement
            if placement:
                # Extract location from placement (simplified)
                # Full implementation would handle nested transformations
                matrix = get_placement_matrix(placement)
                if matrix is not None:
                    return (float(matrix[0, 3]), float(matrix[1, 3]), float(matrix[2, 3]))

        return None

    except Exception as e:
        logger.debug(f"Failed to extract basepoint for {ifc_entity.GlobalId}: {e}")
        return None


def get_placement_matrix(placement):
    """
    Extract 4x4 transformation matrix from IFC placement.

    Handles IfcLocalPlacement with nested references.
    """
    try:
        import ifcopenshell.util.placement as placement_util
        return placement_util.get_local_placement(placement)
    except Exception:
        return None


def extract_room_footprint(
    ifc_space,
    settings,
) -> Optional[tuple[list[tuple[float, float]], float, float]]:
    """
    Extract 2D footprint and Z bounds from an IfcSpace.

    Args:
        ifc_space: IfcSpace entity
        settings: ifcopenshell geometry settings

    Returns:
        (footprint_coords, z_min, z_max) or None
    """
    try:
        import ifcopenshell.geom

        shape = ifcopenshell.geom.create_shape(settings, ifc_space)
        if not shape:
            return None

        verts = shape.geometry.verts
        if len(verts) == 0:
            return None

        vertices = np.array(verts).reshape(-1, 3)

        # Get Z bounds
        z_min = float(vertices[:, 2].min())
        z_max = float(vertices[:, 2].max())

        # Project to 2D and get convex hull as footprint
        # (simplified - real implementation would use actual boundary)
        from shapely.geometry import MultiPoint

        points_2d = [(float(v[0]), float(v[1])) for v in vertices]
        multi_point = MultiPoint(points_2d)
        hull = multi_point.convex_hull

        if hull.geom_type == 'Polygon':
            footprint_coords = list(hull.exterior.coords)
        elif hull.geom_type == 'Point':
            # Single point - create small square
            x, y = hull.x, hull.y
            footprint_coords = [(x-0.5, y-0.5), (x+0.5, y-0.5), (x+0.5, y+0.5), (x-0.5, y+0.5)]
        else:
            return None

        return (footprint_coords, z_min, z_max)

    except Exception as e:
        logger.debug(f"Failed to extract room footprint for {ifc_space.GlobalId}: {e}")
        return None


def get_room_volumes_from_model(
    ifc_model,
    model_id: UUID,
) -> list[RoomVolume]:
    """
    Extract room volumes from an IFC model.

    Finds all IfcSpace entities and extracts their bounding volumes
    (2D footprint + Z range).

    Args:
        ifc_model: ifcopenshell file object
        model_id: Database ID of the model

    Returns:
        List of RoomVolume objects
    """
    import ifcopenshell.geom

    rooms = []

    # Set up geometry settings for extraction
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    # Find all IfcSpace entities
    spaces = ifc_model.by_type('IfcSpace')
    logger.info(f"Found {len(spaces)} IfcSpace entities in model")

    for space in spaces:
        try:
            footprint_data = extract_room_footprint(space, settings)
            if not footprint_data:
                continue

            footprint_coords, z_min, z_max = footprint_data

            # Get room name
            room_name = space.Name or space.LongName or f"Space {space.GlobalId[:8]}"

            # Get storey if available
            storey_id = None
            storey_name = None
            if hasattr(space, 'Decomposes') and space.Decomposes:
                for rel in space.Decomposes:
                    if hasattr(rel, 'RelatingObject'):
                        parent = rel.RelatingObject
                        if parent.is_a('IfcBuildingStorey'):
                            storey_name = parent.Name
                            break

            rooms.append(RoomVolume(
                room_guid=space.GlobalId,
                room_name=room_name,
                room_entity_id=None,  # Will be linked via Django lookup
                footprint_coords=footprint_coords,
                z_min=z_min,
                z_max=z_max,
                storey_id=storey_id,
                storey_name=storey_name,
            ))

        except Exception as e:
            logger.warning(f"Failed to extract room {space.GlobalId}: {e}")

    logger.info(f"Extracted {len(rooms)} room volumes")
    return rooms


def get_discrete_entities_from_model(
    ifc_model,
    model_id: UUID,
) -> list[EntityBasepoint]:
    """
    Extract discrete entity basepoints from an IFC model.

    Finds all discrete-type entities (vents, valves, fixtures, etc.)
    and extracts their centroid positions.

    Args:
        ifc_model: ifcopenshell file object
        model_id: Database ID of the model

    Returns:
        List of EntityBasepoint objects
    """
    import ifcopenshell.geom

    entities = []

    # Set up geometry settings
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    for ifc_type in DISCRETE_IFC_TYPES:
        try:
            elements = ifc_model.by_type(ifc_type)
            for element in elements:
                try:
                    shape = ifcopenshell.geom.create_shape(settings, element)
                    basepoint = extract_basepoint_from_geometry(shape, element)

                    if basepoint:
                        entities.append(EntityBasepoint(
                            entity_guid=element.GlobalId,
                            entity_id=None,  # Will be linked via Django lookup
                            ifc_type=ifc_type,
                            name=getattr(element, 'Name', None),
                            x=basepoint[0],
                            y=basepoint[1],
                            z=basepoint[2],
                            model_id=model_id,
                        ))

                except Exception as e:
                    logger.debug(f"Failed to extract basepoint for {element.GlobalId}: {e}")

        except Exception as e:
            logger.debug(f"No {ifc_type} entities found or error: {e}")

    logger.info(f"Extracted {len(entities)} discrete entity basepoints")
    return entities


def stitch_entities_to_rooms(
    entities: list[EntityBasepoint],
    rooms: list[RoomVolume],
) -> list[RoomAssignmentResult]:
    """
    Assign entities to rooms using point-in-volume logic.

    For each entity, find the room that contains its basepoint.
    Each entity is assigned to at most one room.

    Args:
        entities: List of EntityBasepoint objects
        rooms: List of RoomVolume objects

    Returns:
        List of RoomAssignmentResult objects
    """
    assignments = []

    for entity in entities:
        basepoint = (entity.x, entity.y, entity.z)

        for room in rooms:
            if point_in_room(basepoint, room):
                assignments.append(RoomAssignmentResult(
                    entity_id=entity.entity_id,
                    entity_guid=entity.entity_guid,
                    room_id=room.room_entity_id,
                    room_guid=room.room_guid,
                    room_name=room.room_name,
                    basepoint_x=entity.x,
                    basepoint_y=entity.y,
                    basepoint_z=entity.z,
                    confidence=1.0,  # Full confidence - point clearly inside
                ))
                break  # One room per entity

    return assignments


def stitch_model_to_rooms(
    mep_model,
    mep_model_id: UUID,
    room_volumes: list[RoomVolume],
) -> tuple[list[RoomAssignmentResult], int, int]:
    """
    Stitch all discrete entities in a model to rooms.

    Args:
        mep_model: ifcopenshell file object for MEP model
        mep_model_id: Database ID of MEP model
        room_volumes: Pre-extracted room volumes from ARK model

    Returns:
        Tuple of (assignments, entities_processed, entities_unassigned)
    """
    # Extract discrete entities from MEP model
    entities = get_discrete_entities_from_model(mep_model, mep_model_id)

    # Stitch to rooms
    assignments = stitch_entities_to_rooms(entities, room_volumes)

    entities_processed = len(entities)
    entities_assigned = len(assignments)
    entities_unassigned = entities_processed - entities_assigned

    return (assignments, entities_processed, entities_unassigned)


# =============================================================================
# High-Level API
# =============================================================================

def stitch_project_to_rooms(
    ark_model,
    ark_model_id: UUID,
    mep_models: list[tuple],  # List of (ifc_model, model_id) tuples
) -> StitchResult:
    """
    Stitch all discrete types in project to rooms from primary ARK model.

    Called when:
    - Models are uploaded
    - Primary ARK model changes
    - User manually triggers re-stitch

    Args:
        ark_model: ifcopenshell file object for ARK model
        ark_model_id: Database ID of ARK model (room source)
        mep_models: List of (ifc_model, model_id) tuples to stitch

    Returns:
        StitchResult with counts and any errors
    """
    errors = []
    all_assignments = []
    total_processed = 0
    total_unassigned = 0

    # Extract room volumes from ARK model
    try:
        room_volumes = get_room_volumes_from_model(ark_model, ark_model_id)
        if not room_volumes:
            return StitchResult(
                assignments_created=0,
                entities_processed=0,
                entities_unassigned=0,
                rooms_used=0,
                errors=["No rooms (IfcSpace) found in ARK model"]
            )
    except Exception as e:
        return StitchResult(
            assignments_created=0,
            entities_processed=0,
            entities_unassigned=0,
            rooms_used=0,
            errors=[f"Failed to extract rooms from ARK model: {e}"]
        )

    # Stitch each MEP model
    for mep_model, mep_model_id in mep_models:
        try:
            assignments, processed, unassigned = stitch_model_to_rooms(
                mep_model, mep_model_id, room_volumes
            )
            all_assignments.extend(assignments)
            total_processed += processed
            total_unassigned += unassigned
        except Exception as e:
            errors.append(f"Failed to stitch model {mep_model_id}: {e}")

    # Count unique rooms used
    rooms_used = len(set(a.room_guid for a in all_assignments))

    return StitchResult(
        assignments_created=len(all_assignments),
        entities_processed=total_processed,
        entities_unassigned=total_unassigned,
        rooms_used=rooms_used,
        errors=errors,
    )
