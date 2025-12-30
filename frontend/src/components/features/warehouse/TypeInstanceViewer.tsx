/**
 * Type Instance Viewer
 *
 * Standalone mini-viewer for displaying instances of a selected IFC type.
 * Uses ThatOpen Components fragments viewer for fast 3D preview.
 *
 * Features:
 * - Loads model fragments independently
 * - Shows only instances of the selected type
 * - Zooms to current instance with Prev/Next navigation
 * - "Show All" mode to see all instances at once
 * - Keyboard navigation (arrow keys)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';
import type { FragmentsGroup } from '@thatopen/fragments';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Box, Layers } from 'lucide-react';
import { useTypeInstances } from '@/hooks/use-warehouse';
import { cn } from '@/lib/utils';

// API base URL - use env var for production, fallback to relative path for local dev
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

interface TypeInstanceViewerProps {
  modelId: string;
  typeId: string | null;
  className?: string;
}

export function TypeInstanceViewer({ modelId, typeId, className }: TypeInstanceViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentsRef = useRef<OBC.Components | null>(null);
  const worldRef = useRef<OBC.World | null>(null);
  const fragmentsGroupRef = useRef<FragmentsGroup | null>(null);
  const highlighterRef = useRef<OBCF.Highlighter | null>(null);
  const hiderRef = useRef<OBC.Hider | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);

  // Fetch instances for the selected type
  const { data: instanceData, isLoading: isLoadingInstances } = useTypeInstances(typeId);

  const instances = instanceData?.instances || [];
  const totalCount = instanceData?.total_count || 0;
  const currentInstance = instances[currentIndex];

  // Reset index and showAll when type changes
  useEffect(() => {
    setCurrentIndex(0);
    setShowAll(false);
  }, [typeId]);

  // Initialize viewer
  useEffect(() => {
    if (!containerRef.current) return;

    let cleanupResize: (() => void) | null = null;
    let cleanupMouseHandlers: (() => void) | null = null;

    const initViewer = async () => {
      try {
        const container = containerRef.current;
        if (!container) {
          console.log('[TypeInstanceViewer] No container ref');
          return;
        }

        // Check for valid dimensions
        if (container.clientWidth === 0 || container.clientHeight === 0) {
          console.log('[TypeInstanceViewer] Container has zero dimensions, retrying...');
          setTimeout(() => initViewer(), 100);
          return;
        }

        console.log('[TypeInstanceViewer] Initializing viewer, container:', container.clientWidth, 'x', container.clientHeight);

        // 1. Create Components
        const components = new OBC.Components();
        componentsRef.current = components;

        // 2. Create World
        const worlds = components.get(OBC.Worlds);
        const world = worlds.create<
          OBC.SimpleScene,
          OBC.OrthoPerspectiveCamera,
          OBC.SimpleRenderer
        >();
        worldRef.current = world;

        // 3. Setup Scene
        world.scene = new OBC.SimpleScene(components);
        world.scene.setup();
        world.scene.three.background = new THREE.Color(0x1a1f24);

        // 4. Setup Renderer
        world.renderer = new OBC.SimpleRenderer(components, container);

        // 5. Setup Camera
        world.camera = new OBC.OrthoPerspectiveCamera(components);

        // 6. Initialize Components
        components.init();

        // Configure camera controls (matching UnifiedBIMViewer)
        const controls = world.camera.controls;
        controls.dollySpeed = 1.5;
        controls.minDistance = 0.1;  // Allow very close zoom for detail inspection
        controls.maxDistance = 2000; // Allow far zoom for large models

        // Set near/far clipping planes (matching UnifiedBIMViewer)
        const threeCamera = world.camera.three;
        if (threeCamera instanceof THREE.PerspectiveCamera) {
          threeCamera.near = 0.01; // 1cm - allows very close inspection
          threeCamera.far = 5000;  // 5km - handles large site models
          threeCamera.updateProjectionMatrix();
        } else if (threeCamera instanceof THREE.OrthographicCamera) {
          threeCamera.near = 0.01;
          threeCamera.far = 5000;
          threeCamera.updateProjectionMatrix();
        }

        // Initial camera position
        await controls.setLookAt(20, 20, 20, 0, 0, 0);

        // 7. Setup Grid (smaller for preview)
        const grids = components.get(OBC.Grids);
        const grid = grids.create(world);
        if (grid.three) {
          grid.three.scale.set(0.5, 0.5, 0.5);
        }

        // 8. Setup IFC Loader
        const ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: 'https://unpkg.com/web-ifc@0.0.68/',
            absolute: true,
          },
        });

        // 9. Setup Highlighter
        const highlighter = components.get(OBCF.Highlighter);
        highlighter.setup({ world });
        highlighter.zoomToSelection = false; // We'll handle zoom manually

        // Add highlight style (orange for current instance)
        const orange = new THREE.Color(0xff6600);
        highlighter.add('current', orange);
        highlighterRef.current = highlighter;

        // 10. Setup Hider for isolating elements
        const hider = components.get(OBC.Hider);
        hiderRef.current = hider;

        // 11. Setup mouse interaction handlers (matching UnifiedBIMViewer patterns)

        // Click detection thresholds (matching UnifiedBIMViewer)
        const CLICK_THRESHOLD_PX = 5;
        const CLICK_THRESHOLD_MS = 250;
        let mouseDownPos = { x: 0, y: 0 };
        let mouseDownTime = 0;

        const handleMouseDown = (event: MouseEvent) => {
          if (event.button !== 0) return; // Only left button
          mouseDownPos = { x: event.clientX, y: event.clientY };
          mouseDownTime = Date.now();
        };

        const handleMouseUp = async (event: MouseEvent) => {
          if (event.button !== 0) return; // Only left button

          // Check if this was a true click (not a drag)
          const dx = Math.abs(event.clientX - mouseDownPos.x);
          const dy = Math.abs(event.clientY - mouseDownPos.y);
          const distance = Math.sqrt(dx * dx + dy * dy);
          const elapsed = Date.now() - mouseDownTime;

          if (distance > CLICK_THRESHOLD_PX || elapsed > CLICK_THRESHOLD_MS) {
            return; // Was a drag, not a click
          }

          // Select element on click
          try {
            await highlighter.highlight('current', true, false);
          } catch (err) {
            console.error('[TypeInstanceViewer] Selection error:', err);
          }
        };

        // Double-click to zoom to element (matching UnifiedBIMViewer)
        const handleDoubleClick = async (event: MouseEvent) => {
          if (event.button !== 0) return; // Only left button

          try {
            // Highlight without zoom (we'll do custom zoom)
            await highlighter.highlight('current', true, false);

            // Get the selection
            const selection = highlighter.selection['current'];
            if (!selection || Object.keys(selection).length === 0) return;

            // Get fragments manager
            const fragmentsManager = components.get(OBC.FragmentsManager);
            if (!fragmentsManager) return;

            // Collect visible fragment meshes from selection
            const meshes: THREE.Mesh[] = [];
            for (const fragId of Object.keys(selection)) {
              const fragment = fragmentsManager.list.get(fragId);
              if (fragment?.mesh) {
                meshes.push(fragment.mesh);
              }
            }

            // Zoom to selected elements
            if (meshes.length > 0) {
              // Temporarily make meshes visible for bounding box calculation
              const wasVisible = meshes.map(m => m.visible);
              meshes.forEach(m => m.visible = true);

              const bbox = new THREE.Box3();
              meshes.forEach(mesh => {
                const meshBbox = new THREE.Box3().setFromObject(mesh);
                if (!meshBbox.isEmpty()) {
                  bbox.union(meshBbox);
                }
              });

              // Restore visibility
              meshes.forEach((m, i) => m.visible = wasVisible[i]);

              if (!bbox.isEmpty() && world.camera?.controls) {
                const center = new THREE.Vector3();
                bbox.getCenter(center);

                const size = new THREE.Vector3();
                bbox.getSize(size);

                const maxDim = Math.max(size.x, size.y, size.z, 2);
                const dist = Math.max(maxDim * 2.0, 5);

                const camera = world.camera.three;
                const currentDir = new THREE.Vector3();
                camera.getWorldDirection(currentDir);

                const cameraPos = center.clone().sub(currentDir.multiplyScalar(dist));

                world.camera.controls.setLookAt(
                  cameraPos.x, cameraPos.y, cameraPos.z,
                  center.x, center.y, center.z,
                  true // Enable transition animation
                );
              }
            }
          } catch (err) {
            console.error('[TypeInstanceViewer] Double-click zoom error:', err);
          }
        };

        // Middle mouse double-click to fit all to view
        let lastMiddleClickTime = 0;
        const handleAuxClick = (event: MouseEvent) => {
          if (event.button === 1) { // Middle mouse button
            const now = Date.now();
            if (now - lastMiddleClickTime < 300) {
              // Double-click detected
              event.preventDefault();
              if (fragmentsGroupRef.current) {
                const bbox = new THREE.Box3().setFromObject(fragmentsGroupRef.current);
                if (!bbox.isEmpty()) {
                  const center = new THREE.Vector3();
                  bbox.getCenter(center);
                  const size = new THREE.Vector3();
                  bbox.getSize(size);
                  const maxDim = Math.max(size.x, size.y, size.z);
                  const distance = maxDim * 1.5;
                  const cameraPos = new THREE.Vector3(
                    center.x + distance * 0.7,
                    center.y + distance * 0.5,
                    center.z + distance * 0.7
                  );
                  world.camera?.controls?.setLookAt(
                    cameraPos.x, cameraPos.y, cameraPos.z,
                    center.x, center.y, center.z,
                    true
                  );
                }
              }
            }
            lastMiddleClickTime = now;
          }
        };

        container.addEventListener('mousedown', handleMouseDown);
        container.addEventListener('mouseup', handleMouseUp);
        container.addEventListener('dblclick', handleDoubleClick);
        container.addEventListener('auxclick', handleAuxClick);

        cleanupMouseHandlers = () => {
          container.removeEventListener('mousedown', handleMouseDown);
          container.removeEventListener('mouseup', handleMouseUp);
          container.removeEventListener('dblclick', handleDoubleClick);
          container.removeEventListener('auxclick', handleAuxClick);
        };

        // Handle resize
        const handleResize = () => {
          world.renderer?.resize();
        };
        window.addEventListener('resize', handleResize);
        cleanupResize = () => window.removeEventListener('resize', handleResize);

        setIsInitialized(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize viewer');
      }
    };

    initViewer();

    return () => {
      cleanupMouseHandlers?.();
      cleanupResize?.();

      if (componentsRef.current) {
        try {
          componentsRef.current.dispose();
        } catch (err) {
          console.warn('Error disposing components:', err);
        }
        componentsRef.current = null;
      }

      worldRef.current = null;
      fragmentsGroupRef.current = null;
      highlighterRef.current = null;
      hiderRef.current = null;

      if (containerRef.current) {
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
  }, []);

  // Load model when initialized and modelId changes
  useEffect(() => {
    if (!isInitialized || !modelId || !componentsRef.current) return;

    const loadModel = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const components = componentsRef.current!;
        const fragments = components.get(OBC.FragmentsManager);
        const ifcLoader = components.get(OBC.IfcLoader);

        // Clear existing model
        if (fragmentsGroupRef.current) {
          worldRef.current?.scene.three.remove(fragmentsGroupRef.current);
          fragmentsGroupRef.current = null;
        }

        // Try to load Fragments first
        try {
          const fragmentsResponse = await fetch(`${API_BASE}/models/${modelId}/fragments/`);

          if (fragmentsResponse.ok) {
            const fragmentsData = await fragmentsResponse.json();
            const { fragments_url } = fragmentsData;

            const response = await fetch(fragments_url);
            const data = await response.arrayBuffer();
            const buffer = new Uint8Array(data);

            const group = fragments.load(buffer);
            worldRef.current?.scene.three.add(group);
            fragmentsGroupRef.current = group;

            setIsLoading(false);
            return;
          }
        } catch {
          // Fragments not available, fall back to IFC
        }

        // Fallback: Load IFC
        const modelResponse = await fetch(`${API_BASE}/models/${modelId}/`);
        if (!modelResponse.ok) throw new Error('Model not found');

        const modelData = await modelResponse.json();
        if (!modelData.file_url) throw new Error('No IFC file available');

        const response = await fetch(modelData.file_url);
        const data = await response.arrayBuffer();
        const buffer = new Uint8Array(data);

        const group = await ifcLoader.load(buffer, true, modelData.name || 'model');
        worldRef.current?.scene.three.add(group);
        fragmentsGroupRef.current = group;

        // Trigger fragment generation for next time
        fetch(`${API_BASE}/models/${modelId}/generate_fragments/`, { method: 'POST' });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load model');
      } finally {
        setIsLoading(false);
      }
    };

    loadModel();
  }, [isInitialized, modelId]);

  // Zoom to visible instances with double-click style behavior
  // Uses 2x bounding box multiplier and maintains camera viewing angle
  const zoomToVisibleInstances = useCallback(() => {
    if (!worldRef.current || !fragmentsGroupRef.current) return;

    const group = fragmentsGroupRef.current;

    // Compute bounding box from visible items only
    const bbox = new THREE.Box3();
    let hasVisibleItems = false;

    for (const fragment of group.items) {
      if (fragment.mesh?.visible) {
        const meshBbox = new THREE.Box3().setFromObject(fragment.mesh);
        if (!meshBbox.isEmpty()) {
          bbox.union(meshBbox);
          hasVisibleItems = true;
        }
      }
    }

    // Fallback to entire group if no visible items
    if (!hasVisibleItems) {
      bbox.setFromObject(group);
    }

    if (bbox.isEmpty()) return;

    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Use 2x multiplier for comfortable viewing (matching UnifiedBIMViewer double-click)
    const maxDim = Math.max(size.x, size.y, size.z, 2); // Minimum 2m
    const distance = Math.max(maxDim * 2.0, 5); // At least 5m away

    // Get current camera direction to maintain viewing angle
    const camera = worldRef.current.camera?.three;
    if (camera && worldRef.current.camera?.controls) {
      const currentDir = new THREE.Vector3();
      camera.getWorldDirection(currentDir);

      // Position camera at distance from center, opposite to view direction
      const cameraPos = center.clone().sub(currentDir.multiplyScalar(distance));

      worldRef.current.camera.controls.setLookAt(
        cameraPos.x, cameraPos.y, cameraPos.z,
        center.x, center.y, center.z,
        true // Animate transition
      );
    }
  }, []);

  // Highlight and isolate instances when they change
  // Instance changes behave like double-click (animated zoom to element)
  useEffect(() => {
    if (!fragmentsGroupRef.current || !componentsRef.current || instances.length === 0) {
      return;
    }

    const components = componentsRef.current;
    const highlighter = highlighterRef.current;
    const group = fragmentsGroupRef.current;

    if (!highlighter) {
      console.log('[TypeInstanceViewer] No highlighter, just zooming');
      zoomToVisibleInstances();
      return;
    }

    try {
      const fragmentsManager = components.get(OBC.FragmentsManager);

      // Clear previous highlights
      highlighter.clear('current');

      // Get GUIDs to show based on mode
      const guidsToShow = showAll
        ? instances.map(inst => inst.ifc_guid)
        : currentInstance ? [currentInstance.ifc_guid] : [];

      if (guidsToShow.length === 0) {
        zoomToVisibleInstances();
        return;
      }

      const fragmentIdMapToShow = fragmentsManager.guidToFragmentIdMap(guidsToShow);
      const hasMatches = Object.keys(fragmentIdMapToShow).length > 0;

      console.log('[TypeInstanceViewer] Isolating:', {
        mode: showAll ? 'showAll' : 'single',
        guidsCount: guidsToShow.length,
        fragmentIdMapKeys: Object.keys(fragmentIdMapToShow),
        hasMatches,
      });

      if (hasMatches) {
        // Use Three.js visibility directly on fragment meshes
        // First, hide all fragment items
        for (const fragment of group.items) {
          if (fragment.mesh) {
            fragment.mesh.visible = false;
          }
        }

        // Then show only the ones we want
        for (const [fragmentId] of Object.entries(fragmentIdMapToShow)) {
          const fragment = group.items.find(f => f.id === fragmentId);
          if (fragment?.mesh) {
            fragment.mesh.visible = true;
          }
        }

        // Highlight current instance
        if (currentInstance) {
          const currentFragIdMap = fragmentsManager.guidToFragmentIdMap([currentInstance.ifc_guid]);
          if (Object.keys(currentFragIdMap).length > 0) {
            highlighter.highlightByID('current', currentFragIdMap, false, false);
          }
        }
      }

      // Zoom to visible elements (behaves like double-click - animated zoom with 2x multiplier)
      zoomToVisibleInstances();
    } catch (err) {
      console.error('[TypeInstanceViewer] Filtering failed:', err);
      zoomToVisibleInstances();
    }
  }, [instances, currentInstance, currentIndex, showAll, isLoading, zoomToVisibleInstances]);

  // Navigation handlers
  const goToPrev = useCallback(() => {
    setCurrentIndex(i => Math.max(0, i - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex(i => Math.min(totalCount - 1, i + 1));
  }, [totalCount]);

  const toggleShowAll = useCallback(() => {
    setShowAll(prev => !prev);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext]);

  // Placeholder when no type selected
  if (!typeId) {
    return (
      <div className={cn('flex flex-col items-center justify-center bg-background-secondary rounded-lg', className)}>
        <Box className="h-12 w-12 text-text-tertiary mb-2" />
        <p className="text-sm text-text-secondary">Select a type to preview instances</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col bg-background-secondary rounded-lg overflow-hidden', className)}>
      {/* 3D Canvas */}
      <div className="relative flex-1 min-h-[200px]">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Loading overlay */}
        {(isLoading || isLoadingInstances) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background-secondary/80">
            <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background-secondary/80">
            <AlertCircle className="h-8 w-8 text-status-error mb-2" />
            <p className="text-sm text-status-error">{error}</p>
          </div>
        )}
      </div>

      {/* Instance navigation */}
      <div className="flex items-center justify-between p-2 border-t border-border-primary bg-background">
        <Button
          variant="outline"
          size="sm"
          onClick={goToPrev}
          disabled={currentIndex === 0 || isLoading || showAll}
          className="h-7 px-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2">
          {/* Instance counter */}
          <div className="text-center min-w-[80px]">
            <span className="text-xs font-medium text-text-primary">
              {totalCount > 0 ? (showAll ? `All ${totalCount}` : `${currentIndex + 1} / ${totalCount}`) : 'No instances'}
            </span>
          </div>

          {/* Show All toggle */}
          {totalCount > 1 && (
            <Button
              variant={showAll ? 'default' : 'outline'}
              size="sm"
              onClick={toggleShowAll}
              className="h-7 px-2 gap-1"
              title={showAll ? 'Show one at a time' : 'Show all instances'}
            >
              <Layers className="h-3.5 w-3.5" />
              <span className="text-xs">{showAll ? 'One' : 'All'}</span>
            </Button>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={goToNext}
          disabled={currentIndex >= totalCount - 1 || isLoading || showAll}
          className="h-7 px-2"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
