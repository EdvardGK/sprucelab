import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MeshGeometry, ProfileData } from '@/lib/ifc-service-client';

export type ViewDimension = '2d' | '3d';
export type RenderMode = 'solid' | 'wireframe';

interface SectionSetup {
  clipPlane: THREE.Plane;
  cameraPosition: THREE.Vector3;
  cameraUp: THREE.Vector3;
  sectionWidth: number;
  sectionHeight: number;
  cameraFar: number;
}

interface HUDSceneProps {
  geometry: MeshGeometry | null;
  profileData?: ProfileData | null;
  viewDimension: ViewDimension;
  renderMode?: RenderMode;
  resetTrigger?: number;
  className?: string;
}

// 3D materials
const SOLID_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x7799bb,
  metalness: 0.15,
  roughness: 0.6,
  side: THREE.DoubleSide,
});

// 2D profile materials
const PROFILE_FILL = new THREE.MeshBasicMaterial({
  color: 0x1a2a3a,
  side: THREE.DoubleSide,
});

const PROFILE_LINE = new THREE.LineBasicMaterial({
  color: 0x44ccff,
  linewidth: 1,
});

// Clean 2D profile outline materials (from IfcProfileDef extraction)
const PROFILE_OUTLINE = new THREE.LineBasicMaterial({
  color: 0x44ccff,
  linewidth: 2,
});

const PROFILE_OUTLINE_FILL = new THREE.MeshBasicMaterial({
  color: 0x1a2a3a,
  side: THREE.DoubleSide,
});

const PROFILE_VOID_LINE = new THREE.LineBasicMaterial({
  color: 0x44ccff,
  linewidth: 1,
  opacity: 0.6,
  transparent: true,
});

/**
 * Build THREE.js objects from ProfileData outline points.
 * Returns a group with outline loops and optional fill.
 */
function buildProfileOutline(profile: ProfileData): THREE.Group {
  const group = new THREE.Group();
  group.name = 'profile-outline-group';

  // Helper: create a LineLoop from ProfilePoint[] in XY plane
  const createLoop = (
    points: { x: number; y: number }[],
    material: THREE.LineBasicMaterial,
    name: string
  ) => {
    if (points.length < 2) return;
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const loop = new THREE.LineLoop(geo, material.clone());
    loop.name = name;
    group.add(loop);
  };

  // Helper: create a filled shape from ProfilePoint[] using ShapeGeometry
  const createFill = (
    outerPts: { x: number; y: number }[],
    voids: { x: number; y: number }[][],
    name: string,
  ) => {
    if (outerPts.length < 3) return;
    const shape = new THREE.Shape(outerPts.map((p) => new THREE.Vector2(p.x, p.y)));
    for (const hole of voids) {
      if (hole.length >= 3) {
        shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
      }
    }
    const geo = new THREE.ShapeGeometry(shape);
    const mesh = new THREE.Mesh(geo, PROFILE_OUTLINE_FILL.clone());
    mesh.name = name;
    group.add(mesh);
  };

  // Fill (behind the outline)
  createFill(profile.outline, profile.inner_outlines || [], 'profile-clean-fill');

  // Outer outline
  createLoop(profile.outline, PROFILE_OUTLINE, 'profile-outer-loop');

  // Void outlines (for hollow sections)
  if (profile.inner_outlines) {
    profile.inner_outlines.forEach((voidPts, i) => {
      createLoop(voidPts, PROFILE_VOID_LINE, `profile-void-loop-${i}`);
    });
  }

  return group;
}

