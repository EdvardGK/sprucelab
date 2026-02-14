"""IFC Toolkit - Battle-tested solutions to real IFC problems.

Not a wrapper around ifcopenshell.util. Each module solves a specific
problem that ifcopenshell doesn't solve out of the box.

Modules: core, analyze, placement, performance, normalize, profile,
batch, storeys, context, excel, report.

For standard operations, use ifcopenshell.util directly:
- Properties: ifcopenshell.util.element.get_psets(element)
- Materials:  ifcopenshell.util.element.get_materials(element)
- Types:      ifcopenshell.util.element.get_type(element)
- Units:      ifcopenshell.util.unit.calculate_unit_scale(ifc)
- Placement:  ifcopenshell.util.placement.get_local_placement(p)
"""

__version__ = "0.2.0"
