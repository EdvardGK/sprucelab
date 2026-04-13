import * as THREE from 'three';

/**
 * Procedural "blueprint city" for the waitlist Welcome page.
 *
 * A static line-drawn city on warm parchment: grid of building volumes with
 * street grid, scattered trees, a small water feature, and windows etched into
 * the facades. Most buildings are permanent; a small subset rises and fades on
 * long cycles so the scene feels alive without feeling busy. Slow orbital
 * camera drift, distance fog to hide edges, paused when the page is hidden.
 */

// Sprucelab discipline palette (from docs/design-system.html)
const DISCIPLINE_COLORS = [
  0x8b95b8, // ARK Lavender
  0xc5c97f, // RIB Lime
  0x4ba27f, // RIV Forest
  0x3a4160, // RIE Navy
];

const INK = 0x21263a;
const CREAM = 0xf7f3e4;
const TREE_GREEN = 0x4ba27f;
const WATER_BLUE = 0xa8b9c9;
const PARK_GRASS = 0xc6d6a8;
const PARK_GRASS_DARK = 0xa4b887;
const STONE_WHITE = 0xece7d8;
const WOOD_DARK = 0x4a3827;

interface Building {
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  isDynamic: boolean;
  birthTime: number;
  cyclePeriod: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;

/**
 * Build a reusable canvas texture that reads as "windows" when mapped onto a
 * building facade. We render a grid of small ink-dark rectangles on a cream
 * background; the facade material multiplies its color with this, so accent
 * buildings still tint correctly.
 */
function makeWindowTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = '#f7f3e4';
  ctx.fillRect(0, 0, size, size);

  // Window grid: 8 columns, 10 rows
  const cols = 8;
  const rows = 10;
  const marginX = 14;
  const marginY = 10;
  const cellW = (size - marginX * 2) / cols;
  const cellH = (size - marginY * 2) / rows;
  const winW = cellW * 0.55;
  const winH = cellH * 0.62;