export default function HUDScene({
  geometry,
  profileData,
  viewDimension,
  renderMode = 'solid',
  resetTrigger,
  className,
}: HUDSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const perspCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const perspControlsRef = useRef<OrbitControls | null>(null);
  const orthoControlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const frameIdRef = useRef<number>(0);
  const lightRef = useRef<THREE.DirectionalLight | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const viewDimRef = useRef<ViewDimension>(viewDimension);
  const sectionRef = useRef<SectionSetup | null>(null);
  const profileGroupRef = useRef<THREE.Group | null>(null);
  const hasProfileRef = useRef<boolean>(false);

  // Keep ref in sync for animation loop
  viewDimRef.current = viewDimension;

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
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Grid (3D only)
    const grid = new THREE.GridHelper(20, 40, 0x1a2a3a, 0x111820);
    grid.position.y = -0.01;
    scene.add(grid);
    gridRef.current = grid;

    // Perspective camera (3D)
    const perspCamera = new THREE.PerspectiveCamera(45, width / height, 0.01, 500);
    perspCamera.position.set(5, 4, 5);
    perspCameraRef.current = perspCamera;

    // Orthographic camera (2D profile)
    const frustumSize = 10;
    const aspect = width / height;
    const orthoCamera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2, frustumSize * aspect / 2,
      frustumSize / 2, -frustumSize / 2,
      0.01, 500
    );
    orthoCamera.position.set(0, 0, 50);
    orthoCamera.lookAt(0, 0, 0);
    orthoCameraRef.current = orthoCamera;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 8, 5);
    scene.add(directional);
    lightRef.current = directional;

    const rim = new THREE.DirectionalLight(0x4488cc, 0.3);
    rim.position.set(-3, 2, -5);
    scene.add(rim);

    // Perspective controls (3D)
    const perspControls = new OrbitControls(perspCamera, renderer.domElement);
    perspControls.enableDamping = true;
    perspControls.dampingFactor = 0.08;
    perspControls.minDistance = 0.5;
    perspControls.maxDistance = 100;
    perspControlsRef.current = perspControls;

    // Ortho controls (2D) — pan and zoom only, no rotation
    const orthoControls = new OrbitControls(orthoCamera, renderer.domElement);
    orthoControls.enableRotate = false;
    orthoControls.enableDamping = true;
    orthoControls.dampingFactor = 0.08;
    orthoControls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    orthoControls.enabled = false;
    orthoControlsRef.current = orthoControls;

    // Mesh container
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // Render loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);

      const is3D = viewDimRef.current === '3d';
      const activeControls = is3D ? perspControls : orthoControls;
      const activeCamera = is3D ? perspCamera : orthoCamera;
      activeControls.update();

      // Track light to camera in 3D
      if (is3D && lightRef.current) {
        lightRef.current.position.copy(perspCamera.position);
        lightRef.current.position.y += 3;
      }

      renderer.render(scene, activeCamera);
    };
    animate();

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width: w, height: h } = entry.contentRect;
      if (w === 0 || h === 0) return;

      perspCamera.aspect = w / h;
      perspCamera.updateProjectionMatrix();

      const a = w / h;
      const fs = (orthoCamera.top - orthoCamera.bottom);
      orthoCamera.left = -fs * a / 2;
      orthoCamera.right = fs * a / 2;
      orthoCamera.updateProjectionMatrix();

      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(frameIdRef.current);
      perspControls.dispose();
      orthoControls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Apply section view: clip plane + ortho camera along longest axis
  function applySectionView() {
    const orthoCamera = orthoCameraRef.current;
    const orthoControls = orthoControlsRef.current;
    const renderer = rendererRef.current;
    const container = containerRef.current;
    const section = sectionRef.current;
    if (!orthoCamera || !orthoControls || !renderer || !container || !section) return;

    // Clip at midpoint perpendicular to longest axis
    renderer.clippingPlanes = [section.clipPlane];

    // Camera looks along longest axis, Z-up
    orthoCamera.position.copy(section.cameraPosition);
    orthoCamera.up.copy(section.cameraUp);
    orthoCamera.lookAt(0, 0, 0);

    // Dynamic near/far to handle mm-scale or m-scale geometry
    orthoCamera.near = 0.01;
    orthoCamera.far = section.cameraFar;

    // Fit frustum to the cross-section dimensions
    const aspect = container.clientWidth / container.clientHeight;
    const padding = 1.4;
    const sW = section.sectionWidth * padding;
    const sH = section.sectionHeight * padding;
    const sectionAspect = sW / sH;

    let frustumH: number;
    if (aspect >= sectionAspect) {
      frustumH = sH; // viewport wider than section — fit by height
    } else {
      frustumH = sW / aspect; // viewport narrower — fit by width
    }
    frustumH = Math.max(frustumH, 0.5);

    orthoCamera.top = frustumH / 2;
    orthoCamera.bottom = -frustumH / 2;
    orthoCamera.left = -(frustumH * aspect) / 2;
    orthoCamera.right = (frustumH * aspect) / 2;
    orthoCamera.updateProjectionMatrix();

    orthoControls.target.set(0, 0, 0);
    orthoControls.update();
  }

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

    // 3D solid mesh
    const solidMesh = new THREE.Mesh(bufferGeometry, SOLID_MATERIAL.clone());
    solidMesh.name = 'solid';
    group.add(solidMesh);

    // 2D profile: fill + edge lines
    const profileFill = new THREE.Mesh(bufferGeometry, PROFILE_FILL.clone());
    profileFill.name = 'profile-fill';
    group.add(profileFill);

    const edgesGeometry = new THREE.EdgesGeometry(bufferGeometry, 15);
    const profileEdges = new THREE.LineSegments(edgesGeometry, PROFILE_LINE.clone());
    profileEdges.name = 'profile-edges';
    group.add(profileEdges);

    // Center geometry
    bufferGeometry.computeBoundingBox();
    const bbox = bufferGeometry.boundingBox!;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bbox.getCenter(center);
    bbox.getSize(size);

    group.position.set(-center.x, -center.y, -center.z);

    const maxDim = Math.max(size.x, size.y, size.z, 1);

    // Position grid at bottom of object — scale to geometry
    if (gridRef.current) {
      const gridOffset = maxDim * 0.001;
      gridRef.current.position.y = -size.y / 2 - gridOffset;
      const gridScale = Math.max(size.x, size.z, maxDim) / 10;
      gridRef.current.scale.set(gridScale, 1, gridScale);
    }

    // Fit 3D camera — scale with geometry (handles mm or m units)
    const distance = maxDim * 2.5;
    const perspCamera = perspCameraRef.current;
    const perspControls = perspControlsRef.current;
    if (perspCamera && perspControls) {
      perspCamera.near = maxDim * 0.001;
      perspCamera.far = maxDim * 20;
      perspCamera.updateProjectionMatrix();
      perspCamera.position.set(distance * 0.7, distance * 0.5, distance * 0.7);
      perspControls.target.set(0, 0, 0);
      perspControls.maxDistance = maxDim * 10;
      perspControls.minDistance = maxDim * 0.1;
      perspControls.update();
    }

    // Compute section setup: find longest axis, set clip plane + camera
    const dims = [
      { axis: 'x' as const, len: size.x },
      { axis: 'y' as const, len: size.y },
      { axis: 'z' as const, len: size.z },
    ];
    dims.sort((a, b) => b.len - a.len);
    const longest = dims[0].axis;

    let clipNormal: THREE.Vector3;
    let camPos: THREE.Vector3;
    let camUp: THREE.Vector3;
    let secW: number, secH: number;
    // Camera must be outside the geometry — scale with bounding box
    const camDist = maxDim * 2;
    const camFar = maxDim * 5;

    if (longest === 'x') {
      // Wall/beam along X: cut perpendicular to X, camera looks along +X, Z-up
      clipNormal = new THREE.Vector3(1, 0, 0);
      camPos = new THREE.Vector3(camDist, 0, 0);
      camUp = new THREE.Vector3(0, 0, 1);
      secW = size.y;
      secH = size.z;
    } else if (longest === 'y') {
      // Object extends along Y: cut perpendicular to Y, camera looks along +Y, Z-up
      clipNormal = new THREE.Vector3(0, 1, 0);
      camPos = new THREE.Vector3(0, camDist, 0);
      camUp = new THREE.Vector3(0, 0, 1);
      secW = size.x;
      secH = size.z;
    } else {
      // Column along Z: cut perpendicular to Z, camera looks along +Z, Y-up
      clipNormal = new THREE.Vector3(0, 0, 1);
      camPos = new THREE.Vector3(0, 0, camDist);
      camUp = new THREE.Vector3(0, 1, 0);
      secW = size.x;
      secH = size.y;
    }

    console.log('[HUDScene] Section setup:', {
      longestAxis: longest,
      size: { x: size.x, y: size.y, z: size.z },
      camDist,
      sectionDims: { w: secW, h: secH },
    });

    sectionRef.current = {
      clipPlane: new THREE.Plane(clipNormal, 0),
      cameraPosition: camPos,
      cameraUp: camUp,
      sectionWidth: Math.max(secW, 0.1),
      sectionHeight: Math.max(secH, 0.1),
      cameraFar: camFar,
    };

    // If currently in 2D, apply section view
    if (viewDimRef.current === '2d') {
      applySectionView();
    }
  }, [geometry]);

  // Build clean 2D profile outline from ProfileData
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove previous profile group
    if (profileGroupRef.current) {
      scene.remove(profileGroupRef.current);
      profileGroupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineLoop) {
          (child as THREE.Mesh).geometry.dispose();
        }
      });
      profileGroupRef.current = null;
    }

    hasProfileRef.current = false;

    if (!profileData || profileData.outline.length < 2) return;

    const group = buildProfileOutline(profileData);

    // Compute bounds to center profile and set up camera
    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    // Center profile at origin
    group.position.set(-center.x, -center.y, 0);

    scene.add(group);
    profileGroupRef.current = group;
    hasProfileRef.current = true;

    console.log('[HUDScene] Profile outline built:', {
      type: profileData.profile_type,
      points: profileData.outline.length,
      voids: profileData.inner_outlines?.length || 0,
      size: { w: size.x.toFixed(1), h: size.y.toFixed(1) },
    });

    // If currently in 2D, apply profile camera view
    if (viewDimRef.current === '2d') {
      applyProfileView(size);
    }
  }, [profileData]);

  // Set up ortho camera for clean profile view (XY plane, Z-up camera)
  function applyProfileView(profileSize?: THREE.Vector3) {
    const orthoCamera = orthoCameraRef.current;
    const orthoControls = orthoControlsRef.current;
    const renderer = rendererRef.current;
    const container = containerRef.current;
    if (!orthoCamera || !orthoControls || !renderer || !container) return;

    // No clipping needed for clean profile lines
    renderer.clippingPlanes = [];

    // Determine profile bounds
    let w: number, h: number;
    if (profileSize) {
      w = profileSize.x;
      h = profileSize.y;
    } else if (profileGroupRef.current) {
      const box = new THREE.Box3().setFromObject(profileGroupRef.current);
      const s = new THREE.Vector3();
      box.getSize(s);
      w = s.x;
      h = s.y;
    } else {
      return;
    }

    const maxDim = Math.max(w, h, 1);

    // Camera looks along -Z at XY plane
    orthoCamera.position.set(0, 0, maxDim * 2);
    orthoCamera.up.set(0, 1, 0);
    orthoCamera.lookAt(0, 0, 0);
    orthoCamera.near = 0.01;
    orthoCamera.far = maxDim * 5;

    // Fit frustum to profile with padding
    const aspect = container.clientWidth / container.clientHeight;
    const padding = 1.4;
    const pW = w * padding;
    const pH = h * padding;
    const profAspect = pW / pH;

    let frustumH: number;
    if (aspect >= profAspect) {
      frustumH = pH;
    } else {
      frustumH = pW / aspect;
    }
    frustumH = Math.max(frustumH, 0.5);

    orthoCamera.top = frustumH / 2;
    orthoCamera.bottom = -frustumH / 2;
    orthoCamera.left = -(frustumH * aspect) / 2;
    orthoCamera.right = (frustumH * aspect) / 2;
    orthoCamera.updateProjectionMatrix();

    orthoControls.target.set(0, 0, 0);
    orthoControls.update();
  }

  // Switch between 2D/3D view mode
  useEffect(() => {
    const perspControls = perspControlsRef.current;
    const orthoControls = orthoControlsRef.current;
    const renderer = rendererRef.current;
    const group = meshGroupRef.current;
    if (!perspControls || !orthoControls || !renderer || !group) return;

    const is3D = viewDimension === '3d';
    const hasProfile = hasProfileRef.current;

    // Toggle controls
    perspControls.enabled = is3D;
    orthoControls.enabled = !is3D;

    // Grid: 3D only
    if (gridRef.current) {
      gridRef.current.visible = is3D;
    }

    // Toggle mesh visibility
    const solid = group.getObjectByName('solid');
    const profileFill = group.getObjectByName('profile-fill');
    const profileEdges = group.getObjectByName('profile-edges');

    if (is3D) {
      // 3D: show solid mesh, hide clipped mesh and profile outline
      if (solid) solid.visible = true;
      if (profileFill) profileFill.visible = false;
      if (profileEdges) profileEdges.visible = false;
      if (profileGroupRef.current) profileGroupRef.current.visible = false;
      renderer.clippingPlanes = [];
    } else if (hasProfile) {
      // 2D with clean profile: show profile outline, hide 3D mesh entirely
      if (solid) solid.visible = false;
      if (profileFill) profileFill.visible = false;
      if (profileEdges) profileEdges.visible = false;
      if (profileGroupRef.current) profileGroupRef.current.visible = true;
      renderer.clippingPlanes = [];
      applyProfileView();
    } else {
      // 2D fallback: clipped 3D mesh (no profile data)
      if (solid) solid.visible = false;
      if (profileFill) profileFill.visible = true;
      if (profileEdges) profileEdges.visible = true;
      if (profileGroupRef.current) profileGroupRef.current.visible = false;
      applySectionView();
    }
  }, [viewDimension, geometry, profileData]);

  // Handle render mode (solid vs wireframe)
  useEffect(() => {
    const group = meshGroupRef.current;
    if (!group) return;

    const solid = group.getObjectByName('solid') as THREE.Mesh | undefined;
    const profileFill = group.getObjectByName('profile-fill');

    if (viewDimension === '3d') {
      // 3D: toggle wireframe on solid material
      if (solid?.material instanceof THREE.MeshStandardMaterial) {
        solid.material.wireframe = renderMode === 'wireframe';
      }
    } else {
      // 2D: wireframe = edges only (hide fill), solid = fill + edges
      if (profileFill) {
        profileFill.visible = renderMode === 'solid';
      }
    }
  }, [renderMode, viewDimension, geometry]);

  // Reset camera when trigger changes
  useEffect(() => {
    if (resetTrigger === undefined) return;
    const group = meshGroupRef.current;
    if (!group || group.children.length === 0) return;

    if (viewDimension === '3d') {
      const camera = perspCameraRef.current;
      const controls = perspControlsRef.current;
      if (!camera || !controls) return;

      const bbox = new THREE.Box3().setFromObject(group);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      const distance = maxDim * 2.5;
      camera.position.set(distance * 0.7, distance * 0.5, distance * 0.7);
      controls.target.set(0, 0, 0);
      controls.update();
    } else {
      applySectionView();
    }
  }, [resetTrigger, viewDimension]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${className || ''}`}
      style={{ minHeight: 200 }}
    />
  );
}

export { type HUDSceneProps };
