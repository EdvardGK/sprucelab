# Sprucelab Technical Maintainability Assessment
**Engineering Team Perspective: Iterating Fast While Maintaining Stability**

---

## Executive Summary

| Area | Score | Risk Level | Key Concern |
|------|-------|------------|-------------|
| **Backend Architecture** | 7/10 | Medium | 1,600-line views.py needs splitting |
| **Frontend Structure** | 5/10 | High | 0% test coverage, 0% i18n usage |
| **Infrastructure** | 3/10 | Critical | Production secrets in git |
| **Error Handling** | 4/10 | High | 131 print statements, bare excepts |
| **Testing** | 1/10 | Critical | Near-zero coverage across stack |
| **Security** | 2/10 | Critical | Exposed credentials, DEBUG=True in prod |

**Bottom Line:** Good macro architecture, critical gaps in security and testing. Fast iteration is possible but risky without addressing foundational issues first.

---

## CRITICAL: Security Issues (Fix Immediately)

### Production Secrets Exposed in Git

**Files with credentials committed:**
- `.env` (root) - Supabase keys, DB password, S3 keys, GitHub PAT
- `backend/.env.local` - Same production secrets
- `frontend/.env.production` - Supabase anon key
- `dev.sh` (line 28-32) - Hardcoded Supabase key

**Exposed credentials:**
- Supabase JWT Secret: `6f9c42e6-feb2-430e-...`
- Database Password: `frDkM9S!iGTDo7kn`
- S3 Secret Key: `c8b763dd468096f1a0d41edb...`
- GitHub PAT: `ghp_ulrHYLclfQOE2pypm...`

**Impact:** Anyone with repo access can access database, storage, and GitHub.

**Action Required:**
1. Rotate ALL credentials immediately
2. Add `.env` to `.gitignore`
3. Use Railway/Vercel dashboard for secrets only
4. Scrub git history with `git filter-branch` or BFG

### DEBUG Mode Bypasses Authentication

**File:** `backend/ifc-service/core/auth.py` (lines 22-24)
```python
if settings.DEBUG and not x_api_key:
    return True  # No auth required in DEBUG mode
```

**File:** `backend/ifc-service/config.py` (line 18)
```python
DEBUG: bool = True  # Default is True, not overridden in production
```

**Impact:** FastAPI IFC service accepts unauthenticated requests in production.

---

## Backend Assessment

### What Works Well

| Aspect | Evidence |
|--------|----------|
| App Organization | 7 focused Django apps with clear domains |
| Service Layer | Proper Django/FastAPI separation |
| Database Queries | `select_related`/`prefetch_related` used correctly |
| Migrations | Clean, sequential, well-organized |
| API Patterns | Standard DRF conventions followed |

### Critical Issues

#### 1. Oversized Files

| File | Lines | Issue |
|------|-------|-------|
| `backend/apps/models/views.py` | **1,603** | 24 action methods in one ViewSet |
| `backend/ifc-service/services/ifc_parser.py` | 823 | Complex parsing logic |
| `backend/apps/models/tasks.py` | 647 | 7 async tasks, could be sub-modules |
| `backend/apps/bep/management/commands/load_bep_templates.py` | 910 | Embedded template data |

**Recommendation:** Split `ModelViewSet` into:
- `ModelViewSet` - Basic CRUD
- `ModelUploadViewSet` - Upload operations
- `ModelVersionViewSet` - Version/fork management
- `ModelFragmentsViewSet` - Geometry operations

#### 2. Logging: 131 Print Statements

**Current state:** Zero use of Python logging module
```python
# Throughout tasks.py:
print(f"❌ {error_msg}")  # Should be logger.error()
```

**Impact:** No log levels, no structured output, no production debugging.

#### 3. Error Handling: Bare Exceptions

**File:** `backend/apps/models/tasks.py` (line 259)
```python
except:
    pass  # Silently ignores ALL exceptions
```

**Impact:** Failures hidden, no error tracking, silent data corruption possible.

#### 4. Test Coverage: 3 Test Files Total

**Found:**
- `apps/models/management/commands/test_django_q.py`
- `apps/scripting/test_execution.py`
- `apps/scripting/tests.py` (minimal)

**Missing:**
- ModelViewSet tests (1,600 lines untested)
- Entity extraction tests
- API integration tests
- Error scenario tests

---

## Frontend Assessment

### What Works Well

| Aspect | Evidence |
|--------|----------|
| Component Organization | Clear `/pages/`, `/components/`, `/features/` structure |
| React Query | Solid patterns with query keys and mutations |
| TypeScript | Comprehensive types in `api-types.ts` |
| Upload Handling | Real progress tracking with XHR |

### Critical Issues

#### 1. Zero Test Coverage

**Found:** 0 test files (no `.test.tsx`, `.spec.tsx`, or test directories)

**Impact:** Cannot refactor safely, bugs only found in production.

#### 2. Zero i18n Usage

**CLAUDE.md states:** "ALL user-facing text MUST use i18n system"

**Reality:** `t()` function usage = 0
- `react-i18next` configured but unused
- All UI strings hardcoded
- `ProjectModels.tsx`: "Upload Model", "IFC Models", "Gallery" hardcoded
- `Sidebar.tsx`: Search labels hardcoded

#### 3. Oversized Components

| File | Lines | Issue |
|------|-------|-------|
| `components/features/warehouse/TypeLibraryPanel.tsx` | 655 | Exceeds 500-line threshold |
| `components/Layout/Sidebar.tsx` | 486 | Mixed responsibilities |
| `components/features/warehouse/TypeMappingWorkspace.tsx` | 574 | Form + import logic mixed |
| `hooks/use-warehouse.ts` | 627 | 150+ type definitions in hook file |

