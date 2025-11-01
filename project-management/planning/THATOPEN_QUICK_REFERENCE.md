# ThatOpen Quick Reference

**Quick access guide for common ThatOpen patterns and code snippets**

---

## Installation

```bash
cd frontend
npm install @thatopen/components @thatopen/components-front @thatopen/ui @thatopen/fragments
npm install three@0.160.0  # Match version required by ThatOpen
```

---

## Basic Viewer Setup

```typescript
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';

// 1. Initialize
const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);
const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBCF.PostproductionRenderer
>();

// 2. Setup scene
world.scene = new OBC.SimpleScene(components);
world.scene.setup();

// 3. Setup renderer
world.renderer = new OBCF.PostproductionRenderer(components, containerRef.current);

// 4. Setup camera
world.camera = new OBC.OrthoPerspectiveCamera(components);

// 5. Initialize
components.init();

// 6. Cleanup when done
components.dispose();
```

---

## Loading IFC Files

```typescript
// Setup IFC Loader
const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: {
    path: 'https://unpkg.com/web-ifc@0.0.72/',
    absolute: true,
  },
});

// Load IFC file
const response = await fetch(ifcFileUrl);
const data = await response.arrayBuffer();
const buffer = new Uint8Array(data);

await ifcLoader.load(buffer, false, 'modelName', {
  processData: {
    progressCallback: (progress) => {
      console.log(`Loading: ${(progress * 100).toFixed(0)}%`);
    },
  },
});
```

---

## Working with Fragments

```typescript
// Setup FragmentsManager
const fragments = components.get(OBC.FragmentsManager);
await fragments.init();

// Handle loaded fragments
fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  console.log(`Loaded ${model.items.count} elements`);
});

// Load Fragment file
const response = await fetch(fragmentsUrl);
const data = await response.arrayBuffer();
await fragments.core.load(new Uint8Array(data));

// Export to Fragments
const [model] = fragments.list.values();
const fragmentsBuffer = await model.getBuffer(false);
// Save fragmentsBuffer to file
```

---

## Element Selection

```typescript
import * as OBCF from '@thatopen/components-front';

// Setup highlighter
const highlighter = components.get(OBCF.Highlighter);
highlighter.setup({ world });

// Handle click
container.addEventListener('click', async (event) => {
  const result = await highlighter.highlight('select', event);

  if (result) {
    const { modelID, expressID } = result;
    const model = fragments.list.get(modelID);
    const props = await model.getProperties(expressID);
    console.log('Selected:', props);
  }
});
```

---

## Measurements

```typescript
// Length measurement
const lengthMeasurement = components.get(OBCF.LengthMeasurement);
lengthMeasurement.world = world;
lengthMeasurement.enabled = true;

// Area measurement
const areaMeasurement = components.get(OBCF.AreaMeasurement);
areaMeasurement.world = world;
areaMeasurement.enabled = true;
```

---

## Clipping Planes

```typescript
const clipper = components.get(OBCF.Clipper);
clipper.world = world;
clipper.enabled = true;

// Create clipping plane
clipper.create(world);

// Delete all planes
clipper.deleteAll();
```

---

## Common Components

| Component | Purpose | Package |
|-----------|---------|---------|
| `Worlds` | Manage 3D environments | @thatopen/components |
| `IfcLoader` | Load IFC files | @thatopen/components |
| `FragmentsManager` | Manage Fragment models | @thatopen/components |
| `Highlighter` | Selection/highlighting | @thatopen/components-front |
| `LengthMeasurement` | Distance measurements | @thatopen/components-front |
| `AreaMeasurement` | Area measurements | @thatopen/components-front |
| `Clipper` | Section views | @thatopen/components-front |
| `Classifier` | Element filtering | @thatopen/components |
| `BoundingBoxer` | Bounding boxes | @thatopen/components |
| `BCFTopics` | Issue management | @thatopen/components |

---

## Performance Tips

### 1. Use Fragments (not IFC)
```typescript
// ❌ Slow: Parse IFC every time
await ifcLoader.load(ifcBuffer);

// ✅ Fast: Load Fragments once
await fragments.core.load(fragmentsBuffer);
```

### 2. Enable Streaming
```typescript
fragments.core.streamSettings = {
  enabled: true,
  minStreamSize: 1 * 1024 * 1024, // 1 MB chunks
};
```

### 3. Update on Camera Rest
```typescript
world.camera.controls.addEventListener('rest', () => {
  fragments.core.update(true);
});
```

---

## React Integration

```typescript
import { useEffect, useRef } from 'react';

export function ThatOpenViewer({ modelId }: { modelId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentsRef = useRef<OBC.Components | null>(null);

  useEffect(() => {
    const components = new OBC.Components();
    componentsRef.current = components;

    // Setup viewer...

    return () => {
      components.dispose(); // Critical: cleanup!
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
```

---

## API Integration

### Backend: Generate Fragments
```python
# backend/apps/models/views.py
@action(detail=True, methods=['post'])
def generate_fragments(self, request, pk=None):
    model = self.get_object()
    result = convert_ifc_to_fragments(model.id, file_path)
    return Response({'fragments_url': model.fragments_url})
```

### Frontend: Load Fragments
```typescript
// Check if Fragments available
const response = await fetch(`/api/models/${modelId}/fragments/`);
if (response.ok) {
  const { fragments_url } = await response.json();
  const fragmentsData = await fetch(fragments_url);
  const buffer = await fragmentsData.arrayBuffer();
  await fragments.core.load(new Uint8Array(buffer));
}
```

---

## Troubleshooting

### WASM Not Found
```typescript
// Ensure WASM files in public/ directory
// OR use CDN:
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: {
    path: 'https://unpkg.com/web-ifc@0.0.72/',
    absolute: true,
  },
});
```

### Memory Leaks
```typescript
// Always dispose Components when unmounting
useEffect(() => {
  const components = new OBC.Components();

  return () => {
    components.dispose(); // ← Critical!
  };
}, []);
```

### Three.js Version Mismatch
```bash
# Check required version
npm info @thatopen/components peerDependencies

# Install matching version
npm install three@<version>
```

---

## Resources

- **Docs**: https://docs.thatopen.com
- **GitHub**: https://github.com/ThatOpen/engine_components
- **Discord**: https://discord.gg/ThatOpen
- **Local Docs**: `/resources/knowledge/thatopen/`
- **Full Guide**: `project-management/planning/session-013-thatopen-threejs-integration-guide.md`

---

**Last Updated:** 2025-10-31
