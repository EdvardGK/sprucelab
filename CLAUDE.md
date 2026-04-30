# Sprucelab - Data-First BIM Intelligence Platform

**"Files in -> Data streams out. No file is an orphan. Every format feeds the whole."**

For BIM professionals who USE models, not create them. Dashboards, verification, and change detection are the product. The 3D viewer serves insights, not the other way around.

**Design Principles**:
- Every feature must answer: *Is this model ready? What needs attention? What changed?*
- **Agent-first, human-second.** The GUI is human-first, but the data layer, APIs, processing pipeline, and CLI serve agents, automation, and scripting as primary consumers. Every operation must be API-accessible with structured (JSON) output. No operation requires a human in the loop unless explicitly flagged. Status transitions are predictable and pollable. Extraction results are queryable, filterable, and diffable.

**Core Insight**: Types are the unit of coordination in BIM. A building has 50,000 entities but only 300-500 unique types.

**Tech Stack**: Django 5.0 + DRF | FastAPI (file processing) | PostgreSQL (Supabase) | React 18 + TypeScript + Vite | Tailwind v4 + shadcn/ui | ThatOpen + Three.js

**Docs**: PRD at `docs/plans/PRD_v2.md` | Worklogs at `docs/worklog/` | TODOs at `docs/todos/` | Reference at `docs/knowledge/` | API map at `docs/knowledge/API_SURFACE.md`

---

## Data Foundation Architecture

### Layered Processing Model

Every file dropped into Sprucelab becomes a data stream, not an orphan entity. The pipeline is format-agnostic at the edges and format-specific in extraction.

```
Layer 0 - Source:      SourceFile (filesystem facts: name, size, format, checksum)
Layer 1 - Extraction:  ExtractionRun (what the extractor discovered: CRS, units, types, structure)
Layer 2 - Data:        Format-specific extracted data (IFCType, layers, spatial, properties)
Layer 3 - Intelligence: TypeBank, classification, verification, cross-project linking
```

**Supported/planned formats**:
- **3D Models**: IFC (primary), point clouds (LAS/LAZ/E57)
- **Drawings**: DWG/DXF, SVG, PDF (drawing sheets)
- **Documents**: PDF, Office suite (DOCX/XLSX/PPTX)
- **Structured data**: JSON, XML, CSV, Excel

CRS and units are discovered during extraction (Layer 1), not assumed at upload (Layer 0).

### Types-Only Architecture (IFC)

**CRITICAL**: For IFC files, Sprucelab extracts TYPES, not individual entities.

```
Parse:     IFC -> FastAPI extracts types only (2 sec for 100MB)
           Stores: IFCType + instance_count + key properties
Classify:  Type -> NS3451/OmniClass via TypeMapping (Django /api/types/)
Validate:  Per-type verification against ProjectConfig rules (FastAPI)
Export:    LCA export via material layers (Django /api/types/export-*)
```

**We DON'T store**: Individual entities, entity-level properties, geometry. Viewer loads IFC directly.

**Key Models**:
- `SourceFile`: Format-agnostic file record (every file gets one, no orphans)
- `ExtractionRun`: Processing run with status, log, discovered CRS/units, quality report
- `IFCType`: Per-model type with instance_count
- `TypeMapping`: Type -> classification (NS3451, unit, discipline, status)
- `TypeDefinitionLayer`: Material sandwich composition per type
- `TypeBankEntry`: Global canonical type (cross-project intelligence)
- `TypeBankObservation`: Where types appear across projects
- `ProjectConfig`: Per-project validation rules

**Key Files**:
- `backend/apps/entities/models/` - All type/classification models (Django app named `entities`, serves `/api/types/`)
- `backend/apps/projects/models.py` - ProjectConfig
- `backend/ifc-service/` - FastAPI microservice (IFC extraction, will expand to other formats)
- `frontend/src/components/features/warehouse/` - Type UI components
- `frontend/src/hooks/use-warehouse.ts` - Type data hooks

---

## Critical Rules

### IFC Data Integrity
- NEVER modify or reassign IFC GlobalIds (22-char unique identifiers)
- ALL geometry in world coordinates (`USE_WORLD_COORDS=True`)
- Always extract complete spatial hierarchy and ALL property sets

