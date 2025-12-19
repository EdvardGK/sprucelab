/**
 * Unified BIM Viewer
 *
 * Production-ready BIM viewer supporting both single-model and multi-model (federated) viewing
 * Built on ThatOpen Components v2.4.11
 *
 * Features:
 * - Single OR multiple model loading
 * - Loads Fragments from backend (10-100x faster than IFC)
 * - Fallback to IFC parsing if Fragments not available
 * - Element selection + properties panel across all models
 * - Per-model visibility control
 * - Element filtering (IFC type, systems)
 * - Configurable UI panels
 * - Integrated with Django backend API
 *
 * Architecture:
 * - ThatOpen Components for BIM functionality
 * - Plain Three.js (NO React Three Fiber)
 * - Django REST API for data
 */

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';
import type { FragmentsGroup } from '@thatopen/fragments';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, AlertCircle, Box, Layers } from 'lucide-react';
import { useSectionPlanes, type SectionPlane } from '@/hooks/useSectionPlanes';
import { ViewerContextMenu, useViewerContextMenu } from './ViewerContextMenu';
import { ElementPropertiesPanel, type ElementProperties } from './ElementPropertiesPanel';
import { ViewerFilterHUD, type TypeInfo } from './ViewerFilterHUD';
import * as ifcService from '@/lib/ifc-service-client';

