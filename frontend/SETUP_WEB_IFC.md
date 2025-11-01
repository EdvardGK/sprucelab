# Web-IFC Setup Instructions

## Copy WASM Files

web-ifc requires WASM files to be accessible from the public directory.

### Option 1: Manual Copy (Windows)

```powershell
# From the frontend directory
Copy-Item node_modules\web-ifc\*.wasm public\
```

### Option 2: Add to package.json scripts

Add this to `package.json`:

```json
{
  "scripts": {
    "setup:wasm": "cp node_modules/web-ifc/*.wasm public/ || copy node_modules\\web-ifc\\*.wasm public\\"
  }
}
```

Then run:
```bash
yarn setup:wasm
```

### Files that should be copied:

- `web-ifc.wasm`
- `web-ifc-mt.wasm` (multi-threaded version)

These files will be in `public/` and accessible at `/web-ifc.wasm` and `/web-ifc-mt.wasm`

## Update WASM Path in Component

The WebIfcViewer component is configured to look for WASM files at:
```typescript
ifcApi.SetWasmPath('/')
```

This means it will load from:
- `http://localhost:5173/web-ifc.wasm`
- `http://localhost:5173/web-ifc-mt.wasm`

## Testing

1. Start the dev server:
   ```bash
   yarn dev
   ```

2. Navigate to:
   ```
   http://localhost:5173/dev/web-ifc-viewer
   ```

3. Upload an IFC file and verify it parses and renders

## Troubleshooting

### "Failed to fetch WASM"

Check browser console. If you see 404 errors for `.wasm` files:
- Verify WASM files are in `public/` directory
- Check `ifcApi.SetWasmPath()` is set to `'/'`
- Restart dev server after copying WASM files

### "Failed to initialize web-ifc"

- Check browser console for specific error
- Ensure web-ifc version is compatible (v0.0.72)
- Try clearing browser cache

### Performance Issues

For large files (>100MB):
- Use the multi-threaded version by ensuring `web-ifc-mt.wasm` is available
- Consider adding a file size warning for files >500MB
