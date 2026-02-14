# Session: Sidebar Restructure & Production Analysis Fix

## Summary

Reorganized the project sidebar navigation into logical groups (Files, Data, BIM Workbench) and fixed the model analysis endpoint for production (Supabase URL download).

## Changes

### Sidebar Restructure
- Split "Data" section into **Files** (Models, Drawings, Documents) and **Data** (Type Library, Material Library, Spaces, QTO)
- Replaced Modules + Workbench sub-nav with always-visible **BIM Workbench** section: Classification, Verification, IFC Editing, BEP Config
- Removed Scripting from sidebar nav
- Added translation keys: `spaces`, `qto`, `verification`, `ifcEditing` (en + nb)

### Production Analysis Fix
- `backend/apps/entities/views.py` - `run_analysis` now handles three URL types:
  - Local file path (passthrough)
  - Local dev media URL (resolve to MEDIA_ROOT)
  - Remote URL / Supabase (download to temp file, clean up after)
- `backend/requirements.txt` - Added `ifc-toolkit>=0.2.0` (was missing from production deps)

## Next
- Spaces and QTO pages are nav-only placeholders (routes will 404)
- Verification and IFC Editing workbench views need implementation
