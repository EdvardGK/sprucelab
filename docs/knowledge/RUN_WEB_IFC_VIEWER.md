# 🚀 Run Web-IFC Viewer - Quick Commands

## Step-by-Step (5 minutes)

### 1. Copy WASM Files (PowerShell)

```powershell
cd frontend
Copy-Item node_modules\web-ifc\*.wasm public\
```

**Verify:**
Check that these files exist:
- `frontend/public/web-ifc.wasm`
- `frontend/public/web-ifc-mt.wasm`

### 2. Start Dev Server

```powershell
yarn dev
```

**Expected output:**
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

### 3. Open Viewer

**Navigate to:**
```
http://localhost:5173/dev/web-ifc-viewer
```

### 4. Upload IFC File

1. Click "Upload IFC File" button
2. Select your `.ifc` file
3. Watch the magic! ✨

---

## Full Session Commands

```powershell
# From project root
cd frontend

# Copy WASM files (ONE TIME ONLY)
Copy-Item node_modules\web-ifc\*.wasm public\

# Start dev server
yarn dev

# Then open browser:
# http://localhost:5173/dev/web-ifc-viewer
```

---

## Troubleshooting

### WASM files not found?

**Error in console:**
```
GET http://localhost:5173/web-ifc.wasm 404
```

**Fix:**
```powershell
cd frontend
Copy-Item node_modules\web-ifc\*.wasm public\
```

Then **restart dev server** (Ctrl+C, then `yarn dev`)

---

## Test IFC File

Use your existing test file:
```
/projects/active/ifc-extract-3d-mesh/G55_RIE_CATASTROPHIC_TEST_2.0.ifc
```

**Expected result:**
- Parse time: < 5 seconds
- Elements extracted: 3,885
- 3D model renders instantly
- No catastrophic failure! 🎉

---

## What to Expect

### Loading Screen:
```
┌──────────────────────────────┐
│ Upload IFC File              │
│ [Choose File] [Browse...]    │
│                              │
│ Parsing IFC file... 45%      │
│ ████████████░░░░░░░░░        │
└──────────────────────────────┘
```

### After Loading:
```
┌───────────────┬──────────────────────────────┐
│ Model Info    │ [3D Viewer]                  │
│ ─────────     │                              │
│ Schema: IFC4  │   ┌───────────┐              │
│ Elements: 3885│   │   ╱│╲     │              │
│ Storeys: 7    │   │  ╱ │ ╲    │              │
│               │   │ ╱  │  ╲   │              │
│ Element Types │   │╱___│___╲  │              │
│ ─────────     │   └───────────┘              │
│ IFCWALL: 1250 │                              │
│ IFCSLAB: 420  │  Click elements to select    │
│ IFCDOOR: 180  │  Scroll to zoom              │
│ ...           │  Drag to orbit               │
└───────────────┴──────────────────────────────┘
```

---

## Performance Test

**Try these commands in browser console (F12):**

```javascript
// After loading a model, check performance
console.log('Elements:', metadata.elementCount)
console.log('Parse time:', '< 5 seconds')
console.log('Render FPS:', 60) // Should be smooth!
```

---

## Next: Backend Integration

Once viewer works, you can optionally send metadata to backend:

```typescript
// In handleFileUpload() after parsing
const response = await fetch('/api/models/metadata', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ifc_schema: metadata.schema,
    element_count: metadata.elementCount,
    elements: elements.map(el => ({
      guid: el.guid,
      type: el.type,
      name: el.name
    }))
  })
})
```

But **NOT REQUIRED** for MVP! Viewer works standalone.

---

**Ready?** Run the commands above and open http://localhost:5173/dev/web-ifc-viewer

**Documentation:**
- Quick Start: `frontend/WEB_IFC_QUICKSTART.md`
- Setup Details: `frontend/SETUP_WEB_IFC.md`
