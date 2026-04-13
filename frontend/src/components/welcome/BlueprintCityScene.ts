import * as THREE from 'three';

/**
 * Procedural "blueprint city" for the waitlist Welcome page.
 *
 * Autonomous scene (no user input, no pointer capture): grid of building
 * volumes rising from a faint ground grid in staggered waves, with occasional
 * blocks tinted in the Sprucelab discipline palette. Slow orbital camera
 * drift, distance fog to hide grid edges, paused when the page is hidden.
 */

// Sprucelab discipline palette (from docs/design-system.html)
const DISCIPLINE_COLORS = [
  0x8b95b8, // ARK Lavender
  0xc5c97f, // RIB Lime
  0x4ba27f, // RIV Forest
  0x3a4160, // RIE Navy
];

interface Building {
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  birthTime: number;
  cyclePeriod: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;

export function initBlueprintCity(container: HTMLElement): () => void {
  const scene = new THREE.Scene();
  scene.background = null; // let CSS parchment show through
  scene.fog = new THREE.Fog(0xfaf8f3, 55, 130);

  const width = container.clientWidth;
  const height = container.clientHeight;

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 400);
  camera.position.set(38, 28, 38);
  camera.lookAt(0, 5, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  // Lighting — flat, architectural, no drama
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
  keyLight.position.set(28, 42, 22);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xe8e1c9, 0.28);
  fillLight.position.set(-18, 22, -14);
  scene.add(fillLight);

  // Ground plane — warm parchment, barely visible
  const groundGeometry = new THREE.PlaneGeometry(240, 240);
  const groundMaterial = new THREE.MeshBasicMaterial({
    color: 0xf5f0dd,
    transparent: true,
    opacity: 0.55,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  // Technical grid overlay — the "blueprint" texture
  const grid = new THREE.GridHelper(140, 70, 0x21263a, 0xb8b19c);
  const gridMaterial = grid.material as THREE.Material | THREE.Material[];
  if (Array.isArray(gridMaterial)) {
    gridMaterial.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.22;
    });
  } else {
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.22;
  }
  scene.add(grid);

  // Buildings
  const buildingGroup = new THREE.Group();
  const buildings: Building[] = [];

  const axisCount = 7;
  const spacing = 6;
  const halfAxis = (axisCount - 1) / 2;

  for (let ix = 0; ix < axisCount; ix++) {
    for (let iz = 0; iz < axisCount; iz++) {
      // Skip ~30% of cells for breathing room
      if (Math.random() < 0.32) continue;

      const cx = (ix - halfAxis) * spacing + (Math.random() - 0.5) * 2.8;
      const cz = (iz - halfAxis) * spacing + (Math.random() - 0.5) * 2.8;

      // Footprint variety: towers vs lowrises
      const isTower = Math.random() < 0.3;
      const w = isTower ? 1.8 + Math.random() * 1.3 : 2.8 + Math.random() * 2.4;
      const d = isTower ? 1.8 + Math.random() * 1.3 : 2.8 + Math.random() * 2.4;
      const h = isTower ? 9 + Math.random() * 13 : 3 + Math.random() * 6;

      const geometry = new THREE.BoxGeometry(w, h, d);
      // Shift pivot to the base so scale.y grows upward
      geometry.translate(0, h / 2, 0);

      // 18% chance of picking a discipline accent color
      const isAccent = Math.random() < 0.18;
      const color = isAccent
        ? DISCIPLINE_COLORS[Math.floor(Math.random() * DISCIPLINE_COLORS.length)]
        : 0xf7f3e4;

      const material = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.04,
        roughness: 0.88,
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(cx, 0, cz);
      mesh.scale.y = 0.001;

      const edgeGeometry = new THREE.EdgesGeometry(geometry);
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x21263a,
        transparent: true,
        opacity: 0,
      });
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      mesh.add(edges);

      buildingGroup.add(mesh);

      // Stagger birth from center outward — creates a radial wave
      const distanceFromCenter = Math.sqrt(cx * cx + cz * cz);
      const cyclePeriod = 22_000 + Math.random() * 8_000;
      const birthOffset = distanceFromCenter * 140 + Math.random() * 600;

      buildings.push({ mesh, edges, birthTime: birthOffset, cyclePeriod });
    }
  }

  scene.add(buildingGroup);

  const clock = new THREE.Clock();
  let animationId = 0;
  let running = true;

  function animate() {
    if (!running) return;
    animationId = requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime() * 1000;

    for (const b of buildings) {
      // Wrap age into [0, cyclePeriod). Adding a large multiple keeps it positive
      // if (elapsed - birthTime) is still negative on the first frame.
      const age = (elapsed - b.birthTime + b.cyclePeriod * 100) % b.cyclePeriod;
      const rise = b.cyclePeriod * 0.18;
      const hold = b.cyclePeriod * 0.62;
      const fade = b.cyclePeriod - rise - hold;

      let progress: number;
      if (age < rise) {
        progress = easeOutQuint(age / rise);
      } else if (age < rise + hold) {
        progress = 1;
      } else {
        progress = 1 - easeInQuint((age - rise - hold) / fade);
      }

      b.mesh.scale.y = Math.max(0.001, progress);
      (b.mesh.material as THREE.MeshStandardMaterial).opacity = progress * 0.93;
      (b.edges.material as THREE.LineBasicMaterial).opacity = progress * 0.98;
    }

    // Slow orbital camera drift
    const t = elapsed / 1000;
    const radius = 52;
    camera.position.x = Math.sin(t * 0.038) * radius;
    camera.position.z = Math.cos(t * 0.038) * radius;
    camera.position.y = 26 + Math.sin(t * 0.022) * 4;
    camera.lookAt(0, 5, 0);

    renderer.render(scene, camera);
  }

  animate();

  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  const onVisibilityChange = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(animationId);
    } else if (!running) {
      running = true;
      clock.start();
      animate();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    running = false;
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);

    for (const b of buildings) {
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
      b.edges.geometry.dispose();
      (b.edges.material as THREE.Material).dispose();
    }
    groundGeometry.dispose();
    groundMaterial.dispose();
    (grid.geometry as THREE.BufferGeometry).dispose();
    if (Array.isArray(gridMaterial)) {
      gridMaterial.forEach((m) => m.dispose());
    } else {
      gridMaterial.dispose();
    }
    renderer.dispose();
    if (renderer.domElement.parentElement) {
      renderer.domElement.parentElement.removeChild(renderer.domElement);
    }
  };
}
