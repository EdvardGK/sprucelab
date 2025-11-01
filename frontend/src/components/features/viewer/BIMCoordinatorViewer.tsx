/**
 * BIM Coordinator Viewer
 *
 * Production-ready BIM viewer using ThatOpen + plain Three.js
 *
 * Features:
 * - Loads Fragments from backend (10-100x faster than IFC)
 * - Fallback to IFC parsing if Fragments not available
 * - Element selection + properties panel
 * - Integrated with Django backend API
 * - Measurements, clipping, and other BIM tools (future)
 *
 * Architecture:
 * - ThatOpen Components for BIM functionality
 * - Plain Three.js (NO React Three Fiber)
 * - Django REST API for data
 */

import { useEffect, useRef, useState } from 'react';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';
import { useModel } from '@/hooks/use-models';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, AlertCircle, Box, Info, Layers } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface BIMCoordinatorViewerProps {
  modelId: string;
  /** Optional: Multiple models for federated viewing (future) */
  modelIds?: string[];
}

interface ElementProperties {
  expressID: number;
  type: string;
  name?: string;
  guid?: string;
  [key: string]: any;
}

export function BIMCoordinatorViewer({ modelId, modelIds }: BIMCoordinatorViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentsRef = useRef<OBC.Components | null>(null);
  const worldRef = useRef<OBC.World | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elementCount, setElementCount] = useState(0);
  const [selectedElement, setSelectedElement] = useState<ElementProperties | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadMethod, setLoadMethod] = useState<'fragments' | 'ifc' | null>(null);

  // Get model data from backend
  const { data: model, isLoading: isModelLoading } = useModel(modelId);

  // Initialize viewer on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const initViewer = async () => {
      try {
        console.log('🚀 Initializing BIM Coordinator Viewer...');

        // 1. Create Components instance
        const components = new OBC.Components();
        componentsRef.current = components;

        // 2. Create World
        const worlds = components.get(OBC.Worlds);
        const world = worlds.create<
          OBC.SimpleScene,
          OBC.OrthoPerspectiveCamera,
          OBCF.PostproductionRenderer
        >();
        worldRef.current = world;

        // 3. Setup Scene
        world.scene = new OBC.SimpleScene(components);
        world.scene.setup();
        world.scene.three.background = new THREE.Color(0x202932);

        // 4. Setup Renderer
        world.renderer = new OBCF.PostproductionRenderer(
          components,
          containerRef.current
        );
        world.renderer.three.setSize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
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
        await fragments.init();

        // Update camera on rest
        world.camera.controls.addEventListener('rest', () => {
          fragments.core.update(true);
        });

        // Handle loaded fragments
        fragments.list.onItemSet.add(({ value: fragmentModel }) => {
          fragmentModel.useCamera(world.camera!.three);
          world.scene!.three.add(fragmentModel.object);
          fragments.core.update(true);
          setElementCount(fragmentModel.items.count);
          setModelLoaded(true);
        });

        // 9. Setup IFC Loader (for fallback)
        const ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: 'https://unpkg.com/web-ifc@0.0.72/',
            absolute: true,
          },
        });

        // 10. Setup element selection
        setupSelection(components, world, containerRef.current);

        // Handle window resize
        const handleResize = () => {
          if (containerRef.current && world.renderer && world.camera) {
            world.renderer.three.setSize(
              containerRef.current.clientWidth,
              containerRef.current.clientHeight
            );
            world.camera.three.aspect =
              containerRef.current.clientWidth / containerRef.current.clientHeight;
            world.camera.three.updateProjectionMatrix();
          }
        };
        window.addEventListener('resize', handleResize);

        setIsInitialized(true);
        console.log('✅ Viewer initialized!');
      } catch (err) {
        console.error('Failed to initialize viewer:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize viewer');
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
  }, []);

  // Load model when initialized and model data available
  useEffect(() => {
    if (!isInitialized || !model || !componentsRef.current) return;

    const loadModel = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const components = componentsRef.current!;
        const fragments = components.get(OBC.FragmentsManager);

        // Try to load Fragments first (fast path)
        try {
          const fragmentsResponse = await fetch(
            `/api/models/${modelId}/fragments/`
          );

          if (fragmentsResponse.ok) {
            const { fragments_url } = await fragmentsResponse.json();
            console.log('🚀 Loading Fragments from:', fragments_url);

            const response = await fetch(fragments_url);
            const data = await response.arrayBuffer();
            const buffer = new Uint8Array(data);

            await fragments.core.load(buffer);

            setLoadMethod('fragments');
            console.log('✅ Fragments loaded (fast!)');
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Fragments not available, falling back to IFC:', err);
        }

        // Fallback: Load IFC file
        if (!model.file_url) {
          throw new Error('No IFC file available');
        }

        console.log('📂 Loading IFC file:', model.file_url);
        const ifcLoader = components.get(OBC.IfcLoader);

        const response = await fetch(model.file_url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        await ifcLoader.load(buffer, false, model.name, {
          processData: {
            progressCallback: (progress) => {
              console.log(`Loading: ${(progress * 100).toFixed(0)}%`);
            },
          },
        });

        setLoadMethod('ifc');
        console.log('✅ IFC loaded successfully');

        // Trigger Fragment generation on backend for next time
        fetch(`/api/models/${modelId}/generate_fragments/`, {
          method: 'POST',
        }).catch((err) => console.warn('Failed to generate fragments:', err));

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load model:', err);
        setError(err instanceof Error ? err.message : 'Failed to load model');
        setIsLoading(false);
      }
    };

    loadModel();
  }, [isInitialized, model, modelId]);

  // Setup element selection
  const setupSelection = (
    components: OBC.Components,
    world: OBC.World,
    container: HTMLElement
  ) => {
    // Setup Highlighter
    const highlighter = components.get(OBCF.Highlighter);
    highlighter.setup({ world });

    container.addEventListener('click', async (event) => {
      try {
        const result = await highlighter.highlight('select', event);

        if (result) {
          const fragments = components.get(OBC.FragmentsManager);
          const fragmentModel = fragments.list.get(result.modelID);

          if (fragmentModel) {
            // Get IFC properties
            const props = await fragmentModel.getProperties(result.expressID);

            const elementProps: ElementProperties = {
              expressID: result.expressID,
              type: props?.type || 'Unknown',
              name: props?.Name?.value,
              guid: props?.GlobalId?.value,
              ...props,
            };

            setSelectedElement(elementProps);
            console.log('Selected element:', elementProps);
          }
        } else {
          // Clicked empty space - deselect
          setSelectedElement(null);
        }
      } catch (err) {
        console.error('Selection error:', err);
      }
    });
  };

  return (
    <div className="relative w-full h-screen bg-gray-900">
      {/* 3D Viewer Container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Model Info (Top Left) */}
      {modelLoaded && (
        <Card className="absolute top-4 left-4 p-4 bg-gray-800/90 backdrop-blur-sm border-gray-700 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Box className="h-4 w-4 text-green-400" />
            <span className="font-semibold">{model?.name || 'Model'}</span>
          </div>
          <div className="space-y-1 text-sm text-gray-300">
            <div>
              Elements: <span className="font-medium text-white">{elementCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              <span className="text-xs">
                {loadMethod === 'fragments' ? '⚡ Fragments' : '📄 IFC Parsed'}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Properties Panel (Right) */}
      {selectedElement && (
        <Card className="absolute right-4 top-4 w-80 max-h-[calc(100vh-32px)] overflow-y-auto bg-gray-800/90 backdrop-blur-sm border-gray-700 text-white">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-700">
              <Info className="h-4 w-4 text-blue-400" />
              <h3 className="font-semibold">Element Properties</h3>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-400">Type:</span>
                <div className="font-medium mt-1">{selectedElement.type}</div>
              </div>

              {selectedElement.name && (
                <div>
                  <span className="text-gray-400">Name:</span>
                  <div className="font-medium mt-1">{selectedElement.name}</div>
                </div>
              )}

              {selectedElement.guid && (
                <div>
                  <span className="text-gray-400">GUID:</span>
                  <div className="font-mono text-xs mt-1 text-gray-300">
                    {selectedElement.guid}
                  </div>
                </div>
              )}

              <div>
                <span className="text-gray-400">Express ID:</span>
                <div className="font-medium mt-1">{selectedElement.expressID}</div>
              </div>

              {/* Property Sets */}
              {selectedElement.psets && (
                <>
                  <Separator className="my-3" />
                  <div>
                    <h4 className="font-semibold mb-2 text-gray-200">Property Sets</h4>
                    <div className="space-y-2">
                      {Object.entries(selectedElement.psets).map(([psetName, pset]: [string, any]) => (
                        <details key={psetName} className="text-xs">
                          <summary className="cursor-pointer text-gray-400 hover:text-white">
                            {psetName}
                          </summary>
                          <div className="ml-3 mt-1 space-y-1">
                            {Object.entries(pset).map(([key, value]: [string, any]) => (
                              <div key={key}>
                                <span className="text-gray-500">{key}:</span>{' '}
                                <span className="text-gray-300">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <Button
              onClick={() => setSelectedElement(null)}
              variant="outline"
              size="sm"
              className="w-full mt-4"
            >
              Clear Selection
            </Button>
          </div>
        </Card>
      )}

      {/* Controls Info (Bottom Left) */}
      {modelLoaded && (
        <Card className="absolute bottom-4 left-4 p-3 bg-gray-800/90 backdrop-blur-sm border-gray-700 text-white text-xs">
          <div className="space-y-1 text-gray-300">
            <div>Left drag: Rotate</div>
            <div>Right drag: Pan</div>
            <div>Scroll: Zoom</div>
            <div>Click: Select element</div>
          </div>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card className="absolute top-4 left-1/2 -translate-x-1/2 p-4 bg-red-900/90 backdrop-blur-sm border-red-700 text-white max-w-md">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold mb-1">Error Loading Model</h3>
              <p className="text-sm text-red-100">{error}</p>
              <Button
                onClick={() => setError(null)}
                variant="outline"
                size="sm"
                className="mt-3"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Loading Overlay */}
      {(isLoading || isModelLoading) && (
        <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-20">
          <Card className="p-6 bg-gray-800 border-gray-700">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
              <div className="text-center">
                <p className="text-white font-semibold mb-1">
                  {isModelLoading ? 'Loading model data...' : 'Loading 3D model...'}
                </p>
                <p className="text-sm text-gray-400">This may take a minute...</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Initialization Error */}
      {!isInitialized && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <Card className="p-6 bg-gray-800 border-gray-700 text-white max-w-md">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
              <div>
                <h3 className="font-semibold mb-2">Viewer Initialization Failed</h3>
                <p className="text-sm text-gray-300 mb-3">
                  The 3D viewer failed to initialize. This could be due to missing dependencies.
                </p>
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  size="sm"
                >
                  Reload Page
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
