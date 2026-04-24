# Sprucelab - Data-First BIM Intelligence Platform

**"IFC in -> Actionable insight out. Types are the language. Data is the product."**

For BIM professionals who USE models, not create them. Dashboards, verification, and change detection are the product. The 3D viewer serves insights, not the other way around.

**Design Principle**: Every feature must answer: *Is this model ready? What needs attention? What changed?*

**Core Insight**: Types are the unit of coordination in BIM. A building has 50,000 entities but only 300-500 unique types.

**Tech Stack**: Django 5.0 + DRF | FastAPI (IFC processing) | PostgreSQL (Supabase) | React 18 + TypeScript + Vite | Tailwind v4 + shadcn/ui | ThatOpen + Three.js

**Docs**: PRD at `docs/plans/PRD_v2.md` | Worklogs at `docs/worklog/` | TODOs at `docs/todos/` | Reference at `docs/knowledge/`

---

## Types-Only Architecture

**CRITICAL**: Sprucelab extracts TYPES, not individual entities.

```
Parse:     IFC -> FastAPI extracts types only (2 sec for 100MB)
           Stores: IFCType + instance_count + key properties
Classify:  Type -> NS3451/OmniClass via TypeMapping (Django /api/types/)
Validate:  Per-type verification against ProjectConfig rules (FastAPI)
Export:    LCA export via material layers (Django /api/types/export-*)
```

**We DON'T store**: Individual entities, entity-level properties, geometry. Viewer loads IFC directly.

**Key Models**:
- `IFCType`: Per-model type with instance_count
- `TypeMapping`: Type -> classification (NS3451, unit, discipline, status)
- `TypeDefinitionLayer`: Material sandwich composition per type
- `TypeBankEntry`: Global canonical type (cross-project intelligence)
- `TypeBankObservation`: Where types appear across projects
- `ProjectConfig`: Per-project validation rules

**Key Files**:
- `backend/apps/entities/models/` - All type/classification models (Django app named `entities`, serves `/api/types/`)
- `backend/apps/projects/models.py` - ProjectConfig
- `backend/ifc-service/` - FastAPI microservice
- `frontend/src/components/features/warehouse/` - Type UI components
- `frontend/src/hooks/use-warehouse.ts` - Type data hooks

---

## Critical Rules

### IFC Data Integrity
- NEVER modify or reassign IFC GlobalIds (22-char unique identifiers)
- ALL geometry in world coordinates (`USE_WORLD_COORDS=True`)
- Always extract complete spatial hierarchy and ALL property sets

### Database
- Celery + Redis for IFC processing -- NEVER process IFC in Django request/response cycle
- Geometry NOT returned in list endpoints
- Paginate large lists (100 per page)

### TypeBank Rules
- Types identified by signature tuple `(ifc_class, type_name, predefined_type, material)`, not GUID
- Same type across projects -> classify once, reuse everywhere
- TypeBank is classification-only; verification rules live in ProjectConfig
- Materials/Types can exist in library WITHOUT instances (templates)

### Type Classification Workflow
1. Upload IFC -> types extracted in 2 seconds
2. Dashboard shows all types grouped by IFC class
3. User classifies types (NS3451 code, unit, notes)
4. Excel export for batch classification, Excel import to apply

**Keyboard Shortcuts** (TypeBrowser): Arrow keys navigate, `A` save+advance, `F` flag, `I` ignore, `Shift+F` fullscreen viewer

### Excel Integration
- `GET /api/types/export-excel/?model={id}` - Download template
- `POST /api/types/import-excel/` - Upload classifications
- Excel is for TYPE CLASSIFICATION only, not property editing

### LCA Export
- Each type has material layers (TypeDefinitionLayer): material name, thickness (mm), EPD reference
- Export requires: NS3451 classification + material layers + representative unit (pcs/m/m2/m3)
- Formats: Reduzer, OneClickLCA

### Verification Engine
- Per-project rules via ProjectConfig (core + custom rules)
- Output: per-type status (green/yellow/red), issue list, health score (% verified)

---

## Development Rules

### Workflow
- Planning docs: `docs/plans/` (timestamp format: `yyyy-mm-dd-hh-mm_Description.md`)
- Session worklogs: `docs/worklog/` (same timestamp format)
- Database changes: modify models -> `makemigrations` -> review -> `migrate`
- FastAPI changes: endpoints in `ifc-service/endpoints/`, services in `ifc-service/services/`

