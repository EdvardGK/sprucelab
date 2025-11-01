/**
 * EMERGENCY STANDALONE IFC VIEWER
 *
 * This viewer works entirely in the browser with NO backend required.
 * User uploads IFC file → Viewer displays it immediately.
 *
 * Features:
 * - Client-side IFC parsing (ThatOpen)
 * - 3D visualization
 * - Basic controls (orbit, zoom, pan)
 * - Element selection
 * - Properties display
 *
 * NO DEPENDENCIES ON:
 * - Backend API
 * - Database
 * - File storage
 */

import { useEffect, useRef, useState } from 'react';
import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Upload, AlertCircle, Box, Info } from 'lucide-react';

interface ElementProperties {
  expressID: number;
  type: string;
  name?: string;
  guid?: string;
  [key: string]: any;
}

export function EmergencyThatOpenViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentsRef = useRef<OBC.Components | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elementCount, setElementCount] = useState(0);
  const [selectedElement, setSelectedElement] = useState<ElementProperties | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  // Initialize viewer on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const initViewer = async () => {
      try {
        console.log('🚀 Initializing Emergency Viewer...');

        // 1. Create Components instance
        const components = new OBC.Components();
        componentsRef.current = components;

        // 2. Create World
        const worlds = components.get(OBC.Worlds);
        const world = worlds.create<
          OBC.SimpleScene,
          OBC.OrthoPerspectiveCamera,
          OBC.SimpleRenderer
        >();

        // 3. Setup Scene
        world.scene = new OBC.SimpleScene(components);
        world.scene.setup();
        world.scene.three.background = new THREE.Color(0x1a1a1a);

        // 4. Setup Renderer
        world.renderer = new OBC.SimpleRenderer(components, containerRef.current);
        world.renderer.three.setSize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );

        // 5. Setup Camera
        world.camera = new OBC.OrthoPerspectiveCamera(components);
        await world.camera.controls.setLookAt(12, 6, 8, 0, 0, 0);

        // 6. Initialize
        components.init();

        // 7. Setup Grid
        const grids = components.get(OBC.Grids);
        grids.create(world);

        // 8. Setup FragmentsManager
        const fragments = components.get(OBC.FragmentsManager);
        fragments.init();

        // Update camera on rest
        world.camera.controls.addEventListener('rest', () => {
          fragments.core.update(true);
        });

        // Handle loaded fragments
        fragments.list.onItemSet.add(({ value: model }) => {
          model.useCamera(world.camera.three);
          world.scene!.three.add(model.object);
          fragments.core.update(true);
          setElementCount(model.items.count);
          setModelLoaded(true);
        });

        // 9. Setup IFC Loader
        const ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: 'https://unpkg.com/web-ifc@0.0.72/',
            absolute: true,
          },
        });

        // 10. Setup selection (clicking elements)
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

  // Setup element selection
  const setupSelection = (
    components: OBC.Components,
    world: OBC.World,
    container: HTMLElement
  ) => {
    container.addEventListener('click', async (event) => {
      try {
        const fragments = components.get(OBC.FragmentsManager);

        // Calculate mouse position
        const bounds = container.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        const mouse = new THREE.Vector2(
          (x / bounds.width) * 2 - 1,
          -(y / bounds.height) * 2 + 1
        );

        // Raycast to find clicked element
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, world.camera!.three);

        // Get all fragment meshes
        const meshes: THREE.Mesh[] = [];
        fragments.list.forEach((model) => {
          model.object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              meshes.push(child);
            }
          });
        });

        const intersects = raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
          const mesh = intersects[0].object as THREE.Mesh;

          // Get properties from userData
          const properties: ElementProperties = {
            expressID: mesh.userData.expressID || 0,
            type: mesh.userData.type || 'Unknown',
            name: mesh.userData.name,
            guid: mesh.userData.guid,
          };

          setSelectedElement(properties);
          console.log('Selected element:', properties);

          // Highlight selected mesh
          if (mesh.material instanceof THREE.Material) {
            // Store original material if not already stored
            if (!mesh.userData.originalMaterial) {
              mesh.userData.originalMaterial = mesh.material;
            }

            // Create highlight material
            const highlightMaterial = new THREE.MeshStandardMaterial({
              color: 0x00ff00,
              emissive: 0x00ff00,
              emissiveIntensity: 0.3,
            });

            mesh.material = highlightMaterial;
          }
        } else {
          // Clicked empty space - deselect
          setSelectedElement(null);

          // Restore all materials
          meshes.forEach((mesh) => {
            if (mesh.userData.originalMaterial) {
              mesh.material = mesh.userData.originalMaterial;
            }
          });
        }
      } catch (err) {
        console.error('Selection error:', err);
      }
    });
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !componentsRef.current) return;

    setIsLoading(true);
    setError(null);
    setSelectedElement(null);

    try {
      console.log('📂 Loading IFC file:', file.name);

      const components = componentsRef.current;
      const ifcLoader = components.get(OBC.IfcLoader);

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      // Load IFC file
      await ifcLoader.load(buffer, false, file.name, {
        processData: {
          progressCallback: (progress) => {
            console.log(`Loading: ${(progress * 100).toFixed(0)}%`);
          },
        },
      });

      console.log('✅ IFC file loaded successfully!');
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load IFC:', err);
      setError(err instanceof Error ? err.message : 'Failed to load IFC file');
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full h-screen bg-gray-900">
      {/* 3D Viewer Container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Upload Button (Top Left) */}
      {!modelLoaded && (
        <div className="absolute top-4 left-4 z-10">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ifc"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isInitialized || isLoading}
            size="lg"
            className="gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Upload IFC File
              </>
            )}
          </Button>
        </div>
      )}

      {/* Model Info (Top Right) */}
      {modelLoaded && (
        <Card className="absolute top-4 right-4 p-4 bg-gray-800/90 backdrop-blur-sm border-gray-700 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Box className="h-4 w-4 text-green-400" />
            <span className="font-semibold">Model Loaded</span>
          </div>
          <div className="text-sm text-gray-300">
            Elements: <span className="font-medium text-white">{elementCount}</span>
          </div>
          <Button
            onClick={() => {
              setModelLoaded(false);
              setElementCount(0);
              setSelectedElement(null);
              if (componentsRef.current) {
                const fragments = componentsRef.current.get(OBC.FragmentsManager);
                fragments.dispose();
              }
            }}
            variant="outline"
            size="sm"
            className="mt-3 w-full"
          >
            Load Another File
          </Button>
        </Card>
      )}

      {/* Properties Panel (Right) */}
      {selectedElement && (
        <Card className="absolute right-4 top-32 w-80 max-h-[calc(100vh-160px)] overflow-y-auto bg-gray-800/90 backdrop-blur-sm border-gray-700 text-white">
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

      {/* Instructions (Bottom Center) */}
      {!modelLoaded && !isLoading && (
        <Card className="absolute bottom-8 left-1/2 -translate-x-1/2 p-4 bg-gray-800/90 backdrop-blur-sm border-gray-700 text-white">
          <div className="text-sm text-center">
            <p className="font-semibold mb-2">Welcome to Emergency IFC Viewer</p>
            <p className="text-gray-300">
              Click "Upload IFC File" to get started
            </p>
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
      {isLoading && (
        <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-20">
          <Card className="p-6 bg-gray-800 border-gray-700">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
              <div className="text-center">
                <p className="text-white font-semibold mb-1">Loading IFC Model</p>
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