### Database
- Celery + Redis for file processing -- NEVER process files in Django request/response cycle
- Geometry NOT returned in list endpoints
- Paginate large lists (100 per page)
- **No silent data loss**: Every extraction must produce a structured processing log. Dropped elements, skipped properties, unit conversion warnings -- all logged to ExtractionRun, visible via API

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
- **Django coordinates, FastAPI processes.** Django handles auth, CRUD, metadata. FastAPI handles file extraction (IFC parsing, validation, heavy I/O).
- **Agent-first API design**: Every endpoint returns structured JSON. Processing events are machine-readable (structured logs, not prose). Status fields use finite enums, not free text. All mutations support `?dry_run=true` where applicable. No endpoint should require interactive/human flow to complete.
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

## Common Patterns

### Adding a DRF ViewSet

```python
# 1. Model: apps/{app}/models.py
# 2. Serializer: apps/{app}/serializers.py
class ThingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Thing
        fields = ['id', 'name', ...]

class ThingListSerializer(serializers.ModelSerializer):  # lightweight for lists
    class Meta:
        model = Thing
        fields = ['id', 'name']

# 3. ViewSet: apps/{app}/views.py
class ThingViewSet(viewsets.ModelViewSet):
    queryset = Thing.objects.all()
    serializer_class = ThingSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return ThingListSerializer
        return ThingSerializer

    @action(detail=True, methods=['post'], url_path='do-something')
    def do_something(self, request, pk=None):
        obj = self.get_object()
        # ... business logic
        return Response({'status': 'ok'})

# 4. URL: apps/{app}/urls.py
router.register(r'things', ThingViewSet, basename='thing')

# 5. Wire in config/urls.py:
path('api/things/', include('apps.{app}.urls')),
```

### Adding a FastAPI Endpoint

```python
# 1. Schema: ifc-service/models/schemas.py (Pydantic)
class ThingResponse(BaseModel):
    status: str
    data: dict

# 2. Service: ifc-service/services/thing_service.py (business logic)
# 3. Endpoint: ifc-service/api/thing.py
router = APIRouter(prefix="/thing", tags=["thing"])

@router.post("/process", response_model=ThingResponse)
async def process_thing(request: ThingRequest):
    result = await thing_service.process(request)
    return ThingResponse(status="ok", data=result)

# 4. Wire in ifc-service/api/router.py:
from api.thing import router as thing_router
api_router.include_router(thing_router)
```

### Adding a React Query Hook

```tsx
// In hooks/use-{feature}.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// Query keys factory
const featureKeys = {
  all: ['feature'] as const,
  list: (filters: Record<string, unknown>) => [...featureKeys.all, 'list', filters] as const,
  detail: (id: string) => [...featureKeys.all, 'detail', id] as const,
};

// Read hook
export function useFeatureList(filters = {}) {
  return useQuery({
    queryKey: featureKeys.list(filters),
    queryFn: async () => {
      const response = await apiClient.get('/types/feature/', { params: filters });
      return response.data.results;
    },
  });
}

// Mutation hook
export function useUpdateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Feature> }) => {
      const response = await apiClient.patch(`/types/feature/${id}/`, data);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: featureKeys.all }),
  });
}
```

---

## Error Handling

- **NEVER create fallbacks or use mock data** that obscures errors
- **Fail loudly and explicitly** -- surface errors to make problems visible
- Log errors with sufficient context for troubleshooting

---

## Quick Start

```bash
# One-command dev kit (requires `just`: pacman -S just)
just up           # Postgres + Redis up, migrations applied
just dev          # Full interactive stack (Django, FastAPI, Vite)
just test         # Unit tests
just test-e2e     # End-to-end tests (boots its own FastAPI subprocess)
just routes       # Print URL conf as a flat list (agent-friendly)
just api GET /files/?project=<uuid>   # Curl wrapper

# Manual fallback
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
│   │   ├── models/             # SourceFile, Model upload, versioning, fragments
│   │   ├── entities/           # Types, TypeBank, classification (serves /api/types/)
│   │   ├── scripting/          # Script execution system
│   │   ├── viewers/            # 3D viewer groups
│   │   ├── automation/         # Pipeline/workflow automation
│   │   └── field/              # Field checklists
│   ├── ifc-service/            # FastAPI microservice (file extraction: IFC, point cloud, drawings, structured data)
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
**Extraction**: ifcopenshell (IFC) | planned: laspy (LAS/LAZ), ezdxf (DWG/DXF), pdfplumber (PDF), openpyxl (Excel)
**Standards**: Norwegian Standards (NS-3451), EPSG CRS registry
