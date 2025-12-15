# MVP: Standalone IFC Viewer

**Goal:** Minimum viable product for viewing IFC files in the browser.

---

## What This Is

A simple, client-side IFC viewer that works independently:
- Upload IFC file
- View in 3D
- Navigate model
- Select elements
- View properties

**No backend required for MVP.**

---

## Installation

```bash
cd frontend
npm install @thatopen/components
npm run dev
```

Navigate to: `http://localhost:5173/emergency-viewer`

---

## Components Created

### Core Viewer
**File:** `frontend/src/components/features/viewer/EmergencyThatOpenViewer.tsx`

**Rename to:** `StandaloneIFCViewer.tsx` (if you prefer)

### Page
**File:** `frontend/src/pages/EmergencyViewer.tsx`

**Route:** `/emergency-viewer`

---

## MVP Features

### ✅ Included
- IFC file upload
- 3D visualization (Three.js)
- Camera controls (orbit, zoom, pan)
- Element selection
- Properties display
- Client-side processing (no backend)

### ❌ Not Included (Future)
- Measurements
- Section views
- BCF integration
- Multi-model support
- Fragment caching
- Backend integration

---

## Architecture

```
User uploads IFC file
    ↓
ThatOpen parses (client-side)
    ↓
Three.js displays 3D
    ↓
User interacts
```

**Benefits:**
- Simple
- No API needed
- No database needed
- Works immediately

**Trade-offs:**
- Re-parses IFC each time (slow for large files)
- No caching (yet)
- Limited features (MVP)

---

## Next Iteration

When ready to add features:

1. **Fragment Caching** (10-100x faster loading)
2. **Backend Integration** (save/load models)
3. **Measurements** (distance, area)
4. **Section Views** (clipping planes)
5. **Multi-model** (federated viewing)

See: `project-management/planning/session-013-thatopen-threejs-integration-guide.md`

---

## Testing

1. Start dev server: `npm run dev`
2. Open: `http://localhost:5173/emergency-viewer`
3. Upload IFC file
4. Verify:
   - Model loads
   - Can navigate
   - Can select elements
   - Properties display

---

## Known Limitations (MVP)

- First load is slow (parses IFC in browser)
- Large files (>500 MB) may struggle
- No measurements/tools yet
- No caching between sessions

**These are acceptable for MVP.** Add features iteratively.

---

## Code Structure

```typescript
EmergencyThatOpenViewer.tsx
├── Initialize ThatOpen components
├── Setup Three.js scene
├── Configure IFC loader
├── Handle file upload
├── Display 3D model
├── Element selection (raycasting)
└── Properties panel
```

**~400 lines** - self-contained, simple to maintain.

---

## Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm run preview
```

Or deploy to Vercel/Netlify (static hosting).

---

**Status:** MVP ready for testing
**Next:** Test with real IFC files, gather feedback, iterate.
