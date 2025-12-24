# Sprucelab UX Assessment
**Team Perspectives: BIM Coordinator, Project Manager, Design Lead**

---

## What We Like

### 1. Clean Visual Design
- Consistent styling with clear hierarchy
- Status badges make model states obvious (uploading → processing → ready)
- Good use of icons - immediately recognizable actions

### 2. 3D Viewer Works Well
- ThatOpen viewer loads smoothly
- Type filtering toolbar (left side) is intuitive
- Multi-model federated viewing is powerful
- Color-by-property feature is useful for analysis

### 3. Type Mapping Core
- NS-3451 mapping workflow exists and functions
- Can see instance counts per type
- Export options (Excel, Reduzer) are useful

### 4. Upload Flow (Recent Improvements)
- Direct upload to Supabase prevents timeouts
- Progress bars per file
- Can minimize dialog while uploads continue

---

## What We Don't Like

### 1. Too Many Placeholder Pages
**Impact: Confusing, feels unfinished**
- Documents, Drawings, My Issues, My RFIs, Scripts, Quick Stats, Settings
- All show "Coming Soon" - undermines confidence
- **Recommendation:** Hide or remove until implemented

### 2. Dashboard is Disconnected
**Impact: No clear value, slow to load**
- Statistics take 30+ seconds (now fixed with indexes)
- KPIs shown aren't actionable
- Auto-redirects away if no models - confusing first experience
- **Recommendation:** Make Models page the default, or merge dashboard into it

### 3. Type Mapping is Buried
**Impact: Core feature is hard to find**
- 5+ clicks to reach: Dashboard → Models/Workbench → Select Model → Types → Click Type
- Workbench has confusing sub-navigation
- Model dropdown doesn't show which model has unmapped types
- **Recommendation:** Surface mapping progress on Models page, direct link to unmapped types

### 4. No Version Comparison
**Impact: Can't track changes between model versions**
- Shows "Latest version" but can't view old versions
- No diff/changelog between uploads
- **Recommendation:** Add version history panel, highlight changes

### 5. Properties Panel Too Narrow
**Impact: Property values truncated, hard to read**
- 80px fixed width cuts off text
- Only shows when element selected
- **Recommendation:** Wider panel, persistent mode, copy-to-clipboard

### 6. No Inline Actions
**Impact: Extra navigation required**
- Can't delete model from dashboard
- Can't create viewer group from anywhere except Viewer Groups page
- Can't edit project after creation
- **Recommendation:** Add context menus, quick actions

---

## Requested Changes

### Priority 1: Simplify Navigation

**Current:**
```
Projects → Project Dashboard → Models → Workbench → Types → Map
```

**Proposed:**
```
Projects → Project (Models + Stats combined) → Type Mapper
```

- Make Models page the landing page for a project
- Add summary stats (element count, mapping progress) to Models page header
- Remove separate Dashboard or make it optional

### Priority 2: Surface Mapping Status

On the Models page, show per-model:
- Mapping progress: "42/150 types mapped (28%)"
- Quick action: "Map Types" button → goes directly to type mapper for that model
- Visual indicator: progress bar or badge

### Priority 3: Hide Unfinished Features

Remove from navigation until implemented:
- Documents
- Drawings
- My Issues / My RFIs
- Scripts Library
- Quick Stats
- Settings (or make functional)

### Priority 4: Improve Workbench

Current tabs: Type Library | Material Library | Mapping Stats | BEP Config | Scripting

**Issues:**
- Material Library is placeholder
- Scripting is placeholder
- BEP Config is separate but related to Types

**Proposed:**
- Single "Type Mapper" view as primary
- Material mapping as secondary tab (when ready)
- Remove placeholder tabs entirely

### Priority 5: Model Card Improvements

Add to model cards:
- Mapping progress indicator
- Quick actions: View 3D | Map Types | Delete
- Version count badge (if multiple versions exist)
- Processing error details (if failed)

---

## Feature Requests (Future)

### 1. Validation Dashboard
- Show validation results prominently
- Link issues to specific elements
- Track resolution status

### 2. Change Detection
- Compare versions side-by-side
- Highlight added/removed/modified elements
- Export change report

### 3. Bulk Type Mapping
- Select multiple types, assign same NS-3451 code
- Import mappings from Excel
- Copy mappings from another project

### 4. Notifications
- Email/push when processing completes
- Alert when validation issues found
- Notify team of new uploads

### 5. Collaboration
- Comments on models/types
- Assignment of mapping tasks
- Activity feed per project

---

## Summary

| Category | Score | Notes |
|----------|-------|-------|
| Visual Design | 8/10 | Clean, consistent, modern |
| Navigation | 5/10 | Too many clicks, confusing hierarchy |
| Core Features | 7/10 | Upload, viewing, mapping work |
| Completeness | 4/10 | Many placeholders |
| Performance | 6/10 | Viewer good, stats were slow (now fixed) |

**Top 3 Actions:**
1. Make Models page the project landing page
2. Hide placeholder features
3. Add mapping progress to model cards
