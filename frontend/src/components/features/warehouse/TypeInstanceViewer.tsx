/**
 * Type Instance Viewer
 *
 * Standalone mini-viewer for displaying instances of a selected IFC type.
 * Based on the original Streamlit ifc_preview.py from sidequests.
 *
 * Features:
 * - Loads model fragments independently
 * - Highlights current instance
 * - Prev/Next navigation between instances
 * - Fits camera to current instance
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';
import type { FragmentsGroup } from '@thatopen/fragments';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Box } from 'lucide-react';
import { useTypeInstances } from '@/hooks/use-warehouse';

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

  // Fetch instances for the selected type
  const { data: instanceData, isLoading: isLoadingInstances } = useTypeInstances(typeId);

  const instances = instanceData?.instances || [];
  const totalCount = instanceData?.total_count || 0;
  const currentInstance = instances[currentIndex];

  // Reset index when type changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [typeId]);

  // Initialize viewer
  useEffect(() => {
    if (!containerRef.current) return;

    let cleanupResize: (() => void) | null = null;

    const initViewer = async () => {
      try {
        console.log('🎯 Initializing Instance Viewer...');
        const container = containerRef.current;
        if (!container) {
          console.error('❌ Container ref is null');
          return;
        }
        console.log('📦 Container dimensions:', container.clientWidth, 'x', container.clientHeight);

        // Check for valid dimensions
        if (container.clientWidth === 0 || container.clientHeight === 0) {
          console.warn('⚠️ Container has zero dimensions, retrying in 100ms...');
          setTimeout(() => initViewer(), 100);
          return;
        }

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

        // Configure camera
        const controls = world.camera.controls;
        controls.dollySpeed = 1.5;
        controls.minDistance = 0.5;
        controls.maxDistance = 500;

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
        highlighter.zoomToSelection = true; // Zoom to highlighted element

        // Add highlight style (orange for current instance)
        const orange = new THREE.Color(0xff6600);
        highlighter.add('current', orange);
        highlighterRef.current = highlighter;

        // 10. Setup Hider for isolating elements
        const hider = components.get(OBC.Hider);
        hiderRef.current = hider;

        // Handle resize
        const handleResize = () => {
          world.renderer?.resize();
        };
        window.addEventListener('resize', handleResize);
        cleanupResize = () => window.removeEventListener('resize', handleResize);

        setIsInitialized(true);
        console.log('✅ Instance Viewer initialized!');
      } catch (err) {
        console.error('Failed to initialize viewer:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize viewer');
      }
    };

    initViewer();

    return () => {
      console.log('🧹 Cleaning up Instance Viewer...');
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
          const fragmentsResponse = await fetch(`/api/models/${modelId}/fragments/`);

          if (fragmentsResponse.ok) {
            const fragmentsData = await fragmentsResponse.json();
            const { fragments_url } = fragmentsData;
            console.log(`🚀 Loading Fragments for Instance Viewer from: ${fragments_url}`);

            const response = await fetch(fragments_url);
            const data = await response.arrayBuffer();
            const buffer = new Uint8Array(data);

            const group = fragments.load(buffer);
            console.log('📐 Fragments loaded, adding to scene...');
            worldRef.current?.scene.three.add(group);
            fragmentsGroupRef.current = group;

            // Log bounding box
            const bbox = new THREE.Box3().setFromObject(group);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            console.log('📏 Model bounding box size:', size.x.toFixed(2), 'x', size.y.toFixed(2), 'x', size.z.toFixed(2));

            // Fit to view
            fitToModel(group);

            console.log('✅ Model loaded for Instance Viewer');
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Fragments not available, falling back to IFC');
        }

        // Fallback: Load IFC
        const modelResponse = await fetch(`/api/models/${modelId}/`);
        if (!modelResponse.ok) throw new Error('Model not found');

        const modelData = await modelResponse.json();
        if (!modelData.file_url) throw new Error('No IFC file available');

        console.log(`📦 Loading IFC for Instance Viewer`);
        const response = await fetch(modelData.file_url);
        const data = await response.arrayBuffer();
        const buffer = new Uint8Array(data);

        const group = await ifcLoader.load(buffer, true, modelData.name || 'model');
        worldRef.current?.scene.three.add(group);
        fragmentsGroupRef.current = group;

        // Fit to view
        fitToModel(group);

        // Trigger fragment generation for next time
        fetch(`/api/models/${modelId}/generate_fragments/`, { method: 'POST' });

        console.log('✅ IFC loaded for Instance Viewer');
      } catch (err) {
        console.error('Failed to load model:', err);
        setError(err instanceof Error ? err.message : 'Failed to load model');
      } finally {
        setIsLoading(false);
      }
    };

    loadModel();
  }, [isInitialized, modelId]);

  // Highlight and isolate instances when they change
  useEffect(() => {
    if (!fragmentsGroupRef.current || !componentsRef.current || instances.length === 0) {
      return;
    }

    const components = componentsRef.current;
    const highlighter = highlighterRef.current;
    const hider = hiderRef.current;

    if (!highlighter || !hider) return;

    try {
      const fragmentsManager = components.get(OBC.FragmentsManager);

      // Get all instance GUIDs for this type
      const instanceGuids = instances.map(inst => inst.ifc_guid);

      // Use ThatOpen's built-in guidToFragmentIdMap
      const fragmentMap = fragmentsManager.guidToFragmentIdMap(instanceGuids);

      // Clear previous highlights
      highlighter.clear('current');

      // Check if we found any matching elements
      const hasMatches = Object.keys(fragmentMap).length > 0;

      if (hasMatches) {
        console.log(`🎯 Found ${Object.keys(fragmentMap).length} fragments with ${instanceGuids.length} instances`);

        // Isolate: hide all, then show only matching
        hider.set(false); // Hide all
        hider.set(true, fragmentMap); // Show only matching

        // Highlight current instance specifically
        if (currentInstance) {
          const currentFragMap = fragmentsManager.guidToFragmentIdMap([currentInstance.ifc_guid]);
          if (Object.keys(currentFragMap).length > 0) {
            highlighter.highlightByID('current', currentFragMap, false, true);
          }
        }
      } else {
        console.log('⚠️ No matching instances found in model, showing all');
        hider.set(true); // Show all if no matches
      }
    } catch (err) {
      console.error('Failed to highlight instances:', err);
      // Show all on error
      hider?.set(true);
    }
  }, [instances, currentInstance, isLoading]);

  // Fit camera to model
  const fitToModel = useCallback((group: FragmentsGroup) => {
    if (!worldRef.current) return;

    const bbox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();

    bbox.getCenter(center);
    bbox.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.5;

    const cameraPos = new THREE.Vector3(
      center.x + distance * 0.7,
      center.y + distance * 0.5,
      center.z + distance * 0.7
    );

    worldRef.current.camera?.controls?.setLookAt(
      cameraPos.x, cameraPos.y, cameraPos.z,
      center.x, center.y, center.z
    );
  }, []);

  // Navigation handlers
  const goToPrev = useCallback(() => {
    setCurrentIndex(i => Math.max(0, i - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex(i => Math.min(totalCount - 1, i + 1));
  }, [totalCount]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      <div className={`flex flex-col items-center justify-center bg-background-secondary rounded-lg ${className}`}>
        <Box className="h-12 w-12 text-text-tertiary mb-2" />
        <p className="text-sm text-text-secondary">Select a type to preview instances</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-background-secondary rounded-lg overflow-hidden ${className}`}>
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
      <div className="flex items-center justify-between p-3 border-t border-border-primary">
        <Button
          variant="outline"
          size="sm"
          onClick={goToPrev}
          disabled={currentIndex === 0 || isLoading}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Prev
        </Button>

        <div className="text-center">
          <span className="text-sm font-medium text-text-primary">
            {totalCount > 0 ? `${currentIndex + 1} of ${totalCount}` : 'No instances'}
          </span>
          {currentInstance && (
            <p className="text-xs text-text-secondary truncate max-w-[150px]">
              {currentInstance.name || currentInstance.ifc_guid}
            </p>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={goToNext}
          disabled={currentIndex >= totalCount - 1 || isLoading}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