  ctx.fillStyle = '#21263a';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Slight randomness: a few windows are "lit" (lighter) or missing
      const x = marginX + c * cellW + (cellW - winW) / 2;
      const y = marginY + r * cellH + (cellH - winH) / 2;
      const roll = Math.random();
      if (roll < 0.08) continue; // missing window
      ctx.fillStyle = roll < 0.18 ? '#c5c97f' : '#21263a'; // occasional lit window
      ctx.fillRect(x, y, winW, winH);
    }
  }

  // Faint horizontal banding (floor lines) for extra texture
  ctx.strokeStyle = 'rgba(33, 38, 58, 0.18)';
  ctx.lineWidth = 0.8;
  for (let r = 1; r < rows; r++) {
    const y = marginY + r * cellH;
    ctx.beginPath();
    ctx.moveTo(marginX - 2, y);
    ctx.lineTo(size - marginX + 2, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function initBlueprintCity(container: HTMLElement): () => void {
  const scene = new THREE.Scene();
  scene.background = null; // let CSS parchment show through
  scene.fog = new THREE.Fog(0xfaf8f3, 58, 140);

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
  scene.add(new THREE.AmbientLight(0xffffff, 0.62));

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

  const axisCount = 7;
  const spacing = 6;
  const halfAxis = (axisCount - 1) / 2;
  const blockExtent = halfAxis * spacing + spacing * 0.5;

  // Street grid — thin ink strips running along the block boundaries.
  // Rendered as slightly raised planes so they sit on top of the ground tint.
  const streetGroup = new THREE.Group();
  const streetMaterialMinor = new THREE.MeshBasicMaterial({
    color: INK,
    transparent: true,
    opacity: 0.16,
  });
  const streetMaterialMajor = new THREE.MeshBasicMaterial({
    color: INK,
    transparent: true,
    opacity: 0.22,
  });

  // Minor streets between every row/column of cells
  for (let i = 0; i <= axisCount; i++) {
    const pos = (i - axisCount / 2) * spacing;
    const isMajor = i === 0 || i === Math.floor(axisCount / 2) + 1 || i === axisCount;
    const mat = isMajor ? streetMaterialMajor : streetMaterialMinor;
    const widthHere = isMajor ? 1.3 : 0.7;

    // Horizontal (running along X)
    const hGeom = new THREE.PlaneGeometry(blockExtent * 2, widthHere);
    const h = new THREE.Mesh(hGeom, mat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.005, pos);
    streetGroup.add(h);

    // Vertical (running along Z)
    const vGeom = new THREE.PlaneGeometry(widthHere, blockExtent * 2);
    const v = new THREE.Mesh(vGeom, mat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(pos, 0.005, 0);
    streetGroup.add(v);
  }
  scene.add(streetGroup);

  // Park with a pond — a big green rectangle replaces two blocks in one
  // quadrant. Inside: a darker grass ring around a small blue pond, crossed
  // by a central path. The stave church landmark sits just inside this park.
  const parkGroup = new THREE.Group();
  const parkCenter = new THREE.Vector3(-spacing * 1.9, 0, -spacing * 1.9);
  const parkW = spacing * 2.6;
  const parkD = spacing * 2.6;

  const parkGeometry = new THREE.PlaneGeometry(parkW, parkD);
  const parkMaterial = new THREE.MeshBasicMaterial({
    color: PARK_GRASS,
    transparent: true,
    opacity: 0.85,
  });
  const park = new THREE.Mesh(parkGeometry, parkMaterial);
  park.rotation.x = -Math.PI / 2;
  park.position.copy(parkCenter);
  park.position.y = 0.004;
  parkGroup.add(park);

  // Darker grass ring (a slightly smaller plane in a darker tone)
  const parkInnerGeom = new THREE.PlaneGeometry(parkW * 0.72, parkD * 0.72);
  const parkInnerMaterial = new THREE.MeshBasicMaterial({
    color: PARK_GRASS_DARK,
    transparent: true,
    opacity: 0.65,
  });
  const parkInner = new THREE.Mesh(parkInnerGeom, parkInnerMaterial);
  parkInner.rotation.x = -Math.PI / 2;
  parkInner.position.copy(parkCenter);
  parkInner.position.y = 0.006;
  parkGroup.add(parkInner);

  // Park outline — ink edge
  const parkEdgeGeom = new THREE.EdgesGeometry(parkGeometry);
  const parkEdges = new THREE.LineSegments(
    parkEdgeGeom,
    new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.55 })
  );
  parkEdges.rotation.x = -Math.PI / 2;
  parkEdges.position.copy(parkCenter);
  parkEdges.position.y = 0.007;
  parkGroup.add(parkEdges);

  // Central pond — small, in the NE corner of the park so the stave church
  // can sit in the SW corner without overlapping it.
  const pondOffset = new THREE.Vector3(parkW * 0.18, 0, -parkD * 0.18);
  const pondW = parkW * 0.34;
  const pondD = parkD * 0.34;
  const pondGeometry = new THREE.PlaneGeometry(pondW, pondD);
  const pondMaterial = new THREE.MeshBasicMaterial({
    color: WATER_BLUE,
    transparent: true,
    opacity: 0.75,
  });
  const pond = new THREE.Mesh(pondGeometry, pondMaterial);
  pond.rotation.x = -Math.PI / 2;
  pond.position.copy(parkCenter).add(pondOffset);
  pond.position.y = 0.008;
  parkGroup.add(pond);

  const pondEdgeGeom = new THREE.EdgesGeometry(pondGeometry);
  const pondEdges = new THREE.LineSegments(
    pondEdgeGeom,
    new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.75 })
  );
  pondEdges.rotation.x = -Math.PI / 2;
  pondEdges.position.copy(pond.position);
  pondEdges.position.y = 0.009;
  parkGroup.add(pondEdges);

  scene.add(parkGroup);

  // Windows texture — reused across every building material
  const windowTexture = makeWindowTexture();

  // Buildings
  const buildingGroup = new THREE.Group();
  const buildings: Building[] = [];
  const occupied: Array<{ x: number; z: number; w: number; d: number }> = [];

  // Reserve the park footprint so we don't drop a building on top of it
  occupied.push({
    x: parkCenter.x,
    z: parkCenter.z,
    w: parkW + 1.5,
    d: parkD + 1.5,
  });

  for (let ix = 0; ix < axisCount; ix++) {
    for (let iz = 0; iz < axisCount; iz++) {
      // Skip ~32% of cells for breathing room
      if (Math.random() < 0.32) continue;

      const cx = (ix - halfAxis) * spacing + (Math.random() - 0.5) * 2.4;
      const cz = (iz - halfAxis) * spacing + (Math.random() - 0.5) * 2.4;

      // Skip cells that fall within the park footprint
      if (
        Math.abs(cx - parkCenter.x) < parkW * 0.55 &&
        Math.abs(cz - parkCenter.z) < parkD * 0.55
      ) {
        continue;
      }

      // Footprint variety: towers vs lowrises
      const isTower = Math.random() < 0.3;
      const w = isTower ? 1.8 + Math.random() * 1.3 : 2.8 + Math.random() * 2.4;
      const d = isTower ? 1.8 + Math.random() * 1.3 : 2.8 + Math.random() * 2.4;
      const h = isTower ? 9 + Math.random() * 13 : 3 + Math.random() * 6;

      const geometry = new THREE.BoxGeometry(w, h, d);
      geometry.translate(0, h / 2, 0);

      // UV scaling so the window texture reads at a sensible density per facade.
      // We repeat based on the facade dimensions so short buildings get fewer
      // window rows and tall towers get more.
      const uvs = geometry.attributes.uv as THREE.BufferAttribute;
      const pos = geometry.attributes.position as THREE.BufferAttribute;
      const tmpUv = uvs.clone();
      for (let i = 0; i < pos.count; i++) {
        // Three's BoxGeometry orders faces +X, -X, +Y, -Y, +Z, -Z, each 4 verts
        const faceIdx = Math.floor(i / 4);
        const u = tmpUv.getX(i);
        const v = tmpUv.getY(i);
        let repeatU = 1;
        let repeatV = 1;
        if (faceIdx === 0 || faceIdx === 1) {
          // +X / -X → facade width = d, height = h
          repeatU = Math.max(1, Math.round(d / 3));
          repeatV = Math.max(1, Math.round(h / 2.2));
        } else if (faceIdx === 4 || faceIdx === 5) {
          // +Z / -Z → facade width = w, height = h
          repeatU = Math.max(1, Math.round(w / 3));
          repeatV = Math.max(1, Math.round(h / 2.2));
        } else {
          // top/bottom — suppress windows on roof/underside
          repeatU = 0.01;
          repeatV = 0.01;
        }
        uvs.setXY(i, u * repeatU, v * repeatV);
      }
      uvs.needsUpdate = true;

      // 18% chance of a discipline accent color
      const isAccent = Math.random() < 0.18;
      const color = isAccent
        ? DISCIPLINE_COLORS[Math.floor(Math.random() * DISCIPLINE_COLORS.length)]
        : CREAM;

      // Per-building texture clone so each building can pick a random offset
      // (breaks alignment between neighbors, makes each facade unique)
      const buildingTex = windowTexture.clone();
      buildingTex.needsUpdate = true;
      buildingTex.offset.set(Math.random(), Math.random());

      const material = new THREE.MeshStandardMaterial({
        color,
        map: buildingTex,
        metalness: 0.04,
        roughness: 0.88,
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(cx, 0, cz);

      const edgeGeometry = new THREE.EdgesGeometry(geometry);
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: INK,
        transparent: true,
        opacity: 0,
      });
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      mesh.add(edges);

      buildingGroup.add(mesh);

      // ~22% of buildings are "dynamic" — they cycle. The rest stand still.
      const isDynamic = Math.random() < 0.22;

      if (!isDynamic) {
        mesh.scale.y = 1;
        material.opacity = 0.93;
        edgeMaterial.opacity = 0.98;
      } else {
        mesh.scale.y = 0.001;
      }

      occupied.push({ x: cx, z: cz, w: w + 1.5, d: d + 1.5 });

      // Dynamic buildings: very long cycle, widely spread births so only one
      // or two are ever visibly transitioning at a time.
      const cyclePeriod = 48_000 + Math.random() * 18_000;
      const birthOffset = Math.random() * cyclePeriod * 3;

      buildings.push({
        mesh,
        edges,
        isDynamic,
        birthTime: birthOffset,
        cyclePeriod,
      });
    }
  }

  scene.add(buildingGroup);

  // Spruce trees — stacked low-poly cones (4 sides → crisp diamond silhouette).
  // We are Sprucelab, so the trees are on-brand. Dark forest green, tall and
  // narrow, scattered in empty spots. Occupied list keeps them off buildings
  // and water.
  const treeGroup = new THREE.Group();
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b5a3c,
    metalness: 0.0,
    roughness: 0.98,
  });
  const spruceMaterialDark = new THREE.MeshStandardMaterial({
    color: 0x2f6b49, // deeper spruce green
    metalness: 0.0,
    roughness: 0.9,
  });
  const spruceMaterialMid = new THREE.MeshStandardMaterial({
    color: TREE_GREEN, // Sprucelab Forest palette
    metalness: 0.0,
    roughness: 0.9,
  });
  const spruceEdgeMaterial = new THREE.LineBasicMaterial({
    color: INK,
    transparent: true,
    opacity: 0.6,
  });

  const treeCount = 30;
  let placed = 0;
  let attempts = 0;
  while (placed < treeCount && attempts < 500) {
    attempts++;
    const tx = (Math.random() - 0.5) * blockExtent * 1.95;
    const tz = (Math.random() - 0.5) * blockExtent * 1.95;

    const collides = occupied.some(
      (o) => Math.abs(tx - o.x) < o.w / 2 + 0.5 && Math.abs(tz - o.z) < o.d / 2 + 0.5
    );
    if (collides) continue;

    // Spruce proportions: tall and narrow, 3 stacked cone tiers
    const scale = 0.85 + Math.random() * 0.7;
    const trunkH = 0.35 * scale;
    const trunkR = 0.12 * scale;

    // 4-sided cones = diamond silhouette from any angle → true low-poly
    const tierSides = 4;

    // Tier 1 (bottom, widest)
    const r1 = 0.8 * scale;
    const h1 = 1.1 * scale;
    // Tier 2 (middle)
    const r2 = 0.62 * scale;
    const h2 = 1.0 * scale;
    // Tier 3 (top, narrowest)
    const r3 = 0.42 * scale;
    const h3 = 0.9 * scale;

    const trunkGeom = new THREE.CylinderGeometry(trunkR, trunkR * 1.15, trunkH, 5);
    const trunk = new THREE.Mesh(trunkGeom, trunkMaterial);
    trunk.position.set(tx, trunkH / 2, tz);
    treeGroup.add(trunk);

    // Alternate between slightly different greens so the grove isn't uniform
    const canopyMat = Math.random() < 0.5 ? spruceMaterialDark : spruceMaterialMid;

    // Tier 1
    const g1 = new THREE.ConeGeometry(r1, h1, tierSides);
    const m1 = new THREE.Mesh(g1, canopyMat);
    m1.position.set(tx, trunkH + h1 / 2, tz);
    m1.rotation.y = Math.random() * Math.PI;
    treeGroup.add(m1);
    treeGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(g1), spruceEdgeMaterial).translateX(tx).translateY(trunkH + h1 / 2).translateZ(tz));

    // Tier 2 — starts 60% up tier 1
    const y2Base = trunkH + h1 * 0.6;
    const g2 = new THREE.ConeGeometry(r2, h2, tierSides);
    const m2 = new THREE.Mesh(g2, canopyMat);
    m2.position.set(tx, y2Base + h2 / 2, tz);
    m2.rotation.y = Math.random() * Math.PI;
    treeGroup.add(m2);
    treeGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(g2), spruceEdgeMaterial).translateX(tx).translateY(y2Base + h2 / 2).translateZ(tz));

    // Tier 3 — starts 60% up tier 2
    const y3Base = y2Base + h2 * 0.6;
    const g3 = new THREE.ConeGeometry(r3, h3, tierSides);
    const m3 = new THREE.Mesh(g3, canopyMat);
    m3.position.set(tx, y3Base + h3 / 2, tz);
    m3.rotation.y = Math.random() * Math.PI;
    treeGroup.add(m3);
    treeGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(g3), spruceEdgeMaterial).translateX(tx).translateY(y3Base + h3 / 2).translateZ(tz));

    // Small footprint reservation so trees don't overlap each other
    occupied.push({ x: tx, z: tz, w: r1 * 2.2, d: r1 * 2.2 });

    placed++;
  }
  scene.add(treeGroup);

  const clock = new THREE.Clock();
  let animationId = 0;
  let running = true;

  function animate() {
    if (!running) return;
    animationId = requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime() * 1000;

    for (const b of buildings) {
      if (!b.isDynamic) continue;

      const age = (elapsed - b.birthTime + b.cyclePeriod * 100) % b.cyclePeriod;
      const rise = b.cyclePeriod * 0.3;
      const hold = b.cyclePeriod * 0.4;
      const fade = b.cyclePeriod - rise - hold;

      let progress: number;
      if (age < rise) {
        progress = easeOutCubic(age / rise);
      } else if (age < rise + hold) {
        progress = 1;
      } else {
        progress = 1 - easeInCubic((age - rise - hold) / fade);
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
      const mat = b.mesh.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
      b.edges.geometry.dispose();
      (b.edges.material as THREE.Material).dispose();
    }

    streetGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
    streetMaterialMinor.dispose();
    streetMaterialMajor.dispose();

    parkGeometry.dispose();
    parkMaterial.dispose();
    parkInnerGeom.dispose();
    parkInnerMaterial.dispose();
    parkEdgeGeom.dispose();
    (parkEdges.material as THREE.Material).dispose();
    pondGeometry.dispose();
    pondMaterial.dispose();
    pondEdgeGeom.dispose();
    (pondEdges.material as THREE.Material).dispose();

    treeGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
      }
    });
    trunkMaterial.dispose();
    spruceMaterialDark.dispose();
    spruceMaterialMid.dispose();
    spruceEdgeMaterial.dispose();

    windowTexture.dispose();
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
