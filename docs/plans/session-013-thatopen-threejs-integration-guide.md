# Session 013: ThatOpen & Three.js Integration Guide

**Date:** 2025-10-31
**Author:** Claude (Self-Learning Guide)
**Status:** Implementation Planning
**Priority:** High

---

## 📚 Table of Contents

1. [Executive Summary](#executive-summary)
2. [What is ThatOpen?](#what-is-thatopen)
3. [Current State Analysis](#current-state-analysis)
4. [Architecture Decision](#architecture-decision)
5. [Installation & Setup](#installation--setup)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Integration Patterns](#integration-patterns)
8. [Advanced Features](#advanced-features)
9. [Performance Optimization](#performance-optimization)
10. [Testing Strategy](#testing-strategy)
11. [Resources & References](#resources--references)

---

## Executive Summary

### What We're Building
A professional 3D BIM viewer for the BIM Coordinator Platform using ThatOpen (formerly IFC.js) and Three.js, providing advanced visualization, analysis, and collaboration features.

### Why ThatOpen?
- **Component-based architecture**: Reusable, maintainable BIM tools
- **Fragments format**: Optimized binary format (10-100x faster than raw IFC)
- **Pre-built features**: Measurements, clipping, BCF, DXF export, etc.
- **Active ecosystem**: Well-documented, TypeScript-native, React-compatible
- **Industry adoption**: Used by major BIM software companies

### Current Status
✅ **Already Have:**
- Three.js + @react-three/fiber + @react-three/drei
- web-ifc v0.0.72 for IFC parsing
- Basic IFCViewer component (manual geometry extraction)
- Django backend with layered processing (parse → geometry → validate)
- PostgreSQL storage for IFC metadata + geometry

🎯 **What ThatOpen Adds:**
- **10-100x performance** improvement via Fragments
- **40+ pre-built components** (measurements, clipping, BCF, etc.)
- **Standardized patterns** for BIM application development
- **UI library** (@thatopen/ui) for consistent UX
- **Better memory management** and lifecycle handling

---

## What is ThatOpen?

### Overview
ThatOpen (formerly IFC.js) is an open-source toolkit for building browser-based BIM applications. It provides:

1. **@thatopen/components** - Core BIM tools (browser + Node.js)
2. **@thatopen/components-front** - Browser-only features
3. **@thatopen/ui** - UI component library
4. **@thatopen/fragments** - Optimized binary format for BIM data

### Key Concepts

#### Components Architecture
```typescript
// Singleton pattern - all components accessed via Components class
const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);
const ifcLoader = components.get(OBC.IfcLoader);
const fragments = components.get(OBC.FragmentsManager);

// Components have lifecycle management
components.init();        // Initialize all components
components.dispose();     // Clean up (important for memory!)
```

#### Worlds (3D Environments)
```typescript
// A "World" = Scene + Camera + Renderer
const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBC.SimpleRenderer
>();

world.scene = new OBC.SimpleScene(components);
world.renderer = new OBC.SimpleRenderer(components, container);
world.camera = new OBC.OrthoPerspectiveCamera(components);
```

#### Fragments (Binary BIM Format)
```
IFC File (100 MB, slow)
    ↓ [IFC Loader converts to]
Fragments (10 MB, fast)
    ↓ [Loads 10-100x faster]
Three.js Scene
```

**Benefits:**
- **Smaller file size**: ~10x compression
- **Faster loading**: No re-parsing (binary format)
- **Streaming support**: Load parts of model on-demand
- **Metadata preserved**: All IFC data intact
- **Reusable**: Save once, load many times

---

## Current State Analysis

### Your Existing Viewer (`frontend/src/components/features/viewer/IFCViewer.tsx`)

**What it does:**
1. Uses `web-ifc` directly to parse IFC files
2. Extracts geometry element-by-element
3. Creates Three.js `Mesh` objects manually
4. Displays using `@react-three/fiber` Canvas

**Pros:**
- ✅ Direct control over parsing
- ✅ Works with your backend geometry storage
- ✅ Lightweight (no additional dependencies)

**Cons:**
- ❌ Slow for large models (parses IFC every time)
- ❌ No advanced features (measurements, clipping, BCF)
- ❌ Manual memory management
- ❌ No Fragment caching
- ❌ Element-by-element extraction (not optimized)

### Your Backend Architecture

```
Layer 1 (Parse):     Extract metadata (GUID, type, name, properties)
                     → services/parse.py

Layer 2 (Geometry):  Extract 3D geometry (vertices, faces, bbox)
                     → services/geometry.py

Layer 3 (Validate):  Quality checks (BEP compliance, LOD)
                     → services/validation.py
```

**Key Insight:** Your backend ALREADY extracts and stores geometry!
- Vertices/faces stored as BYTEA in PostgreSQL
- Bounding boxes calculated
- Per-element geometry status tracking

**Integration Opportunity:**
You can serve geometry data in Fragments format OR consume your existing PostgreSQL geometry.

---

## Architecture Decision

### Option A: Full ThatOpen Stack (Recommended)
**Use ThatOpen for everything: parsing, fragments, visualization, tools**

**Pros:**
- ✅ Best performance (Fragments format)
- ✅ Access to 40+ pre-built components
- ✅ Standard BIM application patterns
- ✅ Easy to add features later

**Cons:**
- ❌ Requires Fragment conversion (one-time cost)
- ❌ Some overlap with backend geometry extraction

**Recommendation:** Use this for your viewer. Keep backend for:
- Analytics (SQL queries on geometry data)
- Change detection (compare geometry across versions)
- Server-side processing (validation, clash detection)

---

### Option B: Hybrid Approach
**Use ThatOpen components with your backend geometry**

**Pros:**
- ✅ Leverage existing geometry storage
- ✅ Keep layered processing architecture
- ✅ Use ThatOpen for UI/tools only

**Cons:**
- ❌ More complex integration
- ❌ Miss out on Fragments performance
- ❌ Custom serialization needed

**When to use:** If you have critical reasons to keep PostgreSQL as primary geometry source (e.g., analytics, regulatory compliance).

---

### 🎯 Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         ThatOpen Viewer (Primary)                    │  │
│  │  - @thatopen/components                              │  │
│  │  - @thatopen/components-front                        │  │
│  │  - Fragments format                                  │  │
│  │  - 40+ pre-built tools                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Legacy Viewer (Keep as fallback)             │  │
│  │  - web-ifc direct                                    │  │
│  │  - Manual Three.js                                   │  │
│  │  - Use if Fragment conversion fails                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            ↕ REST API
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND (Django + DRF)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 1: Parse (Metadata)     → Keep for property queries │
│  Layer 2: Geometry (Vertices)  → Keep for analytics        │
│  Layer 3: Validate (BEP)       → Keep for compliance       │
│                                                             │
│  NEW: Fragment Storage Service                              │
│  - Store Fragments in Supabase Storage                     │
│  - Serve via CDN for fast loading                          │
│  - API endpoint: GET /api/models/{id}/fragments/           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Installation & Setup

### Step 1: Install ThatOpen Packages

```bash
cd frontend

# Core packages
npm install @thatopen/components
npm install @thatopen/components-front
npm install @thatopen/ui
npm install @thatopen/fragments

# Ensure Three.js version matches (CRITICAL!)
npm install three@0.160.0

# Peer dependencies (you already have these)
# npm install web-ifc@0.0.72
# npm install @react-three/fiber@^8.17.0
# npm install @react-three/drei@^9.114.0
```

**⚠️ Version Compatibility:**
ThatOpen requires specific Three.js versions. Check their `package.json` for the exact version:
```bash
npm info @thatopen/components peerDependencies
```

---

### Step 2: Configure Vite for WASM

ThatOpen uses WebAssembly (WASM) for IFC parsing. Update `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // WASM support for web-ifc
  optimizeDeps: {
    exclude: ['@thatopen/components', '@thatopen/components-front'],
  },

  // Copy WASM files to public during build
  publicDir: 'public',

  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})
```

---

### Step 3: Copy WASM Files

Download web-ifc WASM files to your `public/` directory:

```bash
# Option 1: Copy from node_modules
cp node_modules/web-ifc/*.wasm frontend/public/

# Option 2: Use CDN (for development)
# Configure in code (see below)
```

Create `frontend/public/web-ifc-wasm/` and place:
- `web-ifc.wasm`
- `web-ifc-mt.wasm` (multi-threaded version)

---

## Implementation Roadmap

### Phase 1: Basic ThatOpen Viewer (Week 1-2)
**Goal:** Replace current IFCViewer with ThatOpen-based viewer

**Tasks:**
1. ✅ Install packages
2. ✅ Configure WASM
3. Create `ThatOpenViewer` component
4. Load IFC → Convert to Fragments → Display
5. Basic controls (orbit, zoom, pan)
6. Test with sample models

**Deliverable:** Working ThatOpen viewer that displays IFC models

---

### Phase 2: Fragment Storage & Caching (Week 3)
**Goal:** Cache Fragments for instant loading

**Tasks:**
1. Add Fragment export API endpoint (Django)
2. Store Fragments in Supabase Storage
3. Serve Fragments via CDN
4. Update viewer to load Fragments (skip IFC parsing)
5. Add Fragment regeneration on model update

**Deliverable:** 10-100x faster model loading

---

### Phase 3: Basic BIM Tools (Week 4-5)
**Goal:** Add essential BIM features

**Tools to Integrate:**
- ✅ **Selection**: Click to select elements
- ✅ **Properties Panel**: Show IFC properties
- ✅ **Measurement**: Distance, area, volume
- ✅ **Clipping Planes**: Section views
- ✅ **Visibility**: Show/hide by type, layer, etc.

**Deliverable:** Professional BIM viewer with basic tools

---

### Phase 4: Advanced Features (Week 6-8)
**Goal:** Add collaboration and analysis tools

**Features:**
- ✅ **BCF Integration**: Issue tracking
- ✅ **Model Tree**: Hierarchical element browser
- ✅ **Filtering**: Complex element queries
- ✅ **Sectioning**: Plan views, elevations
- ✅ **Annotations**: Add markups to 3D view
- ✅ **Export**: DXF, PDF, screenshots

**Deliverable:** Feature-complete BIM coordination platform

---

### Phase 5: Federated Models (Week 9-10)
**Goal:** Support multiple models in single view

**Features:**
- Load multiple Fragments
- Coordinate system alignment
- Model visibility management
- Clash detection (basic)

**Deliverable:** Multi-model coordination

---

## Integration Patterns

### Pattern 1: Basic ThatOpen Viewer Component

Create `frontend/src/components/features/viewer/ThatOpenViewer.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';
import { useModel } from '@/hooks/use-models';
import { Loader2, AlertCircle } from 'lucide-react';

interface ThatOpenViewerProps {
  modelId: string;
}

export function ThatOpenViewer({ modelId }: ThatOpenViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentsRef = useRef<OBC.Components | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elementCount, setElementCount] = useState(0);

  const { data: model } = useModel(modelId);

  useEffect(() => {
    if (!containerRef.current || !model?.file_url) return;

    const initViewer = async () => {
      try {
        setIsLoading(true);

        // 1. Initialize Components
        const components = new OBC.Components();
        componentsRef.current = components;

        // 2. Create World
        const worlds = components.get(OBC.Worlds);
        const world = worlds.create<
          OBC.SimpleScene,
          OBC.OrthoPerspectiveCamera,
          OBCF.PostproductionRenderer
        >();

        // 3. Setup Scene
        world.scene = new OBC.SimpleScene(components);
        world.scene.setup();
        world.scene.three.background = new THREE.Color(0x202932);

        // 4. Setup Renderer
        world.renderer = new OBCF.PostproductionRenderer(
          components,
          containerRef.current
        );

        // 5. Setup Camera
        world.camera = new OBC.OrthoPerspectiveCamera(components);
        await world.camera.controls.setLookAt(12, 6, 8, 0, 0, 0);

        // 6. Initialize Components
        components.init();

        // 7. Setup Grid
        const grids = components.get(OBC.Grids);
        grids.create(world);

        // 8. Setup FragmentsManager
        const fragments = components.get(OBC.FragmentsManager);
        fragments.init();

        // Update camera when fragments load
        world.camera.controls.addEventListener('rest', () => {
          fragments.core.update(true);
        });

        // Add loaded fragments to scene
        fragments.list.onItemSet.add(({ value: fragmentModel }) => {
          fragmentModel.useCamera(world.camera.three);
          world.scene!.three.add(fragmentModel.object);
          fragments.core.update(true);
          setElementCount(fragmentModel.items.count);
        });

        // 9. Load IFC File
        const ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: 'https://unpkg.com/web-ifc@0.0.72/',
            absolute: true,
          },
        });

        // Fetch and load IFC
        const response = await fetch(model.file_url);
        const data = await response.arrayBuffer();
        const buffer = new Uint8Array(data);

        await ifcLoader.load(buffer, false, model.name, {
          processData: {
            progressCallback: (progress) => {
              console.log(`Loading: ${(progress * 100).toFixed(0)}%`);
            },
          },
        });

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize viewer:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsLoading(false);
      }
    };

    initViewer();

    // Cleanup
    return () => {
      if (componentsRef.current) {
        componentsRef.current.dispose();
        componentsRef.current = null;
      }
    };
  }, [model?.file_url, model?.name]);

  return (
    <div className="relative w-full h-full">
      {/* 3D Container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* HUD Overlay */}
      <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm border border-border rounded-md p-3 text-xs space-y-1">
        <div className="text-text-secondary mb-2 pb-2 border-b border-border">
          <span className="text-blue-600">🚀 ThatOpen Viewer</span>
        </div>
        <div className="text-text-secondary">
          Elements: <span className="text-text-primary font-medium">{elementCount}</span>
        </div>
        <div className="text-text-tertiary mt-2 pt-2 border-t border-border">
          Left drag: Rotate
        </div>
        <div className="text-text-tertiary">Right drag: Pan</div>
        <div className="text-text-tertiary">Scroll: Zoom</div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-lg p-6 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-text-secondary">Loading model...</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute top-4 right-4 bg-destructive/10 border border-destructive rounded-md p-3">
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### Pattern 2: Fragment Storage Backend API

Create `backend/apps/models/services/fragments.py`:

```python
"""
Fragment Storage Service

Converts IFC models to ThatOpen Fragments format and stores them in Supabase.
Fragments load 10-100x faster than raw IFC files.
"""
import os
import subprocess
import tempfile
from pathlib import Path
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

def convert_ifc_to_fragments(model_id, ifc_file_path):
    """
    Convert IFC file to Fragments using Node.js script.

    This runs a Node.js script that uses @thatopen/components to convert.

    Args:
        model_id: UUID of the Model
        ifc_file_path: Path to IFC file

    Returns:
        dict: {
            'fragments_path': Path to fragments file,
            'size_mb': File size in MB
        }
    """
    from apps.models.models import Model

    model = Model.objects.get(id=model_id)

    # Create temp output directory
    with tempfile.TemporaryDirectory() as temp_dir:
        output_path = os.path.join(temp_dir, 'model.frag')

        # Run Node.js conversion script
        # (You'll create this script in frontend/scripts/convert-to-fragments.mjs)
        result = subprocess.run(
            [
                'node',
                'frontend/scripts/convert-to-fragments.mjs',
                ifc_file_path,
                output_path
            ],
            capture_output=True,
            text=True,
            check=True
        )

        print(result.stdout)

        # Upload to Supabase Storage
        with open(output_path, 'rb') as f:
            fragments_data = f.read()

        storage_path = f'models/{model_id}/model.frag'
        storage_url = default_storage.save(storage_path, ContentFile(fragments_data))

        # Update model with fragments URL
        model.fragments_url = storage_url
        model.save(update_fields=['fragments_url'])

        size_mb = len(fragments_data) / (1024 * 1024)

        print(f"✅ Fragments saved: {size_mb:.2f} MB")

        return {
            'fragments_path': storage_url,
            'size_mb': size_mb
        }
```

Create `frontend/scripts/convert-to-fragments.mjs`:

```javascript
/**
 * Convert IFC to Fragments (Node.js script)
 *
 * Usage: node convert-to-fragments.mjs input.ifc output.frag
 */
import * as OBC from '@thatopen/components';
import * as fs from 'fs';

async function convertToFragments(inputPath, outputPath) {
  console.log(`Converting ${inputPath} to Fragments...`);

  // Initialize Components
  const components = new OBC.Components();

  // Setup FragmentsManager
  const fragments = components.get(OBC.FragmentsManager);
  await fragments.init();

  // Setup IFC Loader
  const ifcLoader = components.get(OBC.IfcLoader);
  await ifcLoader.setup({
    autoSetWasm: true,
  });

  // Load IFC file
  const ifcData = fs.readFileSync(inputPath);
  const buffer = new Uint8Array(ifcData);

  await ifcLoader.load(buffer, false, 'model', {
    processData: {
      progressCallback: (progress) => {
        console.log(`Progress: ${(progress * 100).toFixed(0)}%`);
      },
    },
  });

  // Get the first (and only) fragment model
  const [model] = fragments.list.values();

  // Export to Fragments file
  const fragmentsBuffer = await model.getBuffer(false);
  fs.writeFileSync(outputPath, fragmentsBuffer);

  console.log(`✅ Fragments saved: ${outputPath}`);
  console.log(`   Elements: ${model.items.count}`);
  console.log(`   Size: ${(fragmentsBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

  // Cleanup
  components.dispose();
}

// Get command-line arguments
const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error('Usage: node convert-to-fragments.mjs <input.ifc> <output.frag>');
  process.exit(1);
}

convertToFragments(inputPath, outputPath)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
```

Update Django models (`backend/apps/models/models.py`):

```python
class Model(BaseModel):
    # ... existing fields ...

    # NEW: Fragments storage
    fragments_url = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        help_text="URL to ThatOpen Fragments file (optimized binary format)"
    )
    fragments_size_mb = models.FloatField(
        null=True,
        blank=True,
        help_text="Size of Fragments file in MB"
    )
    fragments_generated_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When Fragments file was generated"
    )
```

Create migration:

```bash
cd backend
python manage.py makemigrations models
python manage.py migrate
```

Add API endpoint (`backend/apps/models/views.py`):

```python
from rest_framework.decorators import action
from rest_framework.response import Response
from .services.fragments import convert_ifc_to_fragments

class ModelViewSet(viewsets.ModelViewSet):
    # ... existing code ...

    @action(detail=True, methods=['post'])
    def generate_fragments(self, request, pk=None):
        """
        Generate ThatOpen Fragments file for this model.

        POST /api/models/{id}/generate_fragments/
        """
        model = self.get_object()

        # Get IFC file path
        if not model.file_url:
            return Response(
                {'error': 'No IFC file uploaded'},
                status=400
            )

        file_path = default_storage.path(model.file_url.replace('/media/', ''))

        # Convert to Fragments
        result = convert_ifc_to_fragments(model.id, file_path)

        # Update model
        model.fragments_size_mb = result['size_mb']
        model.fragments_generated_at = timezone.now()
        model.save(update_fields=['fragments_size_mb', 'fragments_generated_at'])

        return Response({
            'success': True,
            'fragments_url': model.fragments_url,
            'size_mb': result['size_mb']
        })

    @action(detail=True, methods=['get'])
    def fragments(self, request, pk=None):
        """
        Get Fragments file URL for direct loading.

        GET /api/models/{id}/fragments/
        """
        model = self.get_object()

        if not model.fragments_url:
            return Response(
                {'error': 'No Fragments file available. Generate first.'},
                status=404
            )

        return Response({
            'fragments_url': model.fragments_url,
            'size_mb': model.fragments_size_mb,
            'generated_at': model.fragments_generated_at
        })
```

---

### Pattern 3: Loading Fragments in Viewer

Update `ThatOpenViewer.tsx` to load Fragments if available:

```typescript
// Inside initViewer function, replace IFC loading with:

// Check if Fragments available
const fragmentsResponse = await fetch(
  `/api/models/${modelId}/fragments/`
);

if (fragmentsResponse.ok) {
  // Load Fragments (FAST!)
  const { fragments_url } = await fragmentsResponse.json();
  console.log('Loading Fragments from:', fragments_url);

  const response = await fetch(fragments_url);
  const data = await response.arrayBuffer();
  const buffer = new Uint8Array(data);

  await fragments.core.load(buffer, { modelId });

  console.log('✅ Fragments loaded (instant!)');
} else {
  // Fallback: Load IFC and generate Fragments
  console.log('No Fragments available, loading IFC...');

  const response = await fetch(model.file_url);
  const data = await response.arrayBuffer();
  const buffer = new Uint8Array(data);

  await ifcLoader.load(buffer, false, model.name, {
    processData: {
      progressCallback: (progress) => {
        console.log(`Loading: ${(progress * 100).toFixed(0)}%`);
      },
    },
  });

  // Trigger Fragment generation on backend
  await fetch(`/api/models/${modelId}/generate_fragments/`, {
    method: 'POST',
  });

  console.log('✅ IFC loaded, Fragments generated for next time');
}
```

---

## Advanced Features

### Feature 1: Element Selection & Properties

```typescript
import { useState } from 'react';
import * as OBC from '@thatopen/components';

function useElementSelection(components: OBC.Components | null) {
  const [selectedElement, setSelectedElement] = useState<any>(null);

  useEffect(() => {
    if (!components) return;

    // Setup Highlighter
    const highlighter = components.get(OBCF.Highlighter);
    highlighter.setup({ world });

    // Setup mouse selection
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('click', async (event) => {
      const result = await highlighter.highlight('select', event);

      if (result) {
        const { modelID, expressID } = result;
        const fragments = components.get(OBC.FragmentsManager);
        const model = fragments.list.get(modelID);

        if (model) {
          // Get IFC properties
          const props = await model.getProperties(expressID);
          setSelectedElement(props);

          console.log('Selected element:', props);
        }
      } else {
        // Clicked empty space
        setSelectedElement(null);
      }
    });
  }, [components]);

  return { selectedElement };
}

// Properties Panel Component
function PropertiesPanel({ element }: { element: any }) {
  if (!element) return null;

  return (
    <div className="absolute right-4 top-4 w-80 bg-background border border-border rounded-lg p-4 max-h-[80vh] overflow-y-auto">
      <h3 className="text-lg font-semibold mb-2">Element Properties</h3>

      <div className="space-y-2 text-sm">
        <div>
          <span className="text-text-tertiary">Type:</span>{' '}
          <span className="font-medium">{element.type}</span>
        </div>

        <div>
          <span className="text-text-tertiary">Name:</span>{' '}
          <span className="font-medium">{element.Name?.value || 'Unnamed'}</span>
        </div>

        <div>
          <span className="text-text-tertiary">GUID:</span>{' '}
          <span className="font-mono text-xs">{element.GlobalId?.value}</span>
        </div>

        {/* Property Sets */}
        {element.psets && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2">Property Sets</h4>
            {Object.entries(element.psets).map(([psetName, pset]: [string, any]) => (
              <details key={psetName} className="mb-2">
                <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
                  {psetName}
                </summary>
                <div className="ml-4 mt-1 space-y-1">
                  {Object.entries(pset).map(([key, value]: [string, any]) => (
                    <div key={key} className="text-xs">
                      <span className="text-text-tertiary">{key}:</span>{' '}
                      <span>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

### Feature 2: Measurements

```typescript
import * as OBCF from '@thatopen/components-front';

function useMeasurements(components: OBC.Components | null, world: OBC.World | null) {
  const [measurementMode, setMeasurementMode] = useState<'distance' | 'area' | null>(null);

  useEffect(() => {
    if (!components || !world) return;

    // Setup Length Measurement
    const lengthMeasurement = components.get(OBCF.LengthMeasurement);
    lengthMeasurement.world = world;
    lengthMeasurement.enabled = measurementMode === 'distance';

    // Setup Area Measurement
    const areaMeasurement = components.get(OBCF.AreaMeasurement);
    areaMeasurement.world = world;
    areaMeasurement.enabled = measurementMode === 'area';
  }, [components, world, measurementMode]);

  const startMeasurement = (mode: 'distance' | 'area') => {
    setMeasurementMode(mode);
  };

  const stopMeasurement = () => {
    setMeasurementMode(null);
  };

  return { measurementMode, startMeasurement, stopMeasurement };
}

// Measurement Toolbar Component
function MeasurementToolbar({ onMeasure }: { onMeasure: (mode: 'distance' | 'area' | null) => void }) {
  const [activeMode, setActiveMode] = useState<'distance' | 'area' | null>(null);

  const toggleMode = (mode: 'distance' | 'area') => {
    const newMode = activeMode === mode ? null : mode;
    setActiveMode(newMode);
    onMeasure(newMode);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background border border-border rounded-lg p-2 flex gap-2">
      <button
        onClick={() => toggleMode('distance')}
        className={`px-4 py-2 rounded ${
          activeMode === 'distance'
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-accent'
        }`}
      >
        📏 Distance
      </button>

      <button
        onClick={() => toggleMode('area')}
        className={`px-4 py-2 rounded ${
          activeMode === 'area'
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-accent'
        }`}
      >
        📐 Area
      </button>
    </div>
  );
}
```

---

### Feature 3: Clipping Planes

```typescript
import * as OBCF from '@thatopen/components-front';

function useClippingPlanes(components: OBC.Components | null, world: OBC.World | null) {
  const [clippingEnabled, setClippingEnabled] = useState(false);

  useEffect(() => {
    if (!components || !world) return;

    // Setup Clipper
    const clipper = components.get(OBCF.Clipper);
    clipper.world = world;
    clipper.enabled = clippingEnabled;

    if (clippingEnabled) {
      // Create default clipping plane (horizontal section)
      clipper.create(world);
    } else {
      // Delete all planes
      clipper.deleteAll();
    }
  }, [components, world, clippingEnabled]);

  return { clippingEnabled, setClippingEnabled };
}

// Clipping Toolbar Component
function ClippingToolbar({ enabled, onToggle }: { enabled: boolean; onToggle: (enabled: boolean) => void }) {
  return (
    <div className="absolute top-20 left-4 bg-background border border-border rounded-lg p-2">
      <button
        onClick={() => onToggle(!enabled)}
        className={`px-4 py-2 rounded ${
          enabled
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-accent'
        }`}
      >
        ✂️ Section View
      </button>

      {enabled && (
        <div className="mt-2 text-xs text-text-secondary">
          <p>Double-click plane to delete</p>
          <p>Drag edges to resize</p>
          <p>Drag face to move</p>
        </div>
      )}
    </div>
  );
}
```

---

## Performance Optimization

### 1. Fragments Over IFC
**Impact:** 10-100x faster loading

```typescript
// ❌ BAD: Load IFC every time
await ifcLoader.load(ifcBuffer);

// ✅ GOOD: Load Fragments once, cache forever
await fragments.core.load(fragmentsBuffer);
```

---

### 2. Level of Detail (LOD)
**Impact:** Reduced memory, smoother rendering

Your backend already supports LOD decimation (2000 triangles default). Use this for:
- Low-LOD: Initial load (fast)
- High-LOD: On-demand for selected elements

```python
# backend/apps/models/services/geometry.py
extract_geometry_for_model(
    model_id=model_id,
    lod_level='low',        # Simplified geometry
    target_triangles=2000   # Max triangles per element
)
```

In viewer, request high-LOD when user selects element:

```typescript
// Load high-detail geometry on selection
const fetchHighLOD = async (elementId: string) => {
  const response = await fetch(
    `/api/entities/${elementId}/geometry/?lod=high`
  );
  const { vertices, faces } = await response.json();

  // Replace low-LOD mesh with high-LOD
  updateElementGeometry(elementId, vertices, faces);
};
```

---

### 3. Streaming Fragments
**Impact:** Instant initial display, progressive loading

ThatOpen supports streaming (load visible parts first):

```typescript
const fragments = components.get(OBC.FragmentsManager);

// Enable streaming
fragments.core.streamSettings = {
  enabled: true,
  minStreamSize: 1 * 1024 * 1024, // 1 MB chunks
};

// Prioritize visible geometry
world.camera.controls.addEventListener('change', () => {
  fragments.core.updateStreamPriority();
});
```

---

### 4. Web Workers
**Impact:** Smooth UI during heavy processing

ThatOpen uses Web Workers automatically for:
- IFC parsing
- Fragment loading
- Geometry processing

Ensure your Vite config supports workers:

```typescript
// vite.config.ts
export default defineConfig({
  worker: {
    format: 'es',
  },
});
```

---

## Testing Strategy

### Unit Tests
Test individual ThatOpen integrations:

```typescript
// tests/viewer/thatopen.test.ts
import { describe, it, expect } from 'vitest';
import * as OBC from '@thatopen/components';

describe('ThatOpen Integration', () => {
  it('should initialize Components', () => {
    const components = new OBC.Components();
    expect(components).toBeDefined();
    components.dispose();
  });

  it('should create World', () => {
    const components = new OBC.Components();
    const worlds = components.get(OBC.Worlds);
    const world = worlds.create();

    expect(world).toBeDefined();
    expect(world.scene).toBeNull(); // Not initialized yet

    components.dispose();
  });

  it('should load Fragments', async () => {
    const components = new OBC.Components();
    const fragments = components.get(OBC.FragmentsManager);
    await fragments.init();

    // Load sample Fragment file
    const response = await fetch('/test-assets/sample.frag');
    const buffer = await response.arrayBuffer();

    await fragments.core.load(new Uint8Array(buffer));

    expect(fragments.list.size).toBeGreaterThan(0);

    components.dispose();
  });
});
```

---

### Integration Tests
Test viewer with real models:

```typescript
// tests/viewer/integration.test.ts
import { render, screen, waitFor } from '@testing-library/react';
import { ThatOpenViewer } from '@/components/features/viewer/ThatOpenViewer';

describe('ThatOpen Viewer Integration', () => {
  it('should render viewer', () => {
    render(<ThatOpenViewer modelId="test-model-id" />);
    expect(screen.getByText(/Loading model/i)).toBeInTheDocument();
  });

  it('should load model successfully', async () => {
    render(<ThatOpenViewer modelId="test-model-id" />);

    await waitFor(() => {
      expect(screen.getByText(/Elements:/i)).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  it('should display error on failed load', async () => {
    render(<ThatOpenViewer modelId="invalid-id" />);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});
```

---

### Performance Tests
Measure loading times:

```typescript
// tests/viewer/performance.test.ts
describe('ThatOpen Performance', () => {
  it('should load Fragments in under 2 seconds', async () => {
    const start = performance.now();

    // Load Fragment
    await fragments.core.load(fragmentsBuffer);

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(2000);
  });

  it('should render 60 FPS with 1000+ elements', async () => {
    // Load large model
    await fragments.core.load(largeModelBuffer);

    // Measure FPS
    const fps = await measureFPS(world, 60); // Measure for 60 frames
    expect(fps).toBeGreaterThan(55); // Allow 5 FPS margin
  });
});
```

---

## Resources & References

### Official Documentation
- **ThatOpen Docs**: https://docs.thatopen.com
- **Components API**: https://docs.thatopen.com/api/@thatopen/components
- **Tutorials**: https://docs.thatopen.com/Tutorials/Components/

### GitHub Repositories
- **engine_components**: https://github.com/ThatOpen/engine_components
- **engine_ui-components**: https://github.com/ThatOpen/engine_ui-components
- **engine_fragments**: https://github.com/ThatOpen/engine_fragment

### Community
- **Discord**: https://discord.gg/ThatOpen
- **GitHub Discussions**: https://github.com/ThatOpen/engine_components/discussions

### Your Local Resources
- `/resources/knowledge/thatopen/` - Downloaded documentation PDFs
- Key files:
  - `Getting started _ That Open docs.pdf`
  - `IfcLoader _ That Open docs.pdf`
  - `Components _ That Open docs.pdf`
  - `Worlds _ That Open docs.pdf`

### Three.js Resources
- **Three.js Docs**: https://threejs.org/docs/
- **@react-three/fiber**: https://docs.pmnd.rs/react-three-fiber
- **@react-three/drei**: https://github.com/pmndrs/drei

### IFC Standards
- **buildingSMART**: https://www.buildingsmart.org/
- **IFC Schema**: https://standards.buildingsmart.org/IFC/
- **web-ifc**: https://github.com/tomvandig/web-ifc

---

## Next Steps

### Immediate Actions (This Week)
1. ✅ **Install ThatOpen packages** (npm install)
2. ✅ **Configure WASM** (copy files to public/)
3. ✅ **Create basic viewer** (ThatOpenViewer.tsx)
4. ✅ **Test with sample model**

### Short-term Goals (Next 2 Weeks)
1. Replace legacy IFCViewer with ThatOpenViewer
2. Implement Fragment storage backend
3. Add element selection + properties panel
4. Integrate with existing Django API

### Long-term Vision (Next 2 Months)
1. Full BIM toolset (measurements, clipping, BCF)
2. Federated model support
3. Collaboration features (annotations, issues)
4. Mobile-optimized viewer

---

## Questions to Consider

1. **Fragment Storage Strategy:**
   - Store in Supabase Storage (recommended) or serve from Django?
   - Cache Fragments in browser IndexedDB?
   - Generate Fragments on upload or on-demand?

2. **Backend Geometry:**
   - Keep PostgreSQL geometry for analytics?
   - Migrate entirely to Fragments?
   - Hybrid approach (Fragments for viewer, PostgreSQL for server logic)?

3. **UI Library:**
   - Use @thatopen/ui or stick with shadcn/ui?
   - Hybrid approach (ThatOpen for 3D tools, shadcn for app UI)?

4. **Performance Targets:**
   - What model sizes need to support? (100 MB? 500 MB? 1 GB?)
   - Target FPS? (30? 60?)
   - Max loading time? (5 seconds? 10 seconds?)

---

## Conclusion

This guide provides a comprehensive roadmap for integrating ThatOpen and Three.js into your BIM Coordinator Platform. Start with Phase 1 (basic viewer), test thoroughly, then progressively add advanced features.

**Key Takeaway:** ThatOpen transforms your platform from "basic IFC viewer" to "professional BIM coordination software" with minimal effort. The component-based architecture means you can add features incrementally without refactoring.

**Remember:**
- Start simple (basic viewer first)
- Test with real models
- Measure performance
- Iterate based on user feedback

Good luck! 🚀

---

**Last Updated:** 2025-10-31
**Next Review:** After Phase 1 implementation
**Maintainer:** Development Team
