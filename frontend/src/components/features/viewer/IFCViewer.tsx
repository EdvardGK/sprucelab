/**
 * IFC Viewer Component
 *
 * Supports:
 * 1. Instant display with pre-parsed scene (from upload)
 * 2. Parse from IFC file URL (web-ifc)
 * 3. Fallback to backend geometry API (future)
 */

import { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import * as WebIFC from 'web-ifc';
import { useModel } from '@/hooks/use-models';
import { Loader2, AlertCircle } from 'lucide-react';

interface IFCViewerProps {
  // For instant display (pre-parsed from upload)
  preparsedScene?: THREE.Group;

  // For loading from backend or parsing IFC
  modelId?: string;

  // For federated viewing (multiple models)
  modelIds?: string[];
}

export function IFCViewer({ modelId, modelIds, preparsedScene }: IFCViewerProps) {
  const [scene, setScene] = useState<THREE.Group | null>(preparsedScene || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadSource, setLoadSource] = useState<'preparsed' | 'ifc-parse' | 'api' | null>(
    preparsedScene ? 'preparsed' : null
  );

  // For now, use first model if modelIds provided (federated viewing coming soon)
  const effectiveModelId = modelId || modelIds?.[0];

  // Get model data if modelId provided
  const { data: model } = useModel(effectiveModelId!);

  // Parse IFC file if needed
  useEffect(() => {
    // Skip if we already have a scene or no file URL
    if (scene || !model?.file_url) return;

    const parseIFC = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const fileUrl = model.file_url!; // Safe: guarded by useEffect condition
        console.log('Parsing IFC file from URL:', fileUrl);

        // Initialize web-ifc
        const ifcApi = new WebIFC.IfcAPI();
        ifcApi.SetWasmPath('/');
        await ifcApi.Init();

        // Fetch IFC file
        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        // Open model
        const modelID = ifcApi.OpenModel(data);

        // Extract ALL geometry - get all IFCPRODUCT elements (base type for all physical objects)
        const parsedScene = new THREE.Group();
        const allElements = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPRODUCT);

        console.log(`Found ${allElements.size()} total IFC elements`);

        for (let i = 0; i < allElements.size(); i++) {
          const expressID = allElements.get(i);
          try {
            const element = ifcApi.GetLine(modelID, expressID);
            const guid = element.GlobalId?.value || `Unknown-${expressID}`;
            const name = element.Name?.value;
            const typeName = element.constructor.name;

            // Try to get geometry
            const geometry = ifcApi.GetGeometry(modelID, expressID);
            if (geometry) {
              const verts = ifcApi.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
              const indices = ifcApi.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());

              const bufferGeometry = new THREE.BufferGeometry();
              bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
              bufferGeometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
              bufferGeometry.computeVertexNormals();

              const color = getColorForType(typeName);
              const material = new THREE.MeshStandardMaterial({
                color,
                side: THREE.DoubleSide,
                metalness: 0.1,
                roughness: 0.8,
              });

              const mesh = new THREE.Mesh(bufferGeometry, material);
              mesh.userData = { expressID, guid, type: typeName, name };
              parsedScene.add(mesh);
            }
          } catch (err) {
            // Skip elements without geometry (spatial structures, etc.)
            // console.warn(`Failed to extract element ${expressID}:`, err);
          }
        }

        // Center the model
        const box = new THREE.Box3().setFromObject(parsedScene);
        const center = box.getCenter(new THREE.Vector3());
        parsedScene.position.sub(center);

        setScene(parsedScene);
        setLoadSource('ifc-parse');
        setIsLoading(false);

        console.log(`✅ Parsed IFC file: ${parsedScene.children.length} elements`);
      } catch (err) {
        console.error('Failed to parse IFC:', err);
        setError(err instanceof Error ? err.message : 'Failed to parse IFC file');
        setIsLoading(false);
      }
    };

    parseIFC();
  }, [model?.file_url, scene]);

  function getColorForType(type: string): number {
    const colorMap: Record<string, number> = {
      'IFCWALL': 0xcccccc,
      'IFCWALLSTANDARDCASE': 0xcccccc,
      'IFCSLAB': 0x888888,
      'IFCDOOR': 0x8B4513,
      'IFCWINDOW': 0x87CEEB,
      'IFCCOLUMN': 0x999999,
      'IFCBEAM': 0x999999,
      'IFCROOF': 0x8B0000,
      'IFCSTAIR': 0xD2691E,
      'IFCRAILING': 0xC0C0C0,
      'IFCFURNISHINGELEMENT': 0xDEB887,
    };
    return colorMap[type] || 0xaaaaaa;
  }

  return (
    <div className="w-full h-full bg-background-elevated relative">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        {/* Camera */}
        <PerspectiveCamera makeDefault position={[10, 10, 10]} fov={50} />

        {/* Lights */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        {/* Grid */}
        <Grid
          args={[50, 50]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#6b7280"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#3b82f6"
          fadeDistance={100}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid
        />

        {/* IFC Model */}
        {scene && <primitive object={scene} />}

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[100, 100]} />
          <shadowMaterial opacity={0.2} />
        </mesh>

        {/* Controls */}
        <OrbitControls
          makeDefault
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>

      {/* Viewer HUD */}
      <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm border border-border rounded-md p-3 text-xs space-y-1">
        {loadSource && (
          <div className="text-text-secondary mb-2 pb-2 border-b border-border">
            {loadSource === 'preparsed' && <span className="text-green-600">⚡ Instant display</span>}
            {loadSource === 'ifc-parse' && <span className="text-blue-600">🔧 Parsed from IFC</span>}
            {loadSource === 'api' && <span className="text-purple-600">💾 From database</span>}
          </div>
        )}
        {modelIds && modelIds.length > 1 && (
          <div className="text-text-tertiary mb-2 pb-2 border-b border-border">
            🏗️ Federated: {modelIds.length} models (showing first)
          </div>
        )}
        <div className="text-text-secondary">
          Elements: <span className="text-text-primary font-medium">{scene?.children.length || 0}</span>
        </div>
        <div className="text-text-tertiary mt-2 pt-2 border-t border-border">Left drag: Rotate</div>
        <div className="text-text-tertiary">Right drag: Pan</div>
        <div className="text-text-tertiary">Scroll: Zoom</div>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-md p-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Loader2 className="h-3 w-3 animate-spin" />
            Parsing IFC file...
          </div>
        </div>
      )}

      {/* Error indicator */}
      {error && (
        <div className="absolute top-4 right-4 bg-destructive/10 border border-destructive rounded-md p-3">
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" />
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
