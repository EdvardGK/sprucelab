"""
Build context for script execution.

Provides scripts with access to:
- Model data (entities, properties, systems, materials, types)
- Helper functions (get_geometry, get_properties, save_output)
- Whitelisted libraries (ifcopenshell, numpy, pandas, re)
"""
import re
import numpy as np
import pandas as pd
import ifcopenshell
from typing import Dict, Any, Callable
from collections import defaultdict, Counter
from apps.models.models import Model
from apps.entities.models import (
    IFCEntity,
    PropertySet,
    System,
    Material,
    IFCType,
    Geometry,
    MaterialAssignment,
    SystemMembership,
)


def build_script_context(model: Model, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build execution context for a script.

    Args:
        model: The Model to execute the script on
        parameters: User-provided parameters

    Returns:
        Dictionary with model data and helper functions
    """

    # Helper: Get geometry for an entity
    def get_geometry(entity_id: str):
        """Load geometry data for an entity."""
        try:
            geometry = Geometry.objects.get(entity_id=entity_id)

            # Decode vertices and faces from binary
            vertices = np.frombuffer(geometry.vertices_original, dtype=np.float64).reshape(-1, 3)
            faces = np.frombuffer(geometry.faces_original, dtype=np.int32).reshape(-1, 3)

            return {
                'vertices': vertices,
                'faces': faces,
                'vertex_count': len(vertices),
                'triangle_count': len(faces),
            }
        except Geometry.DoesNotExist:
            return None

    # Helper: Get properties for an entity
    def get_properties(entity_id: str):
        """Get all property sets for an entity."""
        properties = PropertySet.objects.filter(entity_id=entity_id)

        # Group by property set name
        psets = {}
        for prop in properties:
            if prop.pset_name not in psets:
                psets[prop.pset_name] = {}
            psets[prop.pset_name][prop.property_name] = {
                'value': prop.property_value,
                'type': prop.property_type,
            }

        return psets

    # Helper: Save output file (will be implemented with storage)
    def save_output(filename: str, data: Any):
        """
        Save output data to a file.

        For now, returns a dict to be stored in result_data.
        Future: Upload to Supabase Storage.
        """
        # TODO: Implement file upload to Supabase Storage
        return {
            'filename': filename,
            'data': data,
            'note': 'File storage not yet implemented - data returned in result_data'
        }

    # Build context dictionary
    context = {
        # Model object
        'model': model,
        'model_id': str(model.id),
        'model_name': model.name,

        # QuerySets for model data
        'entities': IFCEntity.objects.filter(model=model),
        'properties': PropertySet.objects.filter(entity__model=model),
        'systems': System.objects.filter(model=model),
        'materials': Material.objects.filter(model=model),
        'types': IFCType.objects.filter(model=model),

        # Model classes for lookups (for scripts to use)
        'MaterialAssignment': MaterialAssignment,
        'SystemMembership': SystemMembership,

        # Helper functions
        'get_geometry': get_geometry,
        'get_properties': get_properties,
        'save_output': save_output,

        # Whitelisted libraries
        'ifcopenshell': ifcopenshell,
        'np': np,
        'numpy': np,
        'pd': pd,
        'pandas': pd,
        're': re,
        'defaultdict': defaultdict,
        'Counter': Counter,

        # User parameters
        'params': parameters,
        'parameters': parameters,
    }

    return context


def get_safe_builtins():
    """
    Return a safe set of Python builtins for script execution.

    Removes dangerous functions like open(), eval(), exec(), etc.
    """
    safe_builtins = {
        # Type constructors
        'int': int,
        'float': float,
        'str': str,
        'bool': bool,
        'list': list,
        'dict': dict,
        'tuple': tuple,
        'set': set,

        # Utilities
        'len': len,
        'range': range,
        'enumerate': enumerate,
        'zip': zip,
        'map': map,
        'filter': filter,
        'sorted': sorted,
        'sum': sum,
        'min': min,
        'max': max,
        'abs': abs,
        'round': round,

        # Inspection
        'type': type,
        'isinstance': isinstance,
        'hasattr': hasattr,
        'getattr': getattr,

        # Output
        'print': print,

        # Exception handling
        'Exception': Exception,
        'ValueError': ValueError,
        'TypeError': TypeError,
        'KeyError': KeyError,
        'IndexError': IndexError,
    }

    return safe_builtins
