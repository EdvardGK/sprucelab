import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Environment } from '@react-three/drei';

interface IFCViewerProps {
  modelId: string;
}

export function IFCViewer({ modelId }: IFCViewerProps) {
  return (
    <div className="w-full h-full bg-background-elevated">
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

        {/* Environment */}
        <Environment preset="city" />

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

        {/* Placeholder geometry - TODO: Load actual IFC geometry */}
        <mesh position={[0, 1, 0]} castShadow receiveShadow>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial color="#3b82f6" />
        </mesh>

        <mesh position={[3, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#10b981" />
        </mesh>

        <mesh position={[-3, 1.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>

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
        <div className="text-text-secondary">Model: <span className="text-text-primary font-medium">{modelId.slice(0, 8)}...</span></div>
        <div className="text-text-tertiary">Left click + drag: Rotate</div>
        <div className="text-text-tertiary">Right click + drag: Pan</div>
        <div className="text-text-tertiary">Scroll: Zoom</div>
      </div>

      {/* Loading indicator for future IFC loading */}
      {/* <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-md p-3">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <LoaderCircle className="h-3 w-3 animate-spin" />
          Loading geometry...
        </div>
      </div> */}
    </div>
  );
}
