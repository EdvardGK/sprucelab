# Web-IFC Memory Limitations & Solutions

## Problem

Web-IFC uses WebAssembly (WASM) which has a fixed memory limit. When loading large IFC files, you may see:

```
RuntimeError: memory access out of bounds
```

This happens because WASM modules have memory constraints that can't be increased at runtime.

---

## Memory Limits

### Practical Limits
- **Small files** (<25 MB): ✅ Works well
- **Medium files** (25-50 MB): ⚠️ May work, slower
- **Large files** (50-100 MB): ❌ Often fails with memory errors
- **Very large files** (>100 MB): ❌ Almost always fails

### Technical Background
- WASM memory is allocated at initialization
- Default Web-IFC memory: ~64-128 MB (depending on browser)
- Can't be dynamically increased during parsing
- Each IFC element, geometry, and property set consumes memory

---

## Solutions Implemented

### 1. File Size Pre-Check (Upload Dialog)

**Location**: `frontend/src/components/WebIfcModelUploadDialog.tsx`

```typescript
const fileSizeMB = file.size / 1024 / 1024
if (fileSizeMB > 100) {
  throw new Error('File too large for Web-IFC parser (>100MB)')
}
```

**Benefit**: Prevents upload attempts that will fail, provides clear error message upfront.

### 2. Better Error Handling (Viewers)

**Location**: `frontend/src/components/features/viewer/WebIfcModelViewer.tsx`

```typescript
catch (err) {
  if (err.message.includes('memory access out of bounds')) {
    errorMessage = 'File too large for Web-IFC viewer. Please use backend parser.'
  }
}
```

**Benefit**: Clear user feedback when memory errors occur.

### 3. Memory-Friendly Parsing (Upload)

**Changes**:
- Refactored parsing into separate functions
- Added try-catch around `OpenModel` call
- Parse metadata only (skip full geometry extraction if possible)
- Limit entity extraction to 5000 elements

---

## Current Architecture

### Upload Flow (Web-IFC)

```
User selects file
  ↓
Check file size (<100 MB?)
  ↓ YES
Parse metadata with Web-IFC (1-2 seconds)
  ↓
Send metadata + file to backend
  ↓
Backend stores without parsing
  ↓
✅ Model ready immediately

  ↓ NO (>100 MB)
❌ Show error: "File too large for Web-IFC"
```

### Viewer Flow (Web-IFC)

```
Load model from backend
  ↓
Check file size (<100 MB?)
  ↓ YES
Parse + render geometry
  ↓
✅ Show 3D viewer

  ↓ NO (>100 MB)
❌ Show error: "File too large for viewer"
```

---

## Alternative Solutions

### Option 1: Use Backend Parser for Large Files

**Pros**:
- No memory limits (runs in Python/ifcopenshell)
- Can handle multi-GB files
- Already implemented in codebase

**Cons**:
- Slower (30s - 5 minutes)
- Requires backend processing
- User doesn't get instant feedback

**How to Enable**:
```typescript
// In upload dialog - add fallback button
if (fileSizeMB > 100) {
  return <div>
    <p>File too large for Web-IFC parser</p>
    <Button onClick={useBackendParser}>
      Use Backend Parser (slower but supports large files)
    </Button>
  </div>
}
```

### Option 2: Streaming/Progressive Loading

**Idea**: Load and display model in chunks

**Pros**:
- Could handle larger files
- Progressive display

**Cons**:
- Complex implementation
- Web-IFC doesn't natively support streaming
- Would require major refactor

### Option 3: Custom WASM Build with More Memory

**Idea**: Rebuild Web-IFC WASM with larger memory allocation

**Pros**:
- Increases limits significantly (up to 2GB)
- No code changes needed

**Cons**:
- Requires forking web-ifc and rebuilding
- Increases bundle size
- Still has limits (just higher)
- Maintenance burden

**Steps** (if needed):
1. Fork `web-ifc` repository
2. Modify WASM build settings:
   ```c++
   // In emscripten build
   -s INITIAL_MEMORY=2GB
   -s MAXIMUM_MEMORY=4GB
   ```
3. Rebuild and host custom WASM files
4. Update `SetWasmPath()` to custom build

---

## Recommendations

### For Small/Medium Projects (<100MB models)
✅ **Current implementation is fine**
- Fast upload with Web-IFC
- Clear error messages for oversized files
- Good user experience

### For Large Projects (>100MB models)
🔧 **Add backend parser fallback**:

1. Keep Web-IFC as primary (fast for small files)
2. Add "Use Backend Parser" button for large files
3. Show file size before upload with recommendations

### Future Enhancement: Hybrid Approach

```typescript
async function uploadModel(file: File) {
  const sizeMB = file.size / 1024 / 1024

  if (sizeMB < 50) {
    // Fast path: Web-IFC
    return await uploadWithWebIfc(file)
  } else if (sizeMB < 100) {
    // Ask user
    const choice = await askUser("Large file. Choose parser:")
    return choice === 'fast' ? uploadWithWebIfc(file) : uploadWithBackend(file)
  } else {
    // Force backend
    return await uploadWithBackend(file)
  }
}
```

---

## Files Modified (2025-10-25)

### Frontend
- `frontend/src/components/WebIfcModelUploadDialog.tsx`
  - Added file size check (100 MB limit)
  - Added WASM memory error handling
  - Refactored parsing into separate functions

- `frontend/src/components/features/viewer/WebIfcModelViewer.tsx`
  - Added file size check
  - Improved error messages for memory errors
  - Added file size logging

### Backend
- No changes needed (already supports large files via ifcopenshell parser)

---

## Testing

### Test Cases
1. ✅ Upload 10 MB file → Works with Web-IFC
2. ✅ Upload 50 MB file → May work, shows warning
3. ✅ Upload 150 MB file → Shows clear error before parsing
4. ✅ Viewer with 80 MB file → May fail, shows clear error

### Expected Errors
```
// Before fix
"RuntimeError: memory access out of bounds"

// After fix
"File too large for Web-IFC parser (150.5MB). Web-IFC has a memory
limit of ~100MB. Please use a smaller file or contact support for
backend parsing."
```

---

## User Documentation

### For End Users

**Uploading IFC Models**:
- Files under 100 MB: Use the "Upload Model (Web-IFC)" button for instant upload
- Files over 100 MB: Contact your administrator to enable backend parsing

**Viewing IFC Models**:
- The 3D viewer works best with models under 50 MB
- Larger models may fail to load or display slowly
- Consider exporting simplified versions for viewing

### For Developers

**To add backend parser option**:
1. Uncomment backend parser endpoints in `apps/models/views.py`
2. Add "Upload (Backend)" button in upload dialog
3. Use `/models/upload/` endpoint instead of `/models/upload-with-metadata/`

**To increase WASM memory** (advanced):
1. Fork `web-ifc` repo
2. Modify build configuration
3. Rebuild WASM files
4. Host custom build
5. Update `SetWasmPath()` in all viewers