#### 4. State Management Sprawl

**FederatedViewer.tsx** manages 15+ state variables:
```typescript
modelVisibility, rightCollapsed, activeTab, colorMode,
colorProperty, filterPresets, activePreset, sectionPlanes,
activePlaneId, selectedElement, typeFilters, ...
```

**Recommendation:** Create `ViewerContext` to consolidate viewer state.

#### 5. Code Duplication

- Type mapping progress bar duplicated in gallery + table views
- `formatNumber` helper duplicated (should be in `lib/format.ts`)
- Dialog patterns repeated across 5+ components

---

## Infrastructure Assessment

### What Works Well

| Aspect | Evidence |
|--------|----------|
| Docker Compose | Proper health checks, service dependencies |
| FastAPI Dockerfile | Multi-stage build, non-root user |
| Railway Config | Health check configured |

### Critical Issues

#### 1. Django Container Runs as Root

**File:** `backend/Dockerfile.django`
- No `USER` directive
- Security vulnerability in production

#### 2. No Logging Persistence

```yaml
# docker-compose.yml
# No volume mount for /app/logs/
# Logs lost on container restart
```

#### 3. Connection Pool Configuration

**File:** `backend/config/settings.py` (line 101)
```python
conn_max_age=0  # Creates new connection per request
```

**File:** `backend/ifc-service/core/database.py` (lines 34-40)
```python
min_size=2,              # Too low under load
max_size=10,             # Supabase recommends 20-30
statement_cache_size=0   # Disables prepared statements
```

#### 4. Open API Permissions

**File:** `backend/config/settings.py` (line 214-216)
```python
'DEFAULT_PERMISSION_CLASSES': [
    'rest_framework.permissions.AllowAny',  # TODO: Change to IsAuthenticated
]
```

**Impact:** All API endpoints are publicly accessible.

---

## Risk Assessment for Fast Iteration

### High-Risk Areas (Careful Changes)

| Area | Risk | Reason |
|------|------|--------|
| `apps/models/views.py` | High | 1,600 lines, 0 tests, complex upload logic |
| `apps/models/tasks.py` | High | Async processing, bare exceptions hide failures |
| `ifc-service/services/ifc_parser.py` | High | Complex IFC extraction, memory-intensive |
| TypeLibraryPanel.tsx | Medium | 655 lines, core feature |

### Safe-to-Change Areas (Low Risk)

| Area | Risk | Reason |
|------|------|--------|
| Placeholder pages | Low | No real functionality |
| UI styling | Low | CSS/Tailwind changes isolated |
| New API endpoints | Low | DRF conventions established |
| New React hooks | Low | Patterns already established |

---

## Recommended Actions (Priority Order)

### Tier 1: Critical Security (This Week)

1. **Rotate all exposed credentials**
   - Supabase keys, DB password, S3 keys, GitHub PAT

2. **Fix secret management**
   - Add `.env` to `.gitignore`
   - Use Railway/Vercel env vars only

3. **Disable DEBUG in production**
   - Set `DEBUG=False` in Railway FastAPI config

### Tier 2: Stability Foundation (Next 2 Weeks)

4. **Add logging infrastructure**
   - Replace 131 print statements with `logging.error()/info()`
   - Configure structured JSON logging

5. **Fix error handling**
   - Replace bare `except:` with specific exceptions
   - Add error tracking (Sentry)

6. **Add critical tests**
   - ModelViewSet upload/status tests
   - API integration tests
   - Frontend component tests (Jest + RTL)

### Tier 3: Maintainability (Ongoing)

7. **Split oversized files**
   - ModelViewSet → 4 specialized ViewSets
   - TypeLibraryPanel → extract TypeGroup component
   - use-warehouse.ts → separate types file

8. **Implement i18n**
   - Add translation keys to all hardcoded strings
   - Add linter rule to catch new hardcoded strings

9. **Create ViewerContext**
   - Consolidate FederatedViewer state
   - Reduce prop drilling

---

## Quick Reference: File Sizes

### Backend (>500 lines)
```
1,603  backend/apps/models/views.py
  910  backend/apps/bep/management/commands/load_bep_templates.py
  823  backend/ifc-service/services/ifc_parser.py
  749  backend/apps/bep/models.py
  647  backend/apps/models/tasks.py
  645  backend/ifc-service/services/ifc_repository.py
  642  backend/apps/entities/models.py
```

### Frontend (>400 lines)
```
  655  frontend/src/components/features/warehouse/TypeLibraryPanel.tsx
  627  frontend/src/hooks/use-warehouse.ts
  574  frontend/src/components/features/warehouse/TypeMappingWorkspace.tsx
  496  frontend/src/hooks/useSectionPlanes.ts
  486  frontend/src/components/Layout/Sidebar.tsx
  426  frontend/src/pages/ProjectModels.tsx
```

---

## Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Security | 2/10 | Secrets exposed, DEBUG bypasses auth |
| Testing | 1/10 | 3 backend tests, 0 frontend tests |
| Error Handling | 4/10 | Bare exceptions, print debugging |
| Code Organization | 7/10 | Good structure, some oversized files |
| API Design | 7/10 | DRF patterns, missing auth |
| Database | 6/10 | Good schema, poor pooling config |
| Logging | 2/10 | 131 print statements, 0 logging |
| Documentation | 6/10 | CLAUDE.md is good, code docs sparse |
| **Overall** | **4.4/10** | **Critical gaps need addressing** |

**Bottom Line:** The architecture is sound, but the codebase has accumulated technical debt that makes fast iteration risky. Address security and testing before aggressive feature development.
