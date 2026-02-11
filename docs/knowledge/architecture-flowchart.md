# Sprucelab Architecture Flowchart

## High-Level System Architecture

```mermaid
flowchart TB
    subgraph Frontend["Frontend (React + Vite)"]
        subgraph Pages["Pages"]
            TLP[TypeLibraryPage]
            BMW[BIMWorkbench]
            PM[ProjectModels]
            FV[FederatedViewer]
        end

        subgraph Components["Components"]
            TLG[TypeLibraryGrid]
            TDP[TypeDetailPanel]
            VB[VerificationBadge]
            TMG[TypeMappingGrid]
            MLE[MaterialLayerEditor]
        end

        subgraph Hooks["React Query Hooks"]
            UW[use-warehouse.ts]
            UP[use-projects.ts]
            UM[use-models.ts]
        end
    end

    subgraph Backend["Backend Services"]
        subgraph Django["Django REST API :8000"]
            EA["api/entities"]
            PA["api/projects"]
            MA["api/models"]
            TLA["api/type-library"]
        end

        subgraph FastAPI["FastAPI IFC Service :8001"]
            IFC["ifc/parse"]
            VAL["ifc/validate"]
            PROP["ifc/properties"]
        end
    end

    subgraph Database["PostgreSQL (Supabase)"]
        TB[(TypeBankEntry)]
        TM[(TypeMapping)]
        IT[(IFCType)]
        PR[(Project)]
        MD[(Model)]
    end

    Pages --> Components
    Components --> Hooks
    Hooks -->|HTTP REST| Django
    Django -->|Internal| FastAPI
    Django -->|ORM| Database
    FastAPI -->|Direct SQL| Database
```

## Type Library Data Flow

```mermaid
flowchart LR
    subgraph UI["User Interface"]
        TLP[TypeLibraryPage]
        TLG[TypeLibraryGrid]
        TDP[TypeDetailPanel]
    end

    subgraph Hooks["React Query"]
        UGTL[useGlobalTypeLibrary]
        UGTS[useGlobalTypeLibrarySummary]
        UET[useEmptyTypes]
        UVT[useVerifyType]
        UFT[useFlagType]
    end

    subgraph API["Django API"]
        LIST["GET type-library"]
        SUM["GET unified-summary"]
        EMPTY["GET empty-types"]
        VER["POST verify"]
        FLAG["POST flag"]
    end

    subgraph Models["Database Models"]
        TBE[(TypeBankEntry)]
        TBO[(TypeBankObservation)]
    end

    TLP --> TLG
    TLP --> TDP
    TLG --> UGTL
    TLG --> UGTS
    TDP --> UVT
    TDP --> UFT

    UGTL --> LIST
    UGTS --> SUM
    UET --> EMPTY
    UVT --> VER
    UFT --> FLAG

    LIST --> TBE
    SUM --> TBE
    VER --> TBE
    FLAG --> TBE
    TBE --> TBO
```

## IFC Processing Pipeline

```mermaid
flowchart TD
    subgraph Upload["Model Upload"]
        UI[Upload Dialog]
        MU["POST models/upload"]
    end

    subgraph Processing["Celery Task"]
        CT[process_ifc_task]
        FP["FastAPI ifc/parse"]
    end

    subgraph Extraction["Type Extraction"]
        TE[Extract IFCTypes]
        TBM[TypeBank Matching]
        TBC[Create TypeBankObservation]
    end

    subgraph Storage["Database"]
        IT[(IFCType)]
        TBE[(TypeBankEntry)]
        TBO[(TypeBankObservation)]
        TM[(TypeMapping)]
    end

    UI -->|IFC File| MU
    MU -->|Queue| CT
    CT -->|HTTP| FP
    FP -->|ifcopenshell| TE
    TE --> TBM
    TBM --> TBC

    TE -->|Per-model types| IT
    TBM -->|Global canonical| TBE
    TBC -->|Links| TBO
    IT -->|Classification| TM
```

## Verification Workflow

```mermaid
stateDiagram-v2
    [*] --> Pending: Type extracted
    Pending --> Auto: Auto-classifier runs
    Pending --> Verified: Human verifies
    Pending --> Flagged: Human flags

    Auto --> Verified: Human approves
    Auto --> Flagged: Human rejects

    Verified --> Flagged: Human flags issue
    Flagged --> Verified: Human resolves

    Verified --> Pending: Reset
    Flagged --> Pending: Reset
    Auto --> Pending: Reset

    note right of Pending: ⚪ Not classified
    note right of Auto: 🟡 Needs review
    note right of Verified: 🟢 Human approved
    note right of Flagged: 🔴 Has issues
```

## Frontend Component Hierarchy

```mermaid
flowchart TD
    subgraph App["App.tsx (Router)"]
        R[RouterProvider]
    end

    subgraph Routes["Routes"]
        R --> TLP["/type-library → TypeLibraryPage"]
        R --> BMW["/projects/:id/workbench → BIMWorkbench"]
        R --> PM["/projects/:id/models → ProjectModels"]
        R --> FV["/projects/:id/viewer/:groupId → FederatedViewer"]
    end

    subgraph TypeLibrary["TypeLibraryPage"]
        TLP --> AL[AppLayout]
        AL --> FB[FilterBar]
        AL --> TLG[TypeLibraryGrid]
        AL --> TDP[TypeDetailPanel]
    end

    subgraph Grid["TypeLibraryGrid"]
        TLG --> GH[GroupedHeaders]
        TLG --> TR[TypeRow]
        TR --> VSI[VerificationStatusIcon]
    end

    subgraph Detail["TypeDetailPanel"]
        TDP --> HS[HeroSection]
        TDP --> VB[VerificationBadge]
        TDP --> TAB[Tabs]
        TAB --> CT[ClassificationTab]
        TAB --> MT[MaterialsTab]
        TAB --> PT[ProductTab]
        TAB --> OT[ObservationsTab]
        TAB --> VT[VerificationTab]
    end
```

