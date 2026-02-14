# Session: Sidebar Restructure & Production Analysis Fix

## Summary

Reorganized the project sidebar navigation into logical groups (Files, Data, BIM Workbench) and fixed the model analysis endpoint for production (Supabase URL download + vendored ifc-toolkit).

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

### Vendored ifc-toolkit
- **Problem**: `ifc-toolkit` was a local editable install (`~/dev/resources/ifc-toolkit`), not on PyPI. Adding it to `requirements.txt` broke the Railway build.
- **Solution**: Copied source into `backend/lib/ifc_toolkit/` and added `sys.path.insert(0, str(BASE_DIR / 'lib'))` to Django settings.
- **Pattern**: `backend/lib/` is now the vendored packages directory. Any local-only Python package can be placed here and it will be importable by both Django and any script that loads Django settings.
- Removed `ifc-toolkit>=0.2.0` from `requirements.txt`

## Key Insight: Vendored Dependencies

ifc-toolkit is our own IFC analysis library (2500 LOC, 12 modules). It was developed standalone in `~/dev/resources/ifc-toolkit/` but has no PyPI release or git remote. For production deployment on Railway:

- **Don't add local packages to requirements.txt** - they only exist on the dev machine
- **Vendor into `backend/lib/`** - copy source, add to sys.path via settings.py
- **Keep in sync manually** - changes to the original need to be re-copied
- Long-term: consider publishing to PyPI or a private GitHub repo if the package stabilizes

## Next
- Spaces and QTO pages are nav-only placeholders (routes will 404)
- Verification and IFC Editing workbench views need implementation