// API base URL - use env var for production, fallback to relative path for local dev
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Django media base URL - needed for FastAPI to download IFC files
const DJANGO_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Helper to convert relative URLs to absolute (for FastAPI which needs full URLs)
const toAbsoluteUrl = (url: string): string => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${DJANGO_BASE}${url}`;
};

// Imperative handle interface for parent components
export interface UnifiedBIMViewerHandle {
  deleteSectionPlane: (planeId: string) => void;
  clearAllSectionPlanes: () => void;
  setActiveSectionPlane: (planeId: string | null) => void;
}

interface UnifiedBIMViewerProps {
  // Model Loading
  modelIds?: string[];              // Array for multi-model support
  modelId?: string;                 // Convenience prop for single model

  // Visibility Control
  modelVisibility?: Record<string, boolean>;  // Toggle models on/off

  // Type Filtering (controlled by parent)
  typeVisibility?: Record<string, boolean>;   // { 'IfcWall': true, 'IfcDoor': false }

  // Section Planes
  enableSectionPlanes?: boolean;    // Default: true

  // UI Configuration
  showPropertiesPanel?: boolean;    // Default: true
  showModelInfo?: boolean;          // Default: false (minimal by default)
  showControls?: boolean;           // Default: false (minimal by default)
  showFilterHUD?: boolean;          // Default: false (use external panel instead)

  // Callbacks
  onSelectionChange?: (element: ElementProperties | null) => void;
  onModelLoaded?: (modelId: string, elementCount: number) => void;
  onError?: (error: string) => void;
  onSectionPlanesChange?: (planes: SectionPlane[]) => void;
  onElementTypesDiscovered?: (types: string[]) => void;
  onTypesDiscovered?: (types: TypeInfo[]) => void;  // New: full type info with counts

  // Camera
  autoFitToView?: boolean;          // Default: true
  initialCameraPosition?: THREE.Vector3;
}

// ElementProperties is now imported from ElementPropertiesPanel

interface LoadedModel {
  modelId: string;           // Backend model ID
  fragmentModelId: string;   // ThatOpen internal model ID
  group: FragmentsGroup;     // Three.js group
  elementCount: number;
  loadMethod: 'fragments' | 'ifc';
  name: string;
  fileUrl?: string;          // Supabase Storage URL for FastAPI queries
  ifcServiceFileId?: string; // FastAPI file_id for direct IFC queries
}

export const UnifiedBIMViewer = forwardRef<UnifiedBIMViewerHandle, UnifiedBIMViewerProps>(function UnifiedBIMViewer({
  modelIds: modelIdsProp,
  modelId: singleModelId,
  modelVisibility,
  typeVisibility: typeVisibilityProp,  // Controlled type filtering from parent
  enableSectionPlanes = true,
  showPropertiesPanel = true,
  showModelInfo = false,    // Minimal by default
  showControls = false,     // Minimal by default
  showFilterHUD = false,    // Use external panel instead
  onSelectionChange,
  onModelLoaded,
  onError,
  onSectionPlanesChange,
  onElementTypesDiscovered,
  onTypesDiscovered,        // New callback with full type info
  autoFitToView = true,
  initialCameraPosition,
}, ref) {
  // Handle convenience prop: modelId → modelIds
  const modelIds = modelIdsProp || (singleModelId ? [singleModelId] : []);

  const containerRef = useRef<HTMLDivElement>(null);
  const componentsRef = useRef<OBC.Components | null>(null);
  const worldRef = useRef<OBC.World | null>(null);
  const loadedModelsRef = useRef<LoadedModel[]>([]);
  const modelIdMapRef = useRef<Map<string, string>>(new Map()); // fragmentModelId → backendModelId
  const hasLoadedModelsRef = useRef(false); // Guard against multiple loads
  const sectionPlanesRef = useRef<ReturnType<typeof useSectionPlanes> | null>(null); // For keyboard handler access

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<ElementProperties | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<Record<string, boolean>>({});

  // Type filtering state - auto-discovered from loaded models
  const [typeInfo, setTypeInfo] = useState<Map<string, { guids: string[]; count: number }>>(new Map());
  const [internalTypeVisibility, setInternalTypeVisibility] = useState<Record<string, boolean>>({});
  const hiderRef = useRef<OBC.Hider | null>(null);

  // Use controlled or internal type visibility
  const typeVisibility = typeVisibilityProp ?? internalTypeVisibility;
  const setTypeVisibility = typeVisibilityProp ? undefined : setInternalTypeVisibility;

  // Store Three.js objects in state for hooks that need them
  const [viewerState, setViewerState] = useState<{
    components: OBC.Components | null;
    world: OBC.World | null;
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
  }>({ components: null, world: null, renderer: null, scene: null });

  // Context menu state
  const contextMenu = useViewerContextMenu();

  // Section planes hook - uses ThatOpen's OBC.Clipper for reliability
  const sectionPlanes = useSectionPlanes({
    components: viewerState.components,
    world: viewerState.world,
    enabled: enableSectionPlanes && isInitialized,
  });

  // Keep ref in sync for keyboard handler access (avoids stale closure)
  sectionPlanesRef.current = sectionPlanes;

  // Expose section plane controls to parent via ref
  useImperativeHandle(ref, () => ({
    deleteSectionPlane: sectionPlanes.deletePlane,
    clearAllSectionPlanes: sectionPlanes.clearAllPlanes,
    setActiveSectionPlane: sectionPlanes.setActivePlane,
  }), [sectionPlanes.deletePlane, sectionPlanes.clearAllPlanes, sectionPlanes.setActivePlane]);

  // Notify parent of section plane changes
  useEffect(() => {
    onSectionPlanesChange?.(sectionPlanes.planes);
  }, [sectionPlanes.planes, onSectionPlanesChange]);

  // Notify parent of discovered element types
  useEffect(() => {
    if (typeInfo.size > 0) {
      // Legacy callback (just type names)
      onElementTypesDiscovered?.(Array.from(typeInfo.keys()).sort());

      // New callback (full type info with counts and visibility)
      const typesArray: TypeInfo[] = Array.from(typeInfo.entries())
        .map(([type, data]) => ({
          type,
          count: data.count,
          visible: typeVisibility[type] !== false,
        }))
        .sort((a, b) => b.count - a.count);
      onTypesDiscovered?.(typesArray);
    }
  }, [typeInfo, typeVisibility, onElementTypesDiscovered, onTypesDiscovered]);

  // Reset load guard when modelIds change
  useEffect(() => {
    hasLoadedModelsRef.current = false;
    loadedModelsRef.current = [];
    modelIdMapRef.current.clear();
    setLoadingProgress({});
  }, [modelIds.join(',')]);

  // Apply model visibility changes
  useEffect(() => {
    if (!modelVisibility) return;

    loadedModelsRef.current.forEach(({ modelId, group }) => {
      const visible = modelVisibility[modelId] ?? true;
      group.visible = visible;
    });
  }, [modelVisibility]);

  // Helper function to fit all models to view
  const fitAllModelsToView = useCallback(() => {
    if (!worldRef.current || loadedModelsRef.current.length === 0) return;

    // Calculate combined bounding box
    const combinedBbox = new THREE.Box3();

    loadedModelsRef.current.forEach(({ group }) => {
      const bbox = new THREE.Box3();
      bbox.setFromObject(group);
      combinedBbox.union(bbox);
    });

    // Get center and size
    const center = new THREE.Vector3();
    combinedBbox.getCenter(center);

    const size = new THREE.Vector3();
    combinedBbox.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.5; // Camera distance based on model size

    // Position camera to view all models from a nice angle
    const cameraPos = new THREE.Vector3(
      center.x + distance * 0.7,
      center.y + distance * 0.7,
      center.z + distance * 0.7
    );

    // Update camera position
    if (worldRef.current.camera?.controls) {
      worldRef.current.camera.controls.setLookAt(
        cameraPos.x, cameraPos.y, cameraPos.z,
        center.x, center.y, center.z
      );
    }

  }, []);

  // Initialize viewer on mount
  useEffect(() => {
    if (!containerRef.current) return;

    let cleanupSelection: (() => void) | null = null;
    let cleanupResize: (() => void) | null = null;

    const initViewer = async () => {
      try {
        const container = containerRef.current;
        if (!container) return;

        // Wait for container to have valid dimensions
        if (container.clientWidth === 0 || container.clientHeight === 0) {
          console.debug('[Viewer] Container has zero dimensions, waiting...');
          setTimeout(() => initViewer(), 100);
          return;
        }

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
        worldRef.current = world;

        // 3. Setup Scene
        world.scene = new OBC.SimpleScene(components);
        world.scene.setup();
        world.scene.three.background = new THREE.Color(0x202932);

        // 4. Setup Renderer
        world.renderer = new OBC.SimpleRenderer(components, container);

        // 5. Setup Camera
        world.camera = new OBC.OrthoPerspectiveCamera(components);

        // 6. Initialize Components (MUST be called before accessing scene via components.get())
        components.init();

        // Configure camera controls for better user experience
        const controls = world.camera.controls;
        controls.dollySpeed = 1.5; // Faster zoom
        controls.minDistance = 0.1; // Allow very close zoom for detail inspection
        controls.maxDistance = 2000; // Allow far zoom for large models

        // Set near/far clipping planes for close-up detail work
        // Near plane must be small enough to view details up close
        // Far plane must be large enough to see entire model
        const threeCamera = world.camera.three;
        if (threeCamera instanceof THREE.PerspectiveCamera) {
          threeCamera.near = 0.01; // 1cm - allows very close inspection
          threeCamera.far = 5000; // 5km - handles large site models
          threeCamera.updateProjectionMatrix();
        } else if (threeCamera instanceof THREE.OrthographicCamera) {
          threeCamera.near = 0.01;
          threeCamera.far = 5000;
          threeCamera.updateProjectionMatrix();
        }

        // Set initial camera position (will be adjusted when models load)
        if (initialCameraPosition) {
          await controls.setLookAt(
            initialCameraPosition.x,
            initialCameraPosition.y,
            initialCameraPosition.z,
            0, 0, 0
          );
        } else {
          await controls.setLookAt(50, 50, 50, 0, 0, 0);
        }

        // 9. Setup IFC Loader (for fallback)
        const ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: 'https://unpkg.com/web-ifc@0.0.68/',
            absolute: true,
          },
        });

        // 10. Setup element selection with ThatOpen Highlighter
        const highlighter = components.get(OBCF.Highlighter);
        highlighter.setup({ world });

        // 10b. Setup Hider for type filtering
        const hider = components.get(OBC.Hider);
        hiderRef.current = hider;

        // Configure highlighter - DISABLE all automatic camera movement
        highlighter.zoomToSelection = false; // Don't zoom on selection
        // @ts-ignore - ThatOpen may have additional zoom properties
        if ('autoZoom' in highlighter) highlighter.autoZoom = false;
        // @ts-ignore
        if ('zoomFactor' in highlighter) highlighter.zoomFactor = 0;

        // Add selection style with green color
        const green = new THREE.Color(0x00ff00);
        highlighter.add('selection', green);

        // Listen for selection events
        const handleSelection = async () => {
          const selection = highlighter.selection.select || highlighter.selection['selection'];

          if (selection && typeof selection === 'object') {
            // Iterate through models
            for (const fragmentModelID in selection) {
              const fragmentsData = selection[fragmentModelID];

              // Find which backend model this fragment model belongs to
              const backendModelId = modelIdMapRef.current.get(fragmentModelID);

              // Handle if fragmentsData is a Set (contains express IDs directly)
              if (fragmentsData instanceof Set) {
                const ids = Array.from(fragmentsData);
                if (ids.length > 0) {
                  const expressID = ids[0] as number;

                  // Fetch and display properties
                  await fetchAndDisplayProperties(expressID, backendModelId);
                  return; // Only handle first selection
                }
              }
              // Handle if fragmentsData is an object (nested structure)
              else if (typeof fragmentsData === 'object' && fragmentsData !== null) {
                for (const fragmentID in fragmentsData as Record<string, any>) {
                  const expressIDs = (fragmentsData as any)[fragmentID];

                  if (expressIDs instanceof Set && expressIDs.size > 0) {
                    const expressID = Array.from(expressIDs)[0] as number;

                    // Fetch and display properties
                    await fetchAndDisplayProperties(expressID, backendModelId);
                    return; // Only handle first selection
                  }
                }
              }
            }
          }

          // If we get here, no valid selection found
          setSelectedElement(null);
          onSelectionChange?.(null);
        };

        // Helper function to fetch and display element properties
        // Tries FastAPI first (queries IFC directly), falls back to Django (queries database)
        const fetchAndDisplayProperties = async (expressID: number, backendModelId?: string) => {
          if (!backendModelId) {
            const element: ElementProperties = {
              expressID,
              type: 'Unknown',
              name: `Element ${expressID}`,
            };
            setSelectedElement(element);
            onSelectionChange?.(element);
            return;
          }

          // Find loaded model info
          const loadedModel = loadedModelsRef.current.find(m => m.modelId === backendModelId);

          // Try FastAPI first (much faster - queries IFC file directly)
          if (loadedModel?.ifcServiceFileId) {
            try {
              const detail = await ifcService.getElementByExpressId(
                loadedModel.ifcServiceFileId,
                expressID
              );

              const element: ElementProperties = {
                expressID,
                type: detail.ifc_type || 'Unknown',
                predefinedType: undefined, // Not in FastAPI response yet
                objectType: detail.object_type ?? undefined,
                name: detail.name ?? undefined,
                description: detail.description ?? undefined,
                guid: detail.guid,
                modelId: backendModelId,
                modelName: loadedModel?.name,
                // Location
                storey: detail.storey ?? undefined,
                // Quantities from FastAPI
                ...Object.fromEntries(
                  Object.entries(detail.quantities || {}).map(([key, val]) => [
                    key.toLowerCase().includes('area') ? 'area' :
                    key.toLowerCase().includes('volume') ? 'volume' :
                    key.toLowerCase().includes('length') ? 'length' :
                    key.toLowerCase().includes('height') ? 'height' :
                    key.toLowerCase().includes('perimeter') ? 'perimeter' : key,
                    (val as { value: number }).value
                  ])
                ),
                // Materials
                materials: detail.materials?.map(name => ({ name })) || [],
                // Property sets (already in correct format)
                psets: detail.properties,
              };
              setSelectedElement(element);
              onSelectionChange?.(element);
              return;
            } catch {
              // FastAPI failed, fall back to Django
            }
          }

          // Fall back to Django entity API
          try {
            const response = await fetch(`${API_BASE}/entities/entities/by-express-id/?model=${backendModelId}&express_id=${expressID}`);
            if (response.ok) {
              const entity = await response.json();

              // Transform property_sets from array format to object format for the panel
              // Backend returns: { "Pset_Name": [{ name, value, type }, ...] }
              // Panel expects: { "Pset_Name": { prop_name: prop_value, ... } }
              const psets: Record<string, Record<string, any>> = {};
              if (entity.property_sets) {
                for (const [psetName, props] of Object.entries(entity.property_sets)) {
                  psets[psetName] = {};
                  for (const prop of props as Array<{ name: string; value: any }>) {
                    psets[psetName][prop.name] = prop.value;
                  }
                }
              }

              const element: ElementProperties = {
                expressID,
                type: entity.ifc_type || 'Unknown',
                predefinedType: entity.predefined_type,
                objectType: entity.object_type,
                name: entity.name,
                description: entity.description,
                guid: entity.ifc_guid,
                modelId: backendModelId,
                modelName: loadedModel?.name,
                // Location (resolved names from backend)
                storey: entity.storey_name,
                building: entity.building_name,
                site: entity.site_name,
                space: entity.spaces?.length > 0 ? entity.spaces.join(', ') : undefined,
                // Quantities
                area: entity.area,
                volume: entity.volume,
                length: entity.length,
                height: entity.height,
                perimeter: entity.perimeter,
                // Property sets (transformed)
                psets,
              };
              setSelectedElement(element);
              onSelectionChange?.(element);
              return;
            }
          } catch (err) {
            console.error('Failed to fetch properties:', err);
          }

          // Fallback: Show element with just express ID
          const element: ElementProperties = {
            expressID,
            type: 'Unknown',
            name: `Element ${expressID}`,
            modelId: backendModelId,
            modelName: loadedModel?.name,
          };
          setSelectedElement(element);
          onSelectionChange?.(element);
        };

        highlighter.events.select.onHighlight.add(handleSelection);
        highlighter.events.select.onClear.add(() => {
          setSelectedElement(null);
          onSelectionChange?.(null);
        });

        // Setup click handler with drag detection
        // Only trigger selection on true "clicks" (not drags for camera movement)
        const CLICK_THRESHOLD_PX = 5;     // Max pixels moved to count as click
        const CLICK_THRESHOLD_MS = 250;   // Max milliseconds for a click

        let mouseDownPos = { x: 0, y: 0 };
        let mouseDownTime = 0;

        const handleMouseDown = (event: MouseEvent) => {
          // Only track left mouse button
          if (event.button !== 0) return;
          mouseDownPos = { x: event.clientX, y: event.clientY };
          mouseDownTime = Date.now();
        };

        const handleMouseUp = async (event: MouseEvent) => {
          // Only handle left mouse button
          if (event.button !== 0) return;

          if (!world?.camera?.controls) {
            console.warn('Camera not ready for selection');
            return;
          }

          // Check if this was a true click (not a drag)
          const dx = Math.abs(event.clientX - mouseDownPos.x);
          const dy = Math.abs(event.clientY - mouseDownPos.y);
          const distance = Math.sqrt(dx * dx + dy * dy);
          const elapsed = Date.now() - mouseDownTime;

          // If mouse moved too much or held too long, it's a drag - don't select
          if (distance > CLICK_THRESHOLD_PX || elapsed > CLICK_THRESHOLD_MS) {
            return;
          }

          try {

            // Call highlight with correct parameters:
            // highlight(name, removePrevious, zoomToSelection, exclude)
            // - name: 'selection' (our highlight style)
            // - removePrevious: true (clear old selection)
            // - zoomToSelection: false (NEVER auto-zoom camera)
            // - exclude: null (don't exclude any fragments)
            // Note: Raycaster automatically tracks mouse position from DOM events
            await highlighter.highlight('selection', true, false);
          } catch (err) {
            console.error('Selection error:', err);
          }
        };

        container.addEventListener('mousedown', handleMouseDown);
        container.addEventListener('mouseup', handleMouseUp);

        // Setup double-click (left button) to zoom to selection
        const handleDoubleClickSelect = async (event: MouseEvent) => {
          // Only left mouse button
          if (event.button !== 0) return;

          try {
            // Highlight WITHOUT zoom (we'll do custom zoom)
            await highlighter.highlight('selection', true, false);

            // Get the selection
            const selection = highlighter.selection['selection'];
            if (!selection || Object.keys(selection).length === 0) return;

            // Get fragments manager
            const fragments = components.get(OBC.FragmentsManager);
            if (!fragments) return;

            // Compute bounding box from selected fragments
            const bbox = new THREE.Box3();
            let hasGeometry = false;

            for (const [fragId, expressIds] of Object.entries(selection)) {
              if (!expressIds || (expressIds as Set<number>).size === 0) continue;

              // Get the fragment mesh
              const fragment = fragments.list.get(fragId);
              if (!fragment?.mesh) continue;

              // Get bounding box of the fragment mesh
              const meshBbox = new THREE.Box3().setFromObject(fragment.mesh);
              if (!meshBbox.isEmpty()) {
                bbox.union(meshBbox);
                hasGeometry = true;
              }
            }

            // If we found geometry, zoom to it with padding
            if (hasGeometry && !bbox.isEmpty() && world.camera?.controls) {
              const center = new THREE.Vector3();
              bbox.getCenter(center);

              const size = new THREE.Vector3();
              bbox.getSize(size);

              // Use 2x multiplier for comfortable viewing distance
              const maxDim = Math.max(size.x, size.y, size.z, 2); // Minimum 2m
              const distance = Math.max(maxDim * 2.0, 5); // At least 5m away

              // Get current camera direction to maintain viewing angle
              const camera = world.camera.three;
              const currentDir = new THREE.Vector3();
              camera.getWorldDirection(currentDir);

              // Position camera at distance from center, opposite to view direction
              const cameraPos = center.clone().sub(currentDir.multiplyScalar(distance));

              world.camera.controls.setLookAt(
                cameraPos.x, cameraPos.y, cameraPos.z,
                center.x, center.y, center.z,
                true // Enable transition animation
              );
            }
          } catch (err) {
            console.error('Double-click selection error:', err);
          }
        };

        container.addEventListener('dblclick', handleDoubleClickSelect);

        // Setup double-click middle mouse button (scroll wheel) for fit-to-view
        const handleDoubleClick = (event: MouseEvent) => {
          // Middle mouse button = button 1
          if (event.button === 1) {
            event.preventDefault();
            fitAllModelsToView();
          }
        };

        // Use auxclick for middle mouse button double-click detection
        let lastMiddleClickTime = 0;
        const handleAuxClick = (event: MouseEvent) => {
          // Middle mouse button = button 1
          if (event.button === 1) {
            const now = Date.now();
            if (now - lastMiddleClickTime < 300) {
              // Double-click detected (within 300ms)
              event.preventDefault();
              fitAllModelsToView();
            }
            lastMiddleClickTime = now;
          }
        };

        container.addEventListener('dblclick', handleDoubleClick);
        container.addEventListener('auxclick', handleAuxClick);

        // Setup right-click handler for context menu (section planes)
        const handleContextMenu = async (event: MouseEvent) => {
          event.preventDefault();

          try {
            // Use Three.js raycasting directly for reliability
            const bounds = container.getBoundingClientRect();
            const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
            const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

            // Get camera from world
            const camera = world.camera?.three;
            if (!camera) return;

            // Create Three.js raycaster
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

            // Get all meshes from the scene
            const scene = world.scene?.three;
            if (!scene) return;

            // Find all intersectable objects (excluding grid/helpers)
            const intersectables: THREE.Object3D[] = [];
            scene.traverse((object) => {
              if (object instanceof THREE.Mesh && object.visible) {
                // Skip grid and helper objects
                const isHelper = object.name?.includes('grid') ||
                                 object.name?.includes('helper') ||
                                 object.parent?.name?.includes('grid');
                if (!isHelper) {
                  intersectables.push(object);
                }
              }
            });

            // Perform raycast
            const intersections = raycaster.intersectObjects(intersectables, false);

            if (intersections.length > 0) {
              const result = intersections[0];

              if (result.face) {
                // Compute normal from actual triangle vertices (more accurate than stored normals)
                const mesh = result.object as THREE.Mesh;
                const geometry = mesh.geometry;
                const face = result.face!;

                // Get vertex positions from geometry
                const positionAttr = geometry.getAttribute('position');
                const indexAttr = geometry.getIndex();

                let a: number, b: number, c: number;
                if (indexAttr) {
                  a = indexAttr.getX(face.a);
                  b = indexAttr.getX(face.b);
                  c = indexAttr.getX(face.c);
                } else {
                  a = face.a;
                  b = face.b;
                  c = face.c;
                }

                // Get vertices in local space
                const vA = new THREE.Vector3().fromBufferAttribute(positionAttr, a);
                const vB = new THREE.Vector3().fromBufferAttribute(positionAttr, b);
                const vC = new THREE.Vector3().fromBufferAttribute(positionAttr, c);

                // Transform to world space
                vA.applyMatrix4(mesh.matrixWorld);
                vB.applyMatrix4(mesh.matrixWorld);
                vC.applyMatrix4(mesh.matrixWorld);

                // Compute face normal from cross product
                const edge1 = new THREE.Vector3().subVectors(vB, vA);
                const edge2 = new THREE.Vector3().subVectors(vC, vA);
                let worldNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

                // Ensure normal points toward camera (visible face convention)
                const cameraPosition = camera.position.clone();
                const toCamera = cameraPosition.sub(result.point).normalize();
                const dotProduct = worldNormal.dot(toCamera);

                if (dotProduct < 0) {
                  // Normal points away from camera - flip it
                  worldNormal.negate();
                }

                // Store for visualization (surface normal points OUTWARD from surface toward camera)
                const originalWorldNormal = worldNormal.clone();

                // For Dalux-style behavior: clicking a wall should let us see THROUGH it
                // So we negate the normal to clip the near side and reveal what's behind
                worldNormal.negate();

                // Add visual indicator
                const sceneForHelper = world.scene?.three;
                if (sceneForHelper) {
                  // Remove old debug helpers
                  const oldHelper = sceneForHelper.getObjectByName('debug-normal-helper');
                  if (oldHelper) sceneForHelper.remove(oldHelper);

                  const debugGroup = new THREE.Group();
                  debugGroup.name = 'debug-normal-helper';

                  // Small sphere at hit point (white)
                  const sphereGeo = new THREE.SphereGeometry(0.15);
                  const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
                  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
                  sphere.position.copy(result.point);
                  sphere.renderOrder = 999;
                  debugGroup.add(sphere);

                  // Arrow showing surface normal (MAGENTA - distinct from axes)
                  const arrowNormal = new THREE.ArrowHelper(
                    originalWorldNormal,
                    result.point,
                    3,
                    0xff00ff,
                    0.4,
                    0.2
                  );
                  arrowNormal.renderOrder = 999;
                  debugGroup.add(arrowNormal);

                  // Add individual axis arrows
                  const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), result.point, 2, 0xff0000, 0.3, 0.15);
                  const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), result.point, 2, 0x00ff00, 0.3, 0.15);
                  const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), result.point, 2, 0x0000ff, 0.3, 0.15);
                  debugGroup.add(arrowX);
                  debugGroup.add(arrowY);
                  debugGroup.add(arrowZ);

                  sceneForHelper.add(debugGroup);
                }

                // Try to get IFC type if available
                let ifcType: string | undefined;
                // TODO: Get IFC type from the intersection if possible

                // Open context menu with intersection data
                contextMenu.openMenu(
                  { x: event.clientX, y: event.clientY },
                  {
                    point: result.point.clone(),
                    normal: worldNormal,
                    ifcType,
                  }
                );
              }
            }
          } catch (err) {
            console.error('Context menu raycast error:', err);
          }
        };

        container.addEventListener('contextmenu', handleContextMenu);

        // Setup Shift+Scroll for section plane manipulation (uses ref to avoid stale closure)
        const handleWheel = (event: WheelEvent) => {
          const sp = sectionPlanesRef.current;
          if (!sp) return;

          // Only intercept if Shift is held AND we have an active section plane
          if (!event.shiftKey) return;

          const activePlane = sp.planes.find(p => p.id === sp.activePlaneId);
          if (!activePlane) return;

          // Stop ALL event handling - prevents camera controls from also receiving this event
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          // Calculate step size based on camera distance to plane
          // Closer = finer control, farther = larger steps
          const camera = world.camera?.three;
          let stepSize = 0.5; // default
          if (camera && activePlane.point) {
            const cameraPos = camera.position;
            const planePos = activePlane.point;
            const distance = cameraPos.distanceTo(planePos);
            // Scale: 1% of distance, clamped between 0.01m and 2m
            stepSize = Math.max(0.01, Math.min(2, distance * 0.01));
          }

          // Shift = 50% reduction for fine control
          if (event.shiftKey) stepSize *= 0.5;

          // Move plane along its normal based on scroll direction
          const delta = event.deltaY > 0 ? -stepSize : stepSize;
          sp.movePlane(sp.activePlaneId!, delta);
        };

        // Use capture phase to intercept before ThatOpen's camera controls
        container.addEventListener('wheel', handleWheel, { passive: false, capture: true });

        // Setup keyboard shortcuts (uses ref to avoid stale closure)
        const handleKeyDown = (event: KeyboardEvent) => {
          const sp = sectionPlanesRef.current;
          if (!sp) return;

          // Only handle if viewer is focused (container or child has focus)
          if (!container.contains(document.activeElement) && document.activeElement !== document.body) {
            return;
          }

          // Rotation amount (degrees per keypress)
          const ROTATION_STEP = event.shiftKey ? 15 : 5; // Shift for coarse, normal for fine

          switch (event.key) {
            case 'Delete':
            case 'Backspace':
              // Delete active section plane
              if (sp.activePlaneId) {
                sp.deletePlane(sp.activePlaneId);
              }
              break;
            case 'Escape':
              // Deselect active plane
              sp.setActivePlane(null);
              break;
            case '1':
            case '2':
            case '3':
            case '4':
              // Quick-select planes 1-4
              const planeIndex = parseInt(event.key) - 1;
              if (sp.planes[planeIndex]) {
                sp.setActivePlane(sp.planes[planeIndex].id);
              }
              break;
            case 'ArrowLeft':
              // Rotate plane left (around Y axis)
              if (sp.activePlaneId) {
                event.preventDefault();
                sp.rotatePlane(sp.activePlaneId, 'horizontal', -ROTATION_STEP);
              }
              break;
            case 'ArrowRight':
              // Rotate plane right (around Y axis)
              if (sp.activePlaneId) {
                event.preventDefault();
                sp.rotatePlane(sp.activePlaneId, 'horizontal', ROTATION_STEP);
              }
              break;
            case 'ArrowUp':
              // Tilt plane up
              if (sp.activePlaneId) {
                event.preventDefault();
                sp.rotatePlane(sp.activePlaneId, 'vertical', ROTATION_STEP);
              }
              break;
            case 'ArrowDown':
              // Tilt plane down
              if (sp.activePlaneId) {
                event.preventDefault();
                sp.rotatePlane(sp.activePlaneId, 'vertical', -ROTATION_STEP);
              }
              break;
            case 'f':
            case 'F':
              // Flip plane direction
              if (sp.activePlaneId) {
                event.preventDefault();
                sp.flipPlane(sp.activePlaneId);
              }
              break;
            case 'q':
            case 'Q':
              // Rotate 90° horizontally (flip between N-S and E-W)
              if (sp.activePlaneId) {
                event.preventDefault();
                sp.rotatePlane(sp.activePlaneId, 'horizontal', 90);
              }
              break;
            case 'e':
            case 'E':
              // Push plane (move in normal direction - clip more, see deeper)
              if (sp.activePlaneId) {
                event.preventDefault();
                const activePlaneE = sp.planes.find(p => p.id === sp.activePlaneId);
                let pushAmount = 0.5;
                if (world.camera?.three && activePlaneE?.point) {
                  const dist = world.camera.three.position.distanceTo(activePlaneE.point);
                  pushAmount = Math.max(0.01, Math.min(2, dist * 0.01));
                }
                if (event.shiftKey) pushAmount *= 0.5; // Shift = 50% for fine control
                sp.movePlane(sp.activePlaneId, pushAmount);
              }
              break;
            case 'r':
            case 'R':
              // Pull plane (move opposite to normal - clip less, see more)
              if (sp.activePlaneId) {
                event.preventDefault();
                const activePlaneR = sp.planes.find(p => p.id === sp.activePlaneId);
                let pullAmount = 0.5;
                if (world.camera?.three && activePlaneR?.point) {
                  const dist = world.camera.three.position.distanceTo(activePlaneR.point);
                  pullAmount = Math.max(0.01, Math.min(2, dist * 0.01));
                }
                if (event.shiftKey) pullAmount *= 0.5; // Shift = 50% for fine control
                sp.movePlane(sp.activePlaneId, -pullAmount);
              }
              break;
          }
        };

        window.addEventListener('keydown', handleKeyDown);

        cleanupSelection = () => {
          container.removeEventListener('mousedown', handleMouseDown);
          container.removeEventListener('mouseup', handleMouseUp);
          container.removeEventListener('dblclick', handleDoubleClickSelect);
          container.removeEventListener('dblclick', handleDoubleClick);
          container.removeEventListener('auxclick', handleAuxClick);
          container.removeEventListener('contextmenu', handleContextMenu);
          container.removeEventListener('wheel', handleWheel, { capture: true });
          window.removeEventListener('keydown', handleKeyDown);
          highlighter.events.select.onHighlight.reset();
          highlighter.events.select.onClear.reset();
        };

        // Handle window resize
        const handleResize = () => {
          if (world.renderer) {
            world.renderer.resize();
          }
        };
        window.addEventListener('resize', handleResize);
        cleanupResize = () => window.removeEventListener('resize', handleResize);

        // Set viewer state for hooks that need components/world/Three.js objects
        // Use try-catch for scene/renderer access as ThatOpen getters can throw
        let threeScene = null;
        let threeRenderer = null;
        try {
          threeScene = world.scene?.three || null;
        } catch {
          console.warn('Scene not yet available');
        }
        try {
          threeRenderer = world.renderer?.three || null;
        } catch {
          console.warn('Renderer not yet available');
        }

        setViewerState({
          components,
          world,
          renderer: threeRenderer,
          scene: threeScene,
        });
        setIsInitialized(true);
      } catch (err) {
        console.error('Failed to initialize viewer:', err);
        const errorMsg = err instanceof Error ? err.message : 'Failed to initialize viewer';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    };

    initViewer();

    // Cleanup
    return () => {
      cleanupSelection?.();
      cleanupResize?.();

      // Dispose of components properly
      if (componentsRef.current) {
        try {
          componentsRef.current.dispose();
        } catch (err) {
          console.warn('Error disposing components:', err);
        }
        componentsRef.current = null;
      }

      // Clear references
      worldRef.current = null;
      loadedModelsRef.current = [];
      modelIdMapRef.current.clear();

      // Clear container
      if (containerRef.current) {
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
  }, []);

  // Load models when initialized
  useEffect(() => {
    if (!isInitialized || modelIds.length === 0 || !viewerState.components) return;

    // Guard: Only load once
    if (hasLoadedModelsRef.current) {
      return;
    }

    const loadModels = async () => {
      hasLoadedModelsRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const components = viewerState.components!;
        const fragments = components.get(OBC.FragmentsManager);
        const ifcLoader = components.get(OBC.IfcLoader);

        // Load all models in parallel
        const loadPromises = modelIds.map(async (modelId) => {
          setLoadingProgress(prev => ({ ...prev, [modelId]: true }));

          try {
            // Fetch model metadata
            const modelResponse = await fetch(`${API_BASE}/models/${modelId}/`);
            if (!modelResponse.ok) {
              throw new Error(`Model ${modelId} not found`);
            }
            const modelData = await modelResponse.json();

            // Try to load Fragments first (fast path)
            try {
              const fragmentsResponse = await fetch(`${API_BASE}/models/${modelId}/fragments/`);

              if (fragmentsResponse.ok) {
                const { fragments_url } = await fragmentsResponse.json();

                const response = await fetch(fragments_url);
                const data = await response.arrayBuffer();
                const buffer = new Uint8Array(data);

                // Load fragments (returns FragmentsGroup)
                const group = fragments.load(buffer);

                // Add to scene
                worldRef.current!.scene!.three.add(group);

                // Count total elements and map all fragments to backend model
                let totalElements = 0;
                for (const fragment of group.items) {
                  totalElements += fragment.capacity;

                  // Map each individual fragment UUID to backend model ID
                  // ThatOpen uses individual fragment UUIDs in selection events, not group UUID
                  modelIdMapRef.current.set(fragment.id, modelId);
                }

                // Also map the group UUID for compatibility
                modelIdMapRef.current.set(group.uuid, modelId);

                const loadedModel: LoadedModel = {
                  modelId,
                  fragmentModelId: group.uuid,
                  group,
                  elementCount: totalElements,
                  loadMethod: 'fragments',
                  name: modelData.name,
                  fileUrl: modelData.file_url,
                };

                // Pre-load IFC in FastAPI for property queries and type discovery
                if (modelData.file_url) {
                  const absoluteUrl = toAbsoluteUrl(modelData.file_url);
                  ifcService.openFromUrl(absoluteUrl)
                    .then(async (result) => {
                      loadedModel.ifcServiceFileId = result.file_id;

                      // Discover IFC types from the model
                      try {
                        const elementsResponse = await ifcService.getElements(result.file_id, { limit: 10000 });
                        const newTypeMap = new Map<string, { guids: string[]; count: number }>();

                        for (const elem of elementsResponse.elements) {
                          const existing = newTypeMap.get(elem.ifc_type) || { guids: [], count: 0 };
                          existing.guids.push(elem.guid);
                          existing.count++;
                          newTypeMap.set(elem.ifc_type, existing);
                        }

                        // Merge with existing types and update state
                        setTypeInfo(prev => {
                          const merged = new Map(prev);
                          for (const [type, data] of newTypeMap) {
                            const existing = merged.get(type) || { guids: [], count: 0 };
                            existing.guids.push(...data.guids);
                            existing.count += data.count;
                            merged.set(type, existing);
                          }
                          return merged;
                        });

                        // Initialize visibility for new types (all visible by default)
                        // Only in uncontrolled mode
                        setTypeVisibility?.(prev => {
                          const updated = { ...prev };
                          for (const type of newTypeMap.keys()) {
                            if (!(type in updated)) {
                              updated[type] = true;
                            }
                          }
                          return updated;
                        });
                      } catch {
                        // Type discovery failed, continue without it
                      }
                    })
                    .catch(() => {
                      // FastAPI not available, will fall back to Django
                    });
                }

                loadedModelsRef.current.push(loadedModel);
                setLoadingProgress(prev => ({ ...prev, [modelId]: false }));
                onModelLoaded?.(modelId, totalElements);

                return loadedModel;
              }
            } catch {
              // Fragments not available, fall back to IFC
            }

            // Fallback: Load IFC file
            if (!modelData.file_url) {
              throw new Error(`No IFC file available for model ${modelId}`);
            }

            const response = await fetch(modelData.file_url);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);

            // Load IFC (returns FragmentsGroup)
            const group = await ifcLoader.load(buffer, true, modelData.name);

            // Add to scene
            worldRef.current!.scene!.three.add(group);

            // Count total elements and map all fragments to backend model
            let totalElements = 0;
            for (const fragment of group.items) {
              totalElements += fragment.capacity;

              // Map each individual fragment UUID to backend model ID
              // ThatOpen uses individual fragment UUIDs in selection events, not group UUID
              modelIdMapRef.current.set(fragment.id, modelId);
            }

            // Also map the group UUID for compatibility
            modelIdMapRef.current.set(group.uuid, modelId);

            const loadedModel: LoadedModel = {
              modelId,
              fragmentModelId: group.uuid,
              group,
              elementCount: totalElements,
              loadMethod: 'ifc',
              name: modelData.name,
              fileUrl: modelData.file_url,
            };

            // Pre-load IFC in FastAPI for property queries and type discovery
            if (modelData.file_url) {
              const absoluteUrl = toAbsoluteUrl(modelData.file_url);
              ifcService.openFromUrl(absoluteUrl)
                .then(async (result) => {
                  loadedModel.ifcServiceFileId = result.file_id;

                  // Discover IFC types from the model
                  try {
                    const elementsResponse = await ifcService.getElements(result.file_id, { limit: 10000 });
                    const newTypeMap = new Map<string, { guids: string[]; count: number }>();

                    for (const elem of elementsResponse.elements) {
                      const existing = newTypeMap.get(elem.ifc_type) || { guids: [], count: 0 };
                      existing.guids.push(elem.guid);
                      existing.count++;
                      newTypeMap.set(elem.ifc_type, existing);
                    }

                    // Merge with existing types
                    setTypeInfo(prev => {
                      const merged = new Map(prev);
                      for (const [type, data] of newTypeMap) {
                        const existing = merged.get(type) || { guids: [], count: 0 };
                        existing.guids.push(...data.guids);
                        existing.count += data.count;
                        merged.set(type, existing);
                      }
                      return merged;
                    });

                    // Initialize visibility for new types (only in uncontrolled mode)
                    setTypeVisibility?.(prev => {
                      const updated = { ...prev };
                      for (const type of newTypeMap.keys()) {
                        if (!(type in updated)) {
                          updated[type] = true;
                        }
                      }
                      return updated;
                    });
                  } catch {
                    // Type discovery failed
                  }
                })
                .catch(() => {
                  // FastAPI not available, will fall back to Django
                });
            }

            loadedModelsRef.current.push(loadedModel);
            setLoadingProgress(prev => ({ ...prev, [modelId]: false }));
            onModelLoaded?.(modelId, totalElements);

            // Optionally trigger Fragment generation for next time
            fetch(`${API_BASE}/models/${modelId}/generate_fragments/`, {
              method: 'POST',
            }).catch(() => {
              // Silent fail - fragments are optional optimization
            });

            return loadedModel;
          } catch (err) {
            console.error(`Failed to load model ${modelId}:`, err);
            setLoadingProgress(prev => ({ ...prev, [modelId]: false }));
            const errorMsg = err instanceof Error ? err.message : `Failed to load model ${modelId}`;
            onError?.(errorMsg);
            return null;
          }
        });

        const results = await Promise.all(loadPromises);
        const successfulLoads = results.filter(r => r !== null);

        if (successfulLoads.length === 0) {
          throw new Error('Failed to load any models');
        }

        // Fit camera to show all models
        if (autoFitToView) {
          fitAllModelsToView();
        }

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load models:', err);
        const errorMsg = err instanceof Error ? err.message : 'Failed to load models';
        setError(errorMsg);
        onError?.(errorMsg);
        setIsLoading(false);
        hasLoadedModelsRef.current = false; // Allow retry on error
      }
    };

    loadModels();
  }, [isInitialized, modelIds.join(','), autoFitToView, fitAllModelsToView, onModelLoaded, onError, viewerState.components]);

  // Apply type visibility filtering using Hider
  useEffect(() => {
    if (!hiderRef.current || !viewerState.components || typeInfo.size === 0) return;

    const fragmentsManager = viewerState.components.get(OBC.FragmentsManager);
    if (!fragmentsManager) return;

    // Collect all GUIDs for visible types
    const visibleGuids: string[] = [];
    for (const [type, data] of typeInfo) {
      if (typeVisibility[type] !== false) {
        visibleGuids.push(...data.guids);
      }
    }

    try {
      if (visibleGuids.length === 0) {
        // Hide all elements
        hiderRef.current.set(false);
      } else {
        // Show only visible types
        const fragmentMap = fragmentsManager.guidToFragmentIdMap(visibleGuids);
        hiderRef.current.set(false); // Hide all first
        hiderRef.current.set(true, fragmentMap); // Show filtered
      }
    } catch {
      // Filtering failed, elements remain visible
    }
  }, [typeVisibility, typeInfo, viewerState.components]);

  // HUD handlers (only used in uncontrolled mode with showFilterHUD=true)
  const handleToggleType = useCallback((type: string) => {
    setTypeVisibility?.(prev => ({
      ...prev,
      [type]: !prev[type],
    }));
  }, [setTypeVisibility]);

  const handleShowAll = useCallback(() => {
    if (!setTypeVisibility) return;
    setTypeVisibility(() => {
      const updated: Record<string, boolean> = {};
      for (const type of typeInfo.keys()) {
        updated[type] = true;
      }
      return updated;
    });
  }, [typeInfo, setTypeVisibility]);

  const handleHideAll = useCallback(() => {
    if (!setTypeVisibility) return;
    setTypeVisibility(() => {
      const updated: Record<string, boolean> = {};
      for (const type of typeInfo.keys()) {
        updated[type] = false;
      }
      return updated;
    });
  }, [typeInfo, setTypeVisibility]);

  // Convert typeInfo Map to TypeInfo array for HUD
  const hudTypes: TypeInfo[] = Array.from(typeInfo.entries())
    .map(([type, data]) => ({
      type,
      count: data.count,
      visible: typeVisibility[type] !== false,
    }))
    .sort((a, b) => b.count - a.count); // Sort by count descending

  // Calculate total element count
  const totalElements = loadedModelsRef.current.reduce((sum, m) => sum + m.elementCount, 0);

  return (
    <div className="relative w-full h-full bg-gray-900">
      {/* 3D Viewer Container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Type Filter HUD (Center Bottom) - only in uncontrolled mode */}
      {showFilterHUD && hudTypes.length > 0 && (
        <ViewerFilterHUD
          types={hudTypes}
          onToggleType={handleToggleType}
          onShowAll={handleShowAll}
          onHideAll={handleHideAll}
        />
      )}

      {/* Model Info (Top Left) */}
      {showModelInfo && loadedModelsRef.current.length > 0 && (
        <Card className="absolute top-4 left-4 p-4 bg-gray-800/90 backdrop-blur-sm border-gray-700 text-white max-w-sm">
          <div className="flex items-center gap-2 mb-2">
            <Box className="h-4 w-4 text-green-400" />
            <span className="font-semibold">
              {loadedModelsRef.current.length === 1
                ? loadedModelsRef.current[0].name
                : `${loadedModelsRef.current.length} Models`}
            </span>
          </div>
          <div className="space-y-1 text-sm text-gray-300 mb-3">
            <div>
              Total Elements: <span className="font-medium text-white">{totalElements}</span>
            </div>

            {/* Show per-model info if multiple models */}
            {loadedModelsRef.current.length > 1 && (
              <div className="mt-2 space-y-1 text-xs">
                {loadedModelsRef.current.map((model) => (
                  <div key={model.modelId} className="flex items-center justify-between gap-2">
                    <span className="truncate">{model.name}</span>
                    <span className="text-gray-400">{model.elementCount}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1 mt-2">
              <Layers className="h-3 w-3" />
              <span className="text-xs">
                {loadedModelsRef.current.every(m => m.loadMethod === 'fragments')
                  ? '⚡ All Fragments'
                  : loadedModelsRef.current.every(m => m.loadMethod === 'ifc')
                  ? '📄 All IFC Parsed'
                  : '⚡/📄 Mixed'}
              </span>
            </div>
          </div>
          <Button
            onClick={fitAllModelsToView}
            size="sm"
            variant="outline"
            className="w-full text-xs"
          >
            🎯 Fit All to View
          </Button>
        </Card>
      )}

      {/* Properties Panel (Right) - Using organized BIM coordinator panel */}
      {showPropertiesPanel && (
        <div className="absolute right-4 top-4 w-80">
          <ElementPropertiesPanel
            element={selectedElement}
            onClose={() => {
              setSelectedElement(null);
              onSelectionChange?.(null);
            }}
          />
        </div>
      )}

      {/* Controls Info (Bottom Left) */}
      {showControls && loadedModelsRef.current.length > 0 && (
        <Card className="absolute bottom-4 left-4 p-3 bg-gray-800/90 backdrop-blur-sm border-gray-700 text-white text-xs">
          <div className="space-y-1 text-gray-300">
            <div className="font-medium text-gray-200 mb-1">Navigation</div>
            <div>Left drag: Rotate</div>
            <div>Right drag: Pan</div>
            <div>Scroll: Zoom</div>
            <div>Click: Select</div>
            <div>Dbl-click: Zoom to object</div>
            <div>Dbl-click 🖱️: Fit all</div>
            {sectionPlanes.planes.length > 0 && (
              <>
                <div className="font-medium text-gray-200 mt-2 mb-1">Section Plane</div>
                <div>E/R: Push/Pull</div>
                <div>Q: Rotate 90°</div>
                <div>←→↑↓: Fine rotate</div>
                <div>F: Flip direction</div>
              </>
            )}
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
                <p className="text-white font-semibold mb-1">
                  Loading {modelIds.length} model{modelIds.length > 1 ? 's' : ''}...
                </p>
                <p className="text-sm text-gray-400">This may take a minute...</p>

                {/* Show per-model loading status */}
                <div className="mt-3 text-xs text-gray-400 space-y-1">
                  {Object.entries(loadingProgress).map(([modelId, loading]) => (
                    <div key={modelId} className="flex items-center gap-2">
                      {loading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <div className="h-3 w-3 rounded-full bg-green-500" />
                      )}
                      <span>Model {modelId.slice(0, 8)}</span>
                    </div>
                  ))}
                </div>
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

      {/* Context Menu for Section Planes */}
      <ViewerContextMenu
        position={contextMenu.position}
        target={contextMenu.target}
        canAddPlane={sectionPlanes.canAddPlane}
        planeCount={sectionPlanes.planes.length}
        onAddSectionPlane={(point, normal, orientation) => {
          sectionPlanes.addPlane(point, normal, orientation);
        }}
        onHideType={(_type) => {
          // TODO: Implement type hiding via parent callback
        }}
        onIsolateType={(_type) => {
          // TODO: Implement type isolation via parent callback
        }}
        onShowAllTypes={() => {
          // TODO: Implement show all via parent callback
        }}
        onClose={contextMenu.closeMenu}
      />
    </div>
  );
});

// Export section planes state type for parent components
export type { SectionPlane } from '@/hooks/useSectionPlanes';