## API Endpoints Map

```mermaid
flowchart LR
    subgraph Django["Django API"]
        subgraph Projects["projects"]
            PL["GET list"]
            PC["POST create"]
            PD["GET detail"]
        end

        subgraph Models["models"]
            ML["GET list"]
            MU["POST upload"]
            MD["GET detail"]
            MS["GET status"]
        end

        subgraph Entities["entities"]
            subgraph TypeLib["type-library"]
                TLL["GET list"]
                TLS["GET summary"]
                TLE["GET empty"]
                TLV["POST verify"]
                TLF["POST flag"]
                TLR["POST reset"]
            end

            subgraph Types["types"]
                TYL["GET list"]
                TYE["GET excel"]
                TYI["POST excel"]
                TYR["GET reduzer"]
            end

            subgraph TypeBank["typebank"]
                TBL["GET list"]
                TBD["GET detail"]
            end
        end
    end

    subgraph FastAPI["FastAPI IFC"]
        IP["POST parse"]
        IV["POST validate"]
        IPR["GET properties"]
        IEL["GET elements"]
    end
```

## Data Models Relationship

```mermaid
erDiagram
    Project ||--o{ Model : contains
    Model ||--o{ IFCType : extracts
    IFCType ||--o| TypeMapping : has
    TypeMapping ||--o{ TypeDefinitionLayer : contains

    TypeBankEntry ||--o{ TypeBankObservation : observed_in
    TypeBankObservation }o--|| IFCType : links_to
    TypeBankEntry ||--o{ TypeBankAlias : aliases

    TypeBankEntry {
        uuid id PK
        string ifc_class
        string type_name
        string predefined_type
        string material
        string verification_status
        datetime verified_at
        string flag_reason
    }

    IFCType {
        uuid id PK
        uuid model_id FK
        string type_guid
        string type_name
        string ifc_type
        int instance_count
    }

    TypeMapping {
        uuid id PK
        uuid ifc_type_id FK
        string ns3451_code
        string representative_unit
        string mapping_status
        string verification_status
    }

    TypeDefinitionLayer {
        uuid id PK
        uuid type_mapping_id FK
        int layer_order
        string material_name
        float thickness_mm
        string ns3457_code
    }
```

## Hook to API Mapping

| Hook | HTTP Method | Endpoint | Purpose |
|------|-------------|----------|---------|
| `useGlobalTypeLibrary` | GET | `/api/entities/type-library/` | List all types with filters |
| `useGlobalTypeLibrarySummary` | GET | `/api/entities/type-library/unified-summary/` | Dashboard stats |
| `useEmptyTypes` | GET | `/api/entities/type-library/empty-types/` | Types with 0 instances |
| `useVerifyType` | POST | `/api/entities/type-library/{id}/verify/` | Mark as verified |
| `useFlagType` | POST | `/api/entities/type-library/{id}/flag/` | Flag with reason |
| `useResetVerification` | POST | `/api/entities/type-library/{id}/reset-verification/` | Reset to pending |
| `useProjects` | GET | `/api/projects/` | List projects |
| `useModels` | GET | `/api/models/` | List models |
| `useTypeMappings` | GET | `/api/entities/types/` | Per-model types |
| `useTypeBank` | GET | `/api/entities/typebank/` | Global type bank |

## File Structure

```
frontend/src/
├── App.tsx                          # Router with all routes
├── pages/
│   ├── TypeLibraryPage.tsx          # /type-library
│   ├── BIMWorkbench.tsx             # /projects/:id/workbench
│   ├── ProjectModels.tsx            # /projects/:id/models
│   └── FederatedViewer.tsx          # /projects/:id/viewer/:groupId
├── components/features/warehouse/
│   ├── TypeLibraryGrid.tsx          # Grouped column grid
│   ├── TypeDetailPanel.tsx          # Detail panel with tabs
│   ├── VerificationBadge.tsx        # Status badges
│   ├── TypeMappingGrid.tsx          # Per-model type grid
│   └── MaterialLayerEditor.tsx      # Material sandwich editor
├── hooks/
│   ├── use-warehouse.ts             # Type library hooks
│   ├── use-projects.ts              # Project hooks
│   └── use-models.ts                # Model hooks
└── i18n/locales/
    ├── en.json                      # English translations
    └── nb.json                      # Norwegian translations

backend/apps/entities/
├── models.py                        # TypeBankEntry, IFCType, TypeMapping
├── views.py                         # GlobalTypeLibraryViewSet, etc.
├── serializers.py                   # DRF serializers
├── urls.py                          # API routes
└── migrations/
    └── 0024_add_verification_status.py

backend/ifc-service/
├── main.py                          # FastAPI app
├── endpoints/
│   ├── ifc_operations.py            # /ifc/parse, /ifc/export
│   └── property_editor.py           # /ifc/properties
└── services/
    ├── ifc_parser.py                # ifcopenshell operations
    └── validation_engine.py         # Validation rules
```