### Code Modularity
- Under 500 lines: fine. 500-800: review. Over 800: consider splitting.
- Cohesion > line count. Related models/ViewSets can exceed limits.
- Only split at natural boundaries with clear logical separations.

### Architecture
- **Django coordinates, FastAPI processes.** Django handles auth, CRUD, metadata. FastAPI handles IFC parsing, validation, heavy I/O.
- Reference: `docs/knowledge/django-vs-fastapi.md`

---

## Frontend Rules

### Layout Constraints
- **No max-width caps**: NEVER use `max-w-7xl` or similar with `mx-auto`. Content fills available space.
- **No viewport locking**: No `h-[calc(100vh-X)]` with `overflow-hidden`. Pages scroll naturally.
- **Cards**: Fixed heights (e.g. `h-[220px]`), `overflow-y-auto` for overflow.
- **Content sizing with clamp()**: ALL text, icons, spacing use `clamp(min, preferred, max)`:
  - Headings: `text-[clamp(1rem,3vw,1.5rem)]`
  - Body: `text-[clamp(0.625rem,1.2vw,0.75rem)]`
  - Small: `text-[clamp(0.5rem,1vw,0.625rem)]`
  - Icons: `h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)]`
  - Padding/gaps: `p-[clamp(0.5rem,1.5vw,1rem)]`
  - Metrics: `text-[clamp(1.5rem,4vw,2rem)]`

### Internationalization (i18n)
**CRITICAL**: ALL user-facing text MUST use the i18n system. NEVER hardcode strings.

```tsx
const { t } = useTranslation();
return <p>{t('common.save')}</p>;  // Correct
```

- Locale files: `frontend/src/i18n/locales/` (`en.json` + `nb.json`)
- Add keys to BOTH files. Use nested keys: `"section.subsection.key"`
- Backend returns translation keys, not translated strings

### 3D Viewer
- Reference: `docs/knowledge/viewer-controls.md`

---

## Error Handling

- **NEVER create fallbacks or use mock data** that obscures errors
- **Fail loudly and explicitly** -- surface errors to make problems visible
- Log errors with sufficient context for troubleshooting

---

## Quick Start

```bash
# Backend
cd backend && pip install -r requirements.txt
python manage.py migrate && python manage.py runserver

# FastAPI IFC Service
cd backend/ifc-service && pip install -r requirements.txt
uvicorn main:app --port 8001

# Frontend
cd frontend && yarn install && yarn dev
```

## When Continuing Work

1. Read latest worklog: `docs/worklog/`
2. Check TODOs: `docs/todos/current.md`
3. Review plans if needed: `docs/plans/`

---

## File Organization

```
sprucelab/
├── CLAUDE.md                   # This file
├── backend/
│   ├── config/                 # Django settings, URLs, Celery
│   ├── apps/
│   │   ├── accounts/           # User auth, admin dashboard
│   │   ├── projects/           # Project CRUD, ProjectConfig
│   │   ├── models/             # IFC model upload, versioning, fragments
│   │   ├── entities/           # Types, TypeBank, classification (serves /api/types/)
│   │   ├── scripting/          # Script execution system
│   │   ├── viewers/            # 3D viewer groups
│   │   ├── automation/         # Pipeline/workflow automation
│   │   └── field/              # Field checklists
│   ├── ifc-service/            # FastAPI microservice (IFC parsing, validation)
│   └── manage.py
├── frontend/
│   ├── src/
│   │   ├── pages/              # Route pages
│   │   ├── components/
│   │   │   ├── features/       # Domain components (warehouse, viewer, etc.)
│   │   │   ├── layout/         # Sidebar, header
│   │   │   └── ui/             # shadcn/ui primitives
│   │   ├── hooks/              # React Query hooks (use-warehouse, use-models, etc.)
│   │   ├── api/                # API clients (api-client.ts, ifc-service-client.ts)
│   │   └── i18n/               # Translations (en.json, nb.json)
│   └── package.json
├── docs/                       # Plans, worklogs, TODOs, knowledge, research
├── django-test/                # Standalone test scripts
└── archive/                    # Archived code (BEP, old scenes, etc.)
```

---

**Architecture**: Django + FastAPI + React + PostgreSQL (Supabase)
**Framework**: ifcopenshell + Norwegian Standards (NS-3451)
