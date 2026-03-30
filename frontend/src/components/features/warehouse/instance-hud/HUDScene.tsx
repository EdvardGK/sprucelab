import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MeshGeometry } from '@/lib/ifc-service-client';

export type RenderMode = 'solid' | 'wireframe';

interface HUDSceneProps {
  geometry: MeshGeometry | null;
  renderMode: RenderMode;
  isLoading: boolean;
  resetTrigger?: number;
  className?: string;
}

// Materials
const SOLID_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x7799bb,
  metalness: 0.15,
  roughness: 0.6,
  side: THREE.DoubleSide,
});

const WIREFRAME_SOLID = new THREE.MeshStandardMaterial({
  color: 0x334455,
  metalness: 0.1,
  roughness: 0.8,
  transparent: true,
  opacity: 0.15,
  side: THREE.DoubleSide,
});

const WIREFRAME_LINE = new THREE.LineBasicMaterial({
  color: 0x44ccff,
  linewidth: 1,
});

export default function HUDScene({ geometry, renderMode, isLoading, resetTrigger, className }: HUDSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const frameIdRef = useRef<number>(0);
  const lightRef = useRef<THREE.DirectionalLight | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a0f, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Grid
    const grid = new THREE.GridHelper(20, 40, 0x1a2a3a, 0x111820);
    grid.position.y = -0.01;
    scene.add(grid);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 500);
    camera.position.set(5, 4, 5);
    cameraRef.current = camera;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 8, 5);
    scene.add(directional);
    lightRef.current = directional;

    // Subtle rim light from behind
    const rim = new THREE.DirectionalLight(0x4488cc, 0.3);
    rim.position.set(-3, 2, -5);
    scene.add(rim);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.5;
    controls.maxDistance = 100;
    controlsRef.current = controls;

    // Mesh container
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // Render loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      controls.update();

      // Track light to camera
      if (lightRef.current && cameraRef.current) {
        lightRef.current.position.copy(cameraRef.current.position);
        lightRef.current.position.y += 3;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width: w, height: h } = entry.contentRect;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(frameIdRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Build mesh from geometry data
  useEffect(() => {
    const group = meshGroupRef.current;
    if (!group) return;

    // Clear previous meshes
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
      }
    }

    if (!geometry || !geometry.vertices.length) return;

    // Build BufferGeometry from API data
    const positions = new Float32Array(geometry.vertices.flat());
    const indices = new Uint32Array(geometry.faces.flat());

    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    bufferGeometry.computeVertexNormals();

    // Solid mesh
    const solidMesh = new THREE.Mesh(bufferGeometry, SOLID_MATERIAL.clone());
    solidMesh.name = 'solid';
    group.add(solidMesh);

    // Wireframe edges (always created, visibility toggled)
    const edgesGeometry = new THREE.EdgesGeometry(bufferGeometry, 15);
    const edgeLines = new THREE.LineSegments(edgesGeometry, WIREFRAME_LINE.clone());
    edgeLines.name = 'edges';
    group.add(edgeLines);

    // Transparent solid for wireframe mode
    const ghostMesh = new THREE.Mesh(bufferGeometry, WIREFRAME_SOLID.clone());
    ghostMesh.name = 'ghost';
    group.add(ghostMesh);

    // Center geometry and fit camera
    bufferGeometry.computeBoundingBox();
    const bbox = bufferGeometry.boundingBox!;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bbox.getCenter(center);
    bbox.getSize(size);

    // Center the group
    group.position.set(-center.x, -center.y, -center.z);

    // Position grid at bottom of object
    const grid = sceneRef.current?.children.find(c => c instanceof THREE.GridHelper);
    if (grid) {
      grid.position.y = -size.y / 2 - 0.01;
      // Scale grid to object
      const maxHorizontal = Math.max(size.x, size.z, 2);
      grid.scale.set(maxHorizontal / 10, 1, maxHorizontal / 10);
    }

    // Fit camera
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const distance = maxDim * 2.5;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      camera.position.set(distance * 0.7, distance * 0.5, distance * 0.7);
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [geometry]);

  // Toggle render mode
  useEffect(() => {
    const group = meshGroupRef.current;
    if (!group) return;

    const solid = group.getObjectByName('solid') as THREE.Mesh | undefined;
    const edges = group.getObjectByName('edges') as THREE.LineSegments | undefined;
    const ghost = group.getObjectByName('ghost') as THREE.Mesh | undefined;

    if (!solid || !edges || !ghost) return;

    if (renderMode === 'solid') {
      solid.visible = true;
      edges.visible = false;
      ghost.visible = false;
    } else {
      solid.visible = false;
      edges.visible = true;
      ghost.visible = true;
    }
  }, [renderMode, geometry]);

  // Reset camera when trigger changes
  useEffect(() => {
    if (resetTrigger === undefined) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const group = meshGroupRef.current;
    if (!camera || !controls || !group || group.children.length === 0) return;

    const bbox = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const distance = maxDim * 2.5;
    camera.position.set(distance * 0.7, distance * 0.5, distance * 0.7);
    controls.target.set(0, 0, 0);
    controls.update();
  }, [resetTrigger]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${className || ''}`}
      style={{ minHeight: 200 }}
    />
  );
}

export { type HUDSceneProps };

// Expose resetCamera via ref pattern
export type HUDSceneHandle = {
  resetCamera: () => void;
};
