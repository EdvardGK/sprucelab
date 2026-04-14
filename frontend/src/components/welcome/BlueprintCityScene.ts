import * as THREE from 'three';

/**
 * Procedural low-poly city for the Welcome page.
 *
 * Two variants selected by the `variant` parameter:
 *  - "day":   warm parchment background, cream opaque buildings, blue pond,
 *             spruce forest, Oslo-inspired zoned layout.
 *  - "night": dark navy sky, glowing cyan street-veins, lit windows via
 *             emissiveMap, occasional lightning storm.
 *
 * Both variants share the same geometry and layout — only palette, lighting,
 * and emissive details change. Slow orbital camera, distance fog, paused when
 * the page is hidden.
 */

export type BlueprintCityVariant = 'day' | 'night';

// ---------------------------------------------------------------------------
// Palette + discipline colors
// ---------------------------------------------------------------------------

const DISCIPLINE_COLORS = [
  0x8b95b8, // ARK Lavender
  0xc5c97f, // RIB Lime
  0x4ba27f, // RIV Forest
  0x3a4160, // RIE Navy
];

interface Palette {
  bg: THREE.Color | null;
  ground: number;
  buildingCream: number;
  buildingNavy: number;
  stone: number;
  edge: number;
  edgeOpacity: number;
  wood: number;
  roof: number;
  grass: number;
  grassDark: number;
  water: number;
  street: number;
  streetOpacity: number;
  streetBlending: THREE.Blending;
  median: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  ambient: number;
  ambientIntensity: number;
  key: number;
  keyIntensity: number;
  fill: number;
  fillIntensity: number;
  // Optional emissive layer for night windows + night landmarks
  windowEmissive: boolean;
  emissiveAmber: number;
  emissiveCream: number;
  emissiveBlue: number;
  // Construction scaffolding highlight (lime by day, bright lime + emissive by night)
  scaffold: number;
  scaffoldEmissive: number;
}

const DAY_PALETTE: Palette = {
  bg: null, // let CSS parchment show through
  ground: 0xf5f0dd,
  buildingCream: 0xf1ead5,
  buildingNavy: 0x3a4160,
  stone: 0xe0d9c1,
  edge: 0x21263a,
  edgeOpacity: 0.95,
  wood: 0x4a3827,
  roof: 0x2a1e12,
  grass: 0xc6d6a8,
  grassDark: 0xa4b887,
  water: 0xa8b9c9,
  street: 0x21263a,
  streetOpacity: 0.28,
  streetBlending: THREE.NormalBlending,
  median: 0xc6d6a8,
  fog: 0xfaf8f3,
  fogNear: 62,
  fogFar: 150,
  ambient: 0xffffff,
  ambientIntensity: 0.62,
  key: 0xffffff,
  keyIntensity: 0.7,
  fill: 0xe8e1c9,
  fillIntensity: 0.28,
  windowEmissive: false,
  emissiveAmber: 0x000000,
  emissiveCream: 0x000000,
  emissiveBlue: 0x000000,
  scaffold: 0xc5c97f,
  scaffoldEmissive: 0x000000,
};

const NIGHT_PALETTE: Palette = {
  bg: new THREE.Color(0x0a0e1a),
  ground: 0x14192b,
  buildingCream: 0x1a1f33,
  buildingNavy: 0x0f1322,
  stone: 0x262d45,
  edge: 0x5a6280,
  edgeOpacity: 0.8,
  wood: 0x1a1208,
  roof: 0x080502,
  grass: 0x1a2a1c,
  grassDark: 0x111f14,
  water: 0x1a3348,
  street: 0x6fb8d9,
  streetOpacity: 0.9,
  streetBlending: THREE.AdditiveBlending,
  median: 0x1a2a1c,
  fog: 0x0a0e1a,
  fogNear: 48,
  fogFar: 120,
  ambient: 0x6a7090,
  ambientIntensity: 0.22,
  key: 0xaab4d6,
  keyIntensity: 0.28,
  fill: 0x2a3156,
  fillIntensity: 0.18,
  windowEmissive: true,
  emissiveAmber: 0xffc56b,
  emissiveCream: 0xf7f3e4,
  emissiveBlue: 0x6fb8d9,
  scaffold: 0xc5c97f,
  scaffoldEmissive: 0xc5c97f,
};

// ---------------------------------------------------------------------------
// Ease helpers
// ---------------------------------------------------------------------------

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smoothstep = (a: number, b: number, t: number) => {
  if (b === a) return t < a ? 0 : 1;
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};

// ---------------------------------------------------------------------------
// Deterministic PRNG — gives each building a stable "seed" for its lit-window
// pattern so neighbors look different but the same building doesn't flicker
// between frames.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Window texture factories
// ---------------------------------------------------------------------------

/**
 * Returns a pure repeating window grid. No base/cornice/central-bay baked in
 * (those live in geometry now, not texture). Tiles cleanly in both axes so
 * tall buildings show more floors.
 */
function makeWindowColorTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Facade tone (will be multiplied by the material color)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // 4 cols × 5 rows symmetric grid
  const cols = 4;
  const rows = 5;
  const cellW = size / cols;
  const cellH = size / rows;
  const winW = cellW * 0.48;
  const winH = cellH * 0.62;

  ctx.fillStyle = '#21263a';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * cellW + cellW / 2;
      const cy = r * cellH + cellH / 2;
      ctx.fillRect(cx - winW / 2, cy - winH / 2, winW, winH);
    }
  }

  // Faint pilaster stripes between every other column
  ctx.fillStyle = 'rgba(33, 38, 58, 0.12)';
  for (let c = 1; c < cols; c += 2) {
    const x = c * cellW - 1;
    ctx.fillRect(x, 0, 2, size);
  }

  // Floor lines every 2 rows
  ctx.strokeStyle = 'rgba(33, 38, 58, 0.16)';
  ctx.lineWidth = 1;
  for (let r = 2; r < rows; r += 2) {
    const y = r * cellH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/**
 * Night-only emissive companion texture — same grid positions as the color
 * texture, but only the "lit" windows are bright. Building picks its own
 * random pattern via a seeded PRNG so each building is distinct.
 */
function makeWindowEmissiveTexture(seed: number, palette: Palette): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Start fully dark
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  const cols = 4;
  const rows = 5;
  const cellW = size / cols;
  const cellH = size / rows;
  const winW = cellW * 0.48;
  const winH = cellH * 0.62;

  const prng = mulberry32(seed);

  const amberHex = '#' + palette.emissiveAmber.toString(16).padStart(6, '0');
  const creamHex = '#' + palette.emissiveCream.toString(16).padStart(6, '0');
  const blueHex = '#' + palette.emissiveBlue.toString(16).padStart(6, '0');

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const roll = prng();
      if (roll < 0.4) continue; // ~40% dark
      const cx = c * cellW + cellW / 2;
      const cy = r * cellH + cellH / 2;
      const colorRoll = prng();
      ctx.fillStyle =
        colorRoll < 0.65 ? amberHex : colorRoll < 0.9 ? creamHex : blueHex;
      ctx.fillRect(cx - winW / 2, cy - winH / 2, winW, winH);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

// ---------------------------------------------------------------------------
// Disposables tracker
// ---------------------------------------------------------------------------

class DisposalTracker {
  private items: Array<{ dispose: () => void }> = [];
  track<T extends { dispose: () => void }>(item: T): T {
    this.items.push(item);
    return item;
  }
  trackMat<T extends THREE.Material>(mat: T): T {
    this.items.push(mat);
    return mat;
  }
  trackGeom<T extends THREE.BufferGeometry>(g: T): T {
    this.items.push(g);
    return g;
  }
  disposeAll() {
    for (const i of this.items) i.dispose();
    this.items = [];
  }
}

// ---------------------------------------------------------------------------
// Roof styles — last-step architectural flourish
// ---------------------------------------------------------------------------

type RoofStyle = 'flat' | 'pyramid' | 'chamfered' | 'slanted' | 'diamond-cap';

// ---------------------------------------------------------------------------
// Building module interface
// ---------------------------------------------------------------------------

interface BuildingModules {
  group: THREE.Group;
  plinth: THREE.Mesh;
  plinthEdges: THREE.LineSegments;
  columns: THREE.Mesh[];
  columnsEdges: THREE.LineSegments[];
  slabs: THREE.Mesh[];
  slabsEdges: THREE.LineSegments[];
  body: THREE.Mesh;
  bodyEdges: THREE.LineSegments;
  cornice: THREE.Mesh;
  corniceEdges: THREE.LineSegments;
  parapet: THREE.Mesh;
  parapetEdges: THREE.LineSegments;
  roof: THREE.Mesh | null;
  antenna: THREE.Group | null;
  bodyHeight: number;
}

interface ConstructionSlot {
  modules: BuildingModules;
  birthTime: number;
  cyclePeriod: number;
  positions: Array<{ x: number; z: number; w: number; d: number; h: number }>;
  posIdx: number;
}

// ---------------------------------------------------------------------------
// Build one modular generic building at origin, caller positions the group
// ---------------------------------------------------------------------------

interface BuildingMaterials {
  stoneMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  edgeMat: THREE.LineBasicMaterial;
  scaffoldMat: THREE.MeshStandardMaterial;
  scaffoldEdgeMat: THREE.LineBasicMaterial;
}

function buildGenericBuilding(
  w: number,
  d: number,
  h: number,
  mats: BuildingMaterials,
  tracker: DisposalTracker,
  roofStyle: RoofStyle = 'flat',
  antennaMat: THREE.MeshStandardMaterial | null = null
): BuildingModules {
  const group = new THREE.Group();

  // Plinth — base slab, wider than body
  const plinthH = 0.4;
  const plinthW = w + 0.3;
  const plinthD = d + 0.3;
  const plinthGeom = tracker.trackGeom(new THREE.BoxGeometry(plinthW, plinthH, plinthD));
  plinthGeom.translate(0, plinthH / 2, 0);
  const plinth = new THREE.Mesh(plinthGeom, mats.stoneMat);
  const plinthEdges = new THREE.LineSegments(
    tracker.trackGeom(new THREE.EdgesGeometry(plinthGeom)),
    mats.edgeMat
  );
  plinth.add(plinthEdges);
  group.add(plinth);

  // Body height sits between plinth top and cornice bottom
  const corniceH = 0.25;
  const parapetH = 0.35;
  const bodyH = h - plinthH - corniceH - parapetH;
  if (bodyH < 1) {
    // Safeguard — for very short buildings, skip cornice/parapet
  }
  const safeBodyH = Math.max(1, bodyH);
  const bodyGeom = tracker.trackGeom(new THREE.BoxGeometry(w, safeBodyH, d));
  bodyGeom.translate(0, plinthH + safeBodyH / 2, 0);

  // UV repeats so windows tile cleanly. Integer repeats in each axis.
  const uvs = bodyGeom.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uvs.count; i++) {
    const faceIdx = Math.floor(i / 4);
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    let repU = 1;
    let repV = 1;
    if (faceIdx === 0 || faceIdx === 1) {
      repU = Math.max(1, Math.round(d / 2.5));
      repV = Math.max(1, Math.round(safeBodyH / 2.6));
    } else if (faceIdx === 4 || faceIdx === 5) {
      repU = Math.max(1, Math.round(w / 2.5));
      repV = Math.max(1, Math.round(safeBodyH / 2.6));
    } else {
      // top/bottom — no windows
      repU = 0.01;
      repV = 0.01;
    }
    uvs.setXY(i, u * repU, v * repV);
  }
  uvs.needsUpdate = true;

  const body = new THREE.Mesh(bodyGeom, mats.bodyMat);
  const bodyEdges = new THREE.LineSegments(
    tracker.trackGeom(new THREE.EdgesGeometry(bodyGeom)),
    mats.edgeMat
  );
  body.add(bodyEdges);
  group.add(body);

  // Cornice — slightly wider than body, thin band above body
  const corniceW = w + 0.15;
  const corniceD = d + 0.15;
  const corniceGeom = tracker.trackGeom(new THREE.BoxGeometry(corniceW, corniceH, corniceD));
  corniceGeom.translate(0, plinthH + safeBodyH + corniceH / 2, 0);
  const cornice = new THREE.Mesh(corniceGeom, mats.stoneMat);
  const corniceEdges = new THREE.LineSegments(
    tracker.trackGeom(new THREE.EdgesGeometry(corniceGeom)),
    mats.edgeMat
  );
  cornice.add(corniceEdges);
  group.add(cornice);

  // Parapet — slightly wider again, thin cap
  const parapetW = w + 0.25;
  const parapetD = d + 0.25;
  const parapetGeom = tracker.trackGeom(new THREE.BoxGeometry(parapetW, parapetH, parapetD));
  parapetGeom.translate(0, plinthH + safeBodyH + corniceH + parapetH / 2, 0);
  const parapet = new THREE.Mesh(parapetGeom, mats.stoneMat);
  const parapetEdges = new THREE.LineSegments(
    tracker.trackGeom(new THREE.EdgesGeometry(parapetGeom)),
    mats.edgeMat
  );
  parapet.add(parapetEdges);
  group.add(parapet);

  // Roof cap — additional top element based on roofStyle.
  // "flat" leaves parapet as the final element and adds nothing.
  let roof: THREE.Mesh | null = null;
  const roofBaseY = plinthH + safeBodyH + corniceH + parapetH;
  if (roofStyle === 'pyramid') {
    // 4-sided pyramid capping the building, slightly wider than body
    const capR = Math.min(w, d) * 0.55;
    const capH = Math.min(w, d) * 0.55;
    const roofGeom = tracker.trackGeom(new THREE.ConeGeometry(capR, capH, 4));
    roofGeom.rotateY(Math.PI / 4);
    roofGeom.translate(0, roofBaseY + capH / 2, 0);
    roof = new THREE.Mesh(roofGeom, mats.stoneMat);
    const re = new THREE.LineSegments(
      tracker.trackGeom(new THREE.EdgesGeometry(roofGeom)),
      mats.edgeMat
    );
    roof.add(re);
    group.add(roof);
  } else if (roofStyle === 'chamfered') {
    // 4-sided frustum — wider at base, narrower at top, crisp low-poly
    const bottomR = Math.min(w, d) * 0.6;
    const topR = Math.min(w, d) * 0.32;
    const capH = Math.min(w, d) * 0.35;
    const roofGeom = tracker.trackGeom(
      new THREE.CylinderGeometry(topR, bottomR, capH, 4)
    );
    roofGeom.rotateY(Math.PI / 4);
    roofGeom.translate(0, roofBaseY + capH / 2, 0);
    roof = new THREE.Mesh(roofGeom, mats.stoneMat);
    const re = new THREE.LineSegments(
      tracker.trackGeom(new THREE.EdgesGeometry(roofGeom)),
      mats.edgeMat
    );
    roof.add(re);
    group.add(roof);
  } else if (roofStyle === 'slanted') {
    // One-sided pitched roof — box with two top verts lowered. Easier:
    // use a pentagon cross-section extruded.
    const capH = Math.min(w, d) * 0.45;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, capH);
    shape.lineTo(-w / 2, capH * 0.2);
    shape.lineTo(-w / 2, 0);
    const roofGeom = tracker.trackGeom(
      new THREE.ExtrudeGeometry(shape, {
        depth: d,
        bevelEnabled: false,
        curveSegments: 1,
      })
    );
    roofGeom.translate(0, roofBaseY, -d / 2);
    roof = new THREE.Mesh(roofGeom, mats.stoneMat);
    const re = new THREE.LineSegments(
      tracker.trackGeom(new THREE.EdgesGeometry(roofGeom)),
      mats.edgeMat
    );
    roof.add(re);
    group.add(roof);
  } else if (roofStyle === 'diamond-cap') {
    // Small box raised diamond — like a cupola. Thin vertical diamond.
    const capR = Math.min(w, d) * 0.25;
    const capH = Math.min(w, d) * 0.6;
    // Octahedron: ConeGeometry(r, h, 4) back to back
    const lower = tracker.trackGeom(new THREE.ConeGeometry(capR, capH / 2, 4));
    lower.rotateY(Math.PI / 4);
    lower.rotateZ(Math.PI);
    lower.translate(0, roofBaseY + capH / 4, 0);
    const upper = tracker.trackGeom(new THREE.ConeGeometry(capR, capH / 2, 4));
    upper.rotateY(Math.PI / 4);
    upper.translate(0, roofBaseY + (capH * 3) / 4, 0);

    const diamondGroup = new THREE.Group();
    const lm = new THREE.Mesh(lower, mats.stoneMat);
    lm.add(
      new THREE.LineSegments(
        tracker.trackGeom(new THREE.EdgesGeometry(lower)),
        mats.edgeMat
      )
    );
    const um = new THREE.Mesh(upper, mats.stoneMat);
    um.add(
      new THREE.LineSegments(
        tracker.trackGeom(new THREE.EdgesGeometry(upper)),
        mats.edgeMat
      )
    );
    diamondGroup.add(lm);
    diamondGroup.add(um);
    // We need to return a single Mesh for the `roof` field; pack group
    // inside a dummy parent mesh for the caller.
    roof = lm; // use lower mesh as handle; upper stays grouped
    group.add(diamondGroup);
  }

  // Antenna — thin cylinder + tip ball on top of roof, if requested
  let antenna: THREE.Group | null = null;
  if (antennaMat) {
    antenna = new THREE.Group();
    const mastH = 1.6;
    const mastGeom = tracker.trackGeom(new THREE.CylinderGeometry(0.04, 0.04, mastH, 5));
    mastGeom.translate(0, mastH / 2, 0);
    const mast = new THREE.Mesh(mastGeom, antennaMat);

    // Where does the antenna base sit? Above the roof or parapet.
    let mastBaseY = roofBaseY;
    if (roofStyle === 'pyramid' || roofStyle === 'chamfered') {
      mastBaseY += Math.min(w, d) * 0.45;
    } else if (roofStyle === 'slanted') {
      mastBaseY += Math.min(w, d) * 0.3;
    } else if (roofStyle === 'diamond-cap') {
      mastBaseY += Math.min(w, d) * 0.65;
    }
    antenna.position.y = mastBaseY;
    antenna.add(mast);

    // Crossbar — thin horizontal bar near the top
    const crossGeom = tracker.trackGeom(new THREE.BoxGeometry(0.45, 0.05, 0.05));
    crossGeom.translate(0, mastH * 0.7, 0);
    const cross = new THREE.Mesh(crossGeom, antennaMat);
    antenna.add(cross);

    // Tip ball
    const tipGeom = tracker.trackGeom(new THREE.SphereGeometry(0.07, 6, 4));
    tipGeom.translate(0, mastH + 0.1, 0);
    const tip = new THREE.Mesh(tipGeom, antennaMat);
    antenna.add(tip);

    group.add(antenna);
  }

  // 4 corner columns + 3 floor slabs — used only by construction slots.
  // Built but hidden for static buildings.
  const columns: THREE.Mesh[] = [];
  const columnsEdges: THREE.LineSegments[] = [];
  const colW = 0.28;
  const colPositions: Array<[number, number]> = [
    [-w / 2 + colW / 2, -d / 2 + colW / 2],
    [w / 2 - colW / 2, -d / 2 + colW / 2],
    [w / 2 - colW / 2, d / 2 - colW / 2],
    [-w / 2 + colW / 2, d / 2 - colW / 2],
  ];
  for (const [cx, cz] of colPositions) {
    const colGeom = tracker.trackGeom(new THREE.BoxGeometry(colW, safeBodyH, colW));
    colGeom.translate(cx, plinthH + safeBodyH / 2, cz);
    const col = new THREE.Mesh(colGeom, mats.scaffoldMat);
    const cEdges = new THREE.LineSegments(
      tracker.trackGeom(new THREE.EdgesGeometry(colGeom)),
      mats.scaffoldEdgeMat
    );
    col.add(cEdges);
    group.add(col);
    columns.push(col);
    columnsEdges.push(cEdges);
  }

  // Floor slabs — thin horizontal plates spanning between columns at
  // intermediate heights. Count scales with body height.
  const slabs: THREE.Mesh[] = [];
  const slabsEdges: THREE.LineSegments[] = [];
  const slabCount = Math.max(1, Math.min(3, Math.floor(safeBodyH / 3)));
  const slabH = 0.1;
  for (let i = 0; i < slabCount; i++) {
    const slabGeom = tracker.trackGeom(
      new THREE.BoxGeometry(w - colW * 2, slabH, d - colW * 2)
    );
    const fraction = (i + 1) / (slabCount + 1);
    slabGeom.translate(0, plinthH + safeBodyH * fraction, 0);
    const slab = new THREE.Mesh(slabGeom, mats.scaffoldMat);
    const sEdges = new THREE.LineSegments(
      tracker.trackGeom(new THREE.EdgesGeometry(slabGeom)),
      mats.scaffoldEdgeMat
    );
    slab.add(sEdges);
    group.add(slab);
    slabs.push(slab);
    slabsEdges.push(sEdges);
  }

  return {
    group,
    plinth,
    plinthEdges,
    columns,
    columnsEdges,
    slabs,
    slabsEdges,
    body,
    bodyEdges,
    cornice,
    corniceEdges,
    parapet,
    parapetEdges,
    roof,
    antenna,
    bodyHeight: safeBodyH,
  };
}

/**
 * Snap a building's modules to "fully built, no scaffolding" visual state.
 * Used for static buildings (the 95% that don't cycle).
 */
function setBuildingStatic(modules: BuildingModules) {
  modules.plinth.scale.y = 1;
  modules.body.scale.y = 1;
  modules.cornice.scale.y = 1;
  modules.parapet.scale.y = 1;
  modules.plinth.visible = true;
  modules.body.visible = true;
  modules.cornice.visible = true;
  modules.parapet.visible = true;
  if (modules.roof) {
    modules.roof.visible = true;
    modules.roof.scale.y = 1;
  }
  if (modules.antenna) {
    modules.antenna.visible = true;
  }
  // Scaffolding elements hidden — the body occludes them when full-sized,
  // but explicitly hide so they aren't drawn at all.
  for (const c of modules.columns) c.visible = false;
  for (const s of modules.slabs) s.visible = false;
}

/**
 * Set construction progress for a dynamic building slot. `t` is 0..1 across
 * one full cycle. Phases (all non-overlapping):
 *  0.00 - 0.02  plinth rises
 *  0.02 - 0.12  four columns rise staggered
 *  0.12 - 0.22  slabs appear bottom-up
 *  0.22 - 0.50  body cladding scale.y 0→1 (progressively occludes frame)
 *  0.50 - 0.56  cornice + parapet
 *  0.56 - 0.90  hold
 *  0.90 - 1.00  (nothing visible, reset handled externally)
 */
function updateBuildingConstruction(modules: BuildingModules, t: number) {
  // Plinth 0.00 → 0.02
  modules.plinth.visible = t >= 0;
  modules.plinth.scale.y = smoothstep(0, 0.02, t);

  // Columns 0.02 → 0.12, each staggered by 0.025
  for (let i = 0; i < modules.columns.length; i++) {
    const start = 0.02 + i * 0.025;
    const end = start + 0.03;
    modules.columns[i].visible = t >= start;
    modules.columns[i].scale.y = smoothstep(start, end, t);
  }

  // Slabs 0.12 → 0.22, staggered
  for (let i = 0; i < modules.slabs.length; i++) {
    const start = 0.12 + i * 0.03;
    const end = start + 0.03;
    modules.slabs[i].visible = t >= start;
    modules.slabs[i].scale.y = smoothstep(start, end, t);
  }

  // Body 0.22 → 0.50
  modules.body.visible = t >= 0.22;
  modules.body.scale.y = smoothstep(0.22, 0.5, t);

  // Cornice 0.50 → 0.53
  modules.cornice.visible = t >= 0.5;
  modules.cornice.scale.y = smoothstep(0.5, 0.53, t);

  // Parapet 0.53 → 0.56
  modules.parapet.visible = t >= 0.53;
  modules.parapet.scale.y = smoothstep(0.53, 0.56, t);

  // Roof cap + antenna come on after the parapet
  if (modules.roof) {
    modules.roof.visible = t >= 0.56;
    modules.roof.scale.y = smoothstep(0.56, 0.6, t);
  }
  if (modules.antenna) {
    modules.antenna.visible = t >= 0.6;
    modules.antenna.scale.y = smoothstep(0.6, 0.64, t);
  }

  // At the end of the cycle (t > 0.95), everything goes invisible so the
  // reset can reposition without a visible jump.
  if (t > 0.95) {
    modules.plinth.visible = false;
    modules.body.visible = false;
    modules.cornice.visible = false;
    modules.parapet.visible = false;
    if (modules.roof) modules.roof.visible = false;
    if (modules.antenna) modules.antenna.visible = false;
    for (const c of modules.columns) c.visible = false;
    for (const s of modules.slabs) s.visible = false;
  }
}

// ---------------------------------------------------------------------------
// Zone-based placement: produces a list of (x, z, w, d, h, accent) building
// specs for a given zone
// ---------------------------------------------------------------------------

interface BuildingSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  accentColor: number | null;
  seed: number;
  roofStyle?: RoofStyle;
  antenna?: boolean;
}

function placeZonedBuildings(
  occupied: Array<{ x: number; z: number; w: number; d: number }>,
  parkCenter: { x: number; z: number },
  parkW: number,
  parkD: number,
  spacing: number
): BuildingSpec[] {
  const specs: BuildingSpec[] = [];
  const CLEARANCE = 0.8;

  const tryPlace = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    h: number,
    accentColor: number | null,
    seedBase: number
  ) => {
    const clashes = occupied.some((o) => {
      const dx = Math.abs(cx - o.x);
      const dz = Math.abs(cz - o.z);
      return (
        dx < w / 2 + o.w / 2 + CLEARANCE &&
        dz < d / 2 + o.d / 2 + CLEARANCE
      );
    });
    if (clashes) return false;
    if (
      Math.abs(cx - parkCenter.x) < parkW * 0.55 &&
      Math.abs(cz - parkCenter.z) < parkD * 0.55
    ) {
      return false;
    }
    occupied.push({ x: cx, z: cz, w, d });
    specs.push({ x: cx, z: cz, w, d, h, accentColor, seed: seedBase });
    return true;
  };

  // ---- CBD (NE quadrant) — tall towers near Barcode ----
  const cbdPositions: Array<[number, number, number, number, number]> = [
    [spacing * 1.2, spacing * 2.0, 3.2, 3.2, 16],
    [spacing * 0.6, spacing * 2.2, 2.8, 3.0, 18],
    [spacing * 0.2, spacing * 1.4, 3.4, 3.0, 14],
    [spacing * 0.8, spacing * 1.0, 2.6, 2.6, 19],
    [spacing * 2.2, spacing * 0.6, 3.2, 3.2, 13],
  ];
  for (let i = 0; i < cbdPositions.length; i++) {
    const [cx, cz, w, d, h] = cbdPositions[i];
    const accent = i % 3 === 0 ? DISCIPLINE_COLORS[0] : null;
    tryPlace(cx, cz, w, d, h, accent, 100 + i);
  }

  // ---- Civic (SE quadrant) — wide low-rise civic blocks beside the Opera ----
  const civicPositions: Array<[number, number, number, number, number]> = [
    [spacing * 2.0, -spacing * 0.6, 4.2, 3.8, 5.5],
    [spacing * 1.2, -spacing * 0.4, 3.6, 3.2, 6.5],
    [spacing * 0.4, -spacing * 0.8, 3.2, 3.0, 5.0],
  ];
  for (let i = 0; i < civicPositions.length; i++) {
    const [cx, cz, w, d, h] = civicPositions[i];
    tryPlace(cx, cz, w, d, h, null, 200 + i);
  }

  // ---- Old Town (SW quadrant) — tight cluster of low blocks ----
  const oldTown: Array<[number, number, number, number, number, number | null]> = [
    [-spacing * 0.4, -spacing * 1.4, 2.8, 2.6, 4.2, null],
    [-spacing * 1.1, -spacing * 1.6, 2.6, 2.4, 3.8, DISCIPLINE_COLORS[1]],
    [-spacing * 1.8, -spacing * 1.2, 2.8, 2.8, 4.5, null],
    [-spacing * 0.6, -spacing * 2.2, 3.0, 2.6, 3.6, null],
    [-spacing * 1.4, -spacing * 2.3, 2.6, 2.4, 4.4, null],
    [-spacing * 2.1, -spacing * 1.9, 2.8, 2.8, 3.9, DISCIPLINE_COLORS[1]],
    [-spacing * 0.2, -spacing * 2.6, 2.4, 2.4, 4.0, null],
  ];
  for (let i = 0; i < oldTown.length; i++) {
    const [cx, cz, w, d, h, accent] = oldTown[i];
    tryPlace(cx, cz, w, d, h, accent, 300 + i);
  }

  // ---- Residential ring around the park (NW quadrant, outside the park) ----
  const residential: Array<[number, number, number, number, number]> = [
    [-spacing * 2.6, -spacing * 0.4, 2.6, 2.6, 5.5],
    [-spacing * 2.8, spacing * 0.6, 2.8, 2.6, 5.0],
    [-spacing * 0.6, spacing * 2.4, 2.6, 2.4, 5.8],
    [-spacing * 1.4, spacing * 2.6, 2.8, 2.6, 5.2],
    [-spacing * 2.2, spacing * 2.5, 2.6, 2.4, 4.8],
  ];
  for (let i = 0; i < residential.length; i++) {
    const [cx, cz, w, d, h] = residential[i];
    tryPlace(cx, cz, w, d, h, null, 400 + i);
  }

  return specs;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function initBlueprintCity(
  container: HTMLElement,
  variant: BlueprintCityVariant = 'day'
): () => void {
  const palette = variant === 'night' ? NIGHT_PALETTE : DAY_PALETTE;
  const tracker = new DisposalTracker();

  const scene = new THREE.Scene();
  scene.background = palette.bg;
  scene.fog = new THREE.Fog(palette.fog, palette.fogNear, palette.fogFar);

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

  // Lighting
  const ambient = new THREE.AmbientLight(palette.ambient, palette.ambientIntensity);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(palette.key, palette.keyIntensity);
  keyLight.position.set(28, 42, 22);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(palette.fill, palette.fillIntensity);
  fillLight.position.set(-18, 22, -14);
  scene.add(fillLight);

  // Ground
  const groundGeometry = tracker.trackGeom(new THREE.PlaneGeometry(240, 240));
  const groundMaterial = tracker.trackMat(
    new THREE.MeshBasicMaterial({
      color: palette.ground,
      transparent: false,
    })
  );
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  // Blueprint grid overlay
  const grid = new THREE.GridHelper(
    140,
    70,
    palette.edge,
    variant === 'night' ? 0x2a3156 : 0xb8b19c
  );
  const gridMaterial = grid.material as THREE.Material | THREE.Material[];
  if (Array.isArray(gridMaterial)) {
    gridMaterial.forEach((m) => {
      m.transparent = true;
      m.opacity = variant === 'night' ? 0.35 : 0.22;
    });
  } else {
    gridMaterial.transparent = true;
    gridMaterial.opacity = variant === 'night' ? 0.35 : 0.22;
  }
  scene.add(grid);

  const axisCount = 7;
  const spacing = 6;
  const halfAxis = (axisCount - 1) / 2;
  const blockExtent = halfAxis * spacing + spacing * 0.5;

  // Cell-aligned coordinate system
  // Cell centers on each axis: -15, -9, -3, 3, 9, 15  (6 cells per axis)
  // Streets between cells at: -18, -12, -6, 0, 6, 12, 18
  // River replaces the x=0 street — Bangkok-style waterfront runs N-S
  const CELL_CENTERS = [-15, -9, -3, 3, 9, 15];
  const RIVER_X = 0;
  const RIVER_HALF_WIDTH = 1.4;
  const RIVER_Z_MIN = -blockExtent;
  const RIVER_Z_MAX = blockExtent;

  // Park footprint — NW quadrant, 2×2 cells
  // Spans cells (x=-15, z=9), (x=-15, z=15), (x=-9, z=9), (x=-9, z=15)
  const parkCenter = new THREE.Vector3(-12, 0, 12);
  const parkW = 12;
  const parkD = 12;

  // River mesh — opaque blue strip running N-S
  const riverGeom = tracker.trackGeom(
    new THREE.PlaneGeometry(RIVER_HALF_WIDTH * 2, RIVER_Z_MAX - RIVER_Z_MIN)
  );
  const riverMat = tracker.trackMat(
    new THREE.MeshBasicMaterial({ color: palette.water, transparent: false })
  );
  const river = new THREE.Mesh(riverGeom, riverMat);
  river.rotation.x = -Math.PI / 2;
  river.position.set(RIVER_X, 0.003, (RIVER_Z_MIN + RIVER_Z_MAX) / 2);
  scene.add(river);

  // River edge lines — two ink stripes along the banks
  const riverEdgeMat = tracker.trackMat(
    new THREE.LineBasicMaterial({ color: palette.edge, transparent: true, opacity: 0.6 })
  );
  const riverEdgeGeom = tracker.trackGeom(new THREE.BufferGeometry());
  const riverEdgeVerts = new Float32Array([
    RIVER_X - RIVER_HALF_WIDTH, 0.004, RIVER_Z_MIN,
    RIVER_X - RIVER_HALF_WIDTH, 0.004, RIVER_Z_MAX,
    RIVER_X + RIVER_HALF_WIDTH, 0.004, RIVER_Z_MIN,
    RIVER_X + RIVER_HALF_WIDTH, 0.004, RIVER_Z_MAX,
  ]);
  riverEdgeGeom.setAttribute('position', new THREE.BufferAttribute(riverEdgeVerts, 3));
  const riverEdges = new THREE.LineSegments(riverEdgeGeom, riverEdgeMat);
  scene.add(riverEdges);

  // --- Streets — grid-aligned, river-aware, park-aware ---
  const streetGroup = new THREE.Group();
  const streetMat = tracker.trackMat(
    new THREE.MeshBasicMaterial({
      color: palette.street,
      transparent: true,
      opacity: palette.streetOpacity,
      blending: palette.streetBlending,
      depthWrite: false,
    })
  );

  const STREET_THICKNESS = 0.7;

  // Helpers to draw a straight street segment, skipping the park interior
  // for horizontal strips that pass through the park z range and vice versa.
  const parkXmin = parkCenter.x - parkW / 2;
  const parkXmax = parkCenter.x + parkW / 2;
  const parkZmin = parkCenter.z - parkD / 2;
  const parkZmax = parkCenter.z + parkD / 2;

  function drawHorizontalSegment(z: number, xStart: number, xEnd: number) {
    if (xEnd <= xStart) return;
    const length = xEnd - xStart;
    const geom = tracker.trackGeom(new THREE.PlaneGeometry(length, STREET_THICKNESS));
    const mesh = new THREE.Mesh(geom, streetMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((xStart + xEnd) / 2, 0.005, z);
    streetGroup.add(mesh);
  }

  function drawVerticalSegment(x: number, zStart: number, zEnd: number) {
    if (zEnd <= zStart) return;
    const length = zEnd - zStart;
    const geom = tracker.trackGeom(new THREE.PlaneGeometry(STREET_THICKNESS, length));
    const mesh = new THREE.Mesh(geom, streetMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.005, (zStart + zEnd) / 2);
    streetGroup.add(mesh);
  }

  const STREET_POSITIONS = [-18, -12, -6, 0, 6, 12, 18];

  // Horizontal streets (running along X). Each may span the full width,
  // or be split into two segments that skip the park interior.
  // They also cross the river as bridges (no special treatment — the street
  // is drawn on top of the river plane at a slightly higher y).
  for (const z of STREET_POSITIONS) {
    const inPark = z > parkZmin && z < parkZmax;
    if (!inPark) {
      drawHorizontalSegment(z, -blockExtent, blockExtent);
    } else {
      // Skip the park interior
      drawHorizontalSegment(z, -blockExtent, parkXmin);
      drawHorizontalSegment(z, parkXmax, blockExtent);
    }
  }

  // Vertical streets (running along Z). Skip x=0 — that's the river.
  for (const x of STREET_POSITIONS) {
    if (x === 0) continue; // river takes this slot
    const inPark = x > parkXmin && x < parkXmax;
    if (!inPark) {
      drawVerticalSegment(x, -blockExtent, blockExtent);
    } else {
      drawVerticalSegment(x, -blockExtent, parkZmin);
      drawVerticalSegment(x, parkZmax, blockExtent);
    }
  }

  scene.add(streetGroup);

  // --- Park + pond ---
  const parkGroup = new THREE.Group();

  const parkGeometry = tracker.trackGeom(new THREE.PlaneGeometry(parkW, parkD));
  const parkMaterial = tracker.trackMat(
    new THREE.MeshBasicMaterial({ color: palette.grass, transparent: false })
  );
  const park = new THREE.Mesh(parkGeometry, parkMaterial);
  park.rotation.x = -Math.PI / 2;
  park.position.copy(parkCenter);
  park.position.y = 0.004;
  parkGroup.add(park);

  const parkInnerGeom = tracker.trackGeom(
    new THREE.PlaneGeometry(parkW * 0.72, parkD * 0.72)
  );
  const parkInnerMaterial = tracker.trackMat(
    new THREE.MeshBasicMaterial({ color: palette.grassDark, transparent: false })
  );
  const parkInner = new THREE.Mesh(parkInnerGeom, parkInnerMaterial);
  parkInner.rotation.x = -Math.PI / 2;
  parkInner.position.copy(parkCenter);
  parkInner.position.y = 0.006;
  parkGroup.add(parkInner);

  const parkEdgeGeom = tracker.trackGeom(new THREE.EdgesGeometry(parkGeometry));
  const parkEdges = new THREE.LineSegments(
    parkEdgeGeom,
    tracker.trackMat(
      new THREE.LineBasicMaterial({
        color: palette.edge,
        transparent: true,
        opacity: 0.55,
      })
    )
  );
  parkEdges.rotation.x = -Math.PI / 2;
  parkEdges.position.copy(parkCenter);
  parkEdges.position.y = 0.007;
  parkGroup.add(parkEdges);

  // Pond in the NE corner of the park
  const pondOffset = new THREE.Vector3(parkW * 0.18, 0, -parkD * 0.18);
  const pondW = parkW * 0.34;
  const pondD = parkD * 0.34;
  const pondGeometry = tracker.trackGeom(new THREE.PlaneGeometry(pondW, pondD));
  const pondMaterial = tracker.trackMat(
    new THREE.MeshBasicMaterial({ color: palette.water, transparent: false })
  );
  const pond = new THREE.Mesh(pondGeometry, pondMaterial);
  pond.rotation.x = -Math.PI / 2;
  pond.position.copy(parkCenter).add(pondOffset);
  pond.position.y = 0.008;
  parkGroup.add(pond);

  const pondEdgeGeom = tracker.trackGeom(new THREE.EdgesGeometry(pondGeometry));
  const pondEdges = new THREE.LineSegments(
    pondEdgeGeom,
    tracker.trackMat(
      new THREE.LineBasicMaterial({
        color: palette.edge,
        transparent: true,
        opacity: 0.75,
      })
    )
  );
  pondEdges.rotation.x = -Math.PI / 2;
  pondEdges.position.copy(pond.position);
  pondEdges.position.y = 0.009;
  parkGroup.add(pondEdges);

  scene.add(parkGroup);

  // --- Footprint reservations ---
  const occupied: Array<{ x: number; z: number; w: number; d: number }> = [];
  occupied.push({ x: parkCenter.x, z: parkCenter.z, w: parkW, d: parkD });

  // --- Shared window textures ---
  const windowColorTex = tracker.track(makeWindowColorTexture());

  // --- Shared edge material ---
  const sharedEdgeMat = tracker.trackMat(
    new THREE.LineBasicMaterial({
      color: palette.edge,
      transparent: palette.edgeOpacity < 1,
      opacity: palette.edgeOpacity,
    })
  );
  const sharedStoneMat = tracker.trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.stone,
      metalness: 0.0,
      roughness: 0.85,
      transparent: false,
    })
  );
  const scaffoldMat = tracker.trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.scaffold,
      emissive: palette.scaffoldEmissive,
      emissiveIntensity: variant === 'night' ? 0.6 : 0,
      metalness: 0.0,
      roughness: 0.8,
      transparent: false,
    })
  );
  const scaffoldEdgeMat = tracker.trackMat(
    new THREE.LineBasicMaterial({ color: palette.scaffold, transparent: true, opacity: 0.9 })
  );

  // --- Landmarks ---
  const landmarkGroup = new THREE.Group();
  scene.add(landmarkGroup);

  function addEdges(mesh: THREE.Mesh, edgeMat: THREE.LineBasicMaterial) {
    const eg = tracker.trackGeom(new THREE.EdgesGeometry(mesh.geometry));
    mesh.add(new THREE.LineSegments(eg, edgeMat));
  }

  // ---- Opera House (East bank of the river, faces the water) ----
  // Abstracted as a clean trapezoidal wedge: low front edge, tall back edge,
  // sloped marble roof/ramp connecting them. No floating fly tower — the
  // signature feature is the ramp itself.
  {
    // East waterfront cell, south section
    const cx = 3;
    const cz = -9;
    const footprintW = 5.5; // along X (perpendicular to river)
    const footprintD = 9;    // along Z (parallel to river)
    const lowH = 0.8;       // front-edge (west/river-facing) height
    const peakH = 4.2;      // back-edge (east-facing) height

    const operaBase = new THREE.Group();
    operaBase.position.set(cx, 0, cz);

    const marbleMat = tracker.trackMat(
      new THREE.MeshStandardMaterial({
        color: variant === 'night' ? 0x4a5066 : 0xece7d8,
        emissive: variant === 'night' ? 0x8a8070 : 0x000000,
        emissiveIntensity: variant === 'night' ? 0.35 : 0,
        metalness: 0.05,
        roughness: 0.72,
        transparent: false,
      })
    );

    // Profile looking along +Z (depth axis): a trapezoid that rises from
    // the river edge to a tall back wall. The slope is the iconic ramp.
    //   (-W/2, 0)       ← river edge, ground level
    //   (+W/2, 0)       ← east edge, ground level
    //   (+W/2, peakH)   ← back top
    //   (-W/2, lowH)    ← river-facing top (low)
    const profile = new THREE.Shape();
    profile.moveTo(-footprintW / 2, 0);
    profile.lineTo(footprintW / 2, 0);
    profile.lineTo(footprintW / 2, peakH);
    profile.lineTo(-footprintW / 2, lowH);
    profile.lineTo(-footprintW / 2, 0);

    const wedgeGeom = tracker.trackGeom(
      new THREE.ExtrudeGeometry(profile, {
        depth: footprintD,
        bevelEnabled: false,
        curveSegments: 1,
      })
    );
    wedgeGeom.translate(0, 0, -footprintD / 2);
    const wedge = new THREE.Mesh(wedgeGeom, marbleMat);
    addEdges(wedge, sharedEdgeMat);
    operaBase.add(wedge);

    landmarkGroup.add(operaBase);
    occupied.push({ x: cx, z: cz, w: footprintW, d: footprintD });
  }

  // ---- Barcode Project (CBD, NE quadrant) ----
  {
    const cx = spacing * 2.4;
    const cz = spacing * 1.6;
    const slabCount = 12;
    const slabW = 0.85;
    const slabD = 4.2;
    const slabGap = 0.35;
    const rowLength = slabCount * (slabW + slabGap) - slabGap;

    const heightPattern = [7, 9, 12, 10, 14, 11, 13, 15, 12, 10, 8, 6];

    for (let i = 0; i < slabCount; i++) {
      const h = heightPattern[i];
      const geom = tracker.trackGeom(new THREE.BoxGeometry(slabW, h, slabD));
      geom.translate(0, h / 2, 0);
      const isDark = i % 2 === 0;

      const slabColorTex = windowColorTex.clone();
      slabColorTex.wrapS = THREE.RepeatWrapping;
      slabColorTex.wrapT = THREE.RepeatWrapping;
      slabColorTex.repeat.set(1, Math.max(1, Math.round(h / 2.6)));
      slabColorTex.needsUpdate = true;

      let slabEmissive: THREE.Texture | null = null;
      if (variant === 'night') {
        slabEmissive = tracker.track(makeWindowEmissiveTexture(900 + i, palette));
        slabEmissive.wrapS = THREE.RepeatWrapping;
        slabEmissive.wrapT = THREE.RepeatWrapping;
        slabEmissive.repeat.set(1, Math.max(1, Math.round(h / 2.6)));
      }

      const mat = tracker.trackMat(
        new THREE.MeshStandardMaterial({
          color:
            variant === 'night'
              ? isDark
                ? 0x0a0e1a
                : 0x1a1f33
              : isDark
                ? 0x3a4160
                : palette.buildingCream,
          map: slabColorTex,
          emissiveMap: slabEmissive ?? undefined,
          emissive: variant === 'night' ? 0xffffff : 0x000000,
          emissiveIntensity: variant === 'night' ? 1.0 : 0,
          metalness: 0.1,
          roughness: 0.62,
          transparent: false,
        })
      );

      const slab = new THREE.Mesh(geom, mat);
      const offsetX = -rowLength / 2 + i * (slabW + slabGap) + slabW / 2;
      slab.position.set(cx + offsetX, 0, cz);
      addEdges(slab, sharedEdgeMat);
      landmarkGroup.add(slab);
    }

    occupied.push({ x: cx, z: cz, w: rowLength, d: slabD });
  }

  // ---- Stavkirke (inside park) ----
  {
    const sx = parkCenter.x - parkW * 0.24;
    const sz = parkCenter.z + parkD * 0.24;

    const stavkirke = new THREE.Group();
    stavkirke.position.set(sx, 0, sz);

    const woodMat = tracker.trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.wood,
        metalness: 0.0,
        roughness: 0.95,
        transparent: false,
      })
    );
    const roofMat = tracker.trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.roof,
        metalness: 0.0,
        roughness: 0.98,
        transparent: false,
      })
    );

    const addTier = (
      widthXY: number,
      wallH: number,
      roofH: number,
      yBase: number
    ) => {
      const wallGeom = tracker.trackGeom(new THREE.BoxGeometry(widthXY, wallH, widthXY));
      wallGeom.translate(0, wallH / 2, 0);
      const wall = new THREE.Mesh(wallGeom, woodMat);
      wall.position.y = yBase;
      addEdges(wall, sharedEdgeMat);
      stavkirke.add(wall);

      const roofGeom = tracker.trackGeom(new THREE.ConeGeometry(widthXY * 0.78, roofH, 4));
      roofGeom.rotateY(Math.PI / 4);
      const roof = new THREE.Mesh(roofGeom, roofMat);
      roof.position.y = yBase + wallH + roofH / 2;
      addEdges(roof, sharedEdgeMat);
      stavkirke.add(roof);
      return wallH + roofH;
    };

    let y = 0;
    y += addTier(3.2, 2.4, 1.8, y);
    y += addTier(2.2, 1.6, 1.4, y) - 0.4;
    y += addTier(1.4, 1.2, 1.1, y) - 0.3;

    const spireGeom = tracker.trackGeom(new THREE.CylinderGeometry(0.05, 0.08, 0.9, 4));
    const spire = new THREE.Mesh(spireGeom, roofMat);
    spire.position.y = y + 0.45;
    stavkirke.add(spire);

    const crossBarGeom = tracker.trackGeom(new THREE.BoxGeometry(0.3, 0.06, 0.06));
    const crossBar = new THREE.Mesh(crossBarGeom, roofMat);
    crossBar.position.y = y + 0.7;
    stavkirke.add(crossBar);

    // Night: one warm lit window high on the top tier
    if (variant === 'night') {
      const litGeom = tracker.trackGeom(new THREE.PlaneGeometry(0.18, 0.22));
      const litMat = tracker.trackMat(
        new THREE.MeshBasicMaterial({ color: palette.emissiveAmber })
      );
      const lit = new THREE.Mesh(litGeom, litMat);
      lit.position.set(0, y - 1.5, 0.71);
      stavkirke.add(lit);
    }

    landmarkGroup.add(stavkirke);
    occupied.push({ x: sx, z: sz, w: 4.2, d: 4.2 });
  }

  // --- Generic buildings — zoned static ---
  const buildingSpecs = placeZonedBuildings(occupied, parkCenter, parkW, parkD, spacing);

  const buildingGroup = new THREE.Group();
  scene.add(buildingGroup);
  const staticModules: BuildingModules[] = [];

  for (const spec of buildingSpecs) {
    const bodyColor = spec.accentColor ?? palette.buildingCream;

    const bodyColorTex = windowColorTex.clone();
    bodyColorTex.needsUpdate = true;

    let emissive: THREE.Texture | null = null;
    if (palette.windowEmissive) {
      emissive = tracker.track(makeWindowEmissiveTexture(spec.seed, palette));
    }

    const bodyMat = tracker.trackMat(
      new THREE.MeshStandardMaterial({
        color: bodyColor,
        map: bodyColorTex,
        emissiveMap: emissive ?? undefined,
        emissive: palette.windowEmissive ? 0xffffff : 0x000000,
        emissiveIntensity: palette.windowEmissive ? 1.0 : 0,
        metalness: 0.05,
        roughness: 0.88,
        transparent: false,
      })
    );

    const mats: BuildingMaterials = {
      stoneMat: sharedStoneMat,
      bodyMat,
      edgeMat: sharedEdgeMat,
      scaffoldMat,
      scaffoldEdgeMat,
    };

    const modules = buildGenericBuilding(spec.w, spec.d, spec.h, mats, tracker);
    modules.group.position.set(spec.x, 0, spec.z);
    buildingGroup.add(modules.group);
    setBuildingStatic(modules);
    staticModules.push(modules);
  }

  // --- Construction slots — 4 dedicated slots that rotate through curated positions ---
  const constructionPositions: Array<{ x: number; z: number; w: number; d: number; h: number }> = [
    { x: -spacing * 0.2, z: spacing * 0.9, w: 3.0, d: 3.0, h: 12 }, // between CBD and center
    { x: spacing * 1.6, z: spacing * 0.4, w: 3.2, d: 3.0, h: 14 }, // CBD south edge
    { x: -spacing * 1.3, z: -spacing * 0.6, w: 2.8, d: 2.6, h: 8 }, // Old Town / residential
    { x: -spacing * 0.1, z: -spacing * 0.6, w: 2.8, d: 2.6, h: 7 }, // centre south
    { x: spacing * 0.4, z: -spacing * 2.6, w: 3.2, d: 3.0, h: 9 }, // civic edge
    { x: -spacing * 2.6, z: spacing * 1.4, w: 2.6, d: 2.6, h: 6 }, // residential north
  ];

  const constructionSlots: ConstructionSlot[] = [];
  const slotCount = 4;
  // Give each slot its own reusable "pair" of building sizes so the geometry
  // is created once per slot and just repositioned on reset.
  for (let i = 0; i < slotCount; i++) {
    const startPos = constructionPositions[i % constructionPositions.length];

    const bodyColorTex = windowColorTex.clone();
    bodyColorTex.needsUpdate = true;

    let emissive: THREE.Texture | null = null;
    if (palette.windowEmissive) {
      emissive = tracker.track(makeWindowEmissiveTexture(500 + i, palette));
    }

    const bodyMat = tracker.trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.buildingCream,
        map: bodyColorTex,
        emissiveMap: emissive ?? undefined,
        emissive: palette.windowEmissive ? 0xffffff : 0x000000,
        emissiveIntensity: palette.windowEmissive ? 1.0 : 0,
        metalness: 0.05,
        roughness: 0.88,
        transparent: false,
      })
    );

    const mats: BuildingMaterials = {
      stoneMat: sharedStoneMat,
      bodyMat,
      edgeMat: sharedEdgeMat,
      scaffoldMat,
      scaffoldEdgeMat,
    };

    const modules = buildGenericBuilding(
      startPos.w,
      startPos.d,
      startPos.h,
      mats,
      tracker
    );
    modules.group.position.set(startPos.x, 0, startPos.z);
    buildingGroup.add(modules.group);

    // Reserve the footprint so static buildings don't land here
    occupied.push({ x: startPos.x, z: startPos.z, w: startPos.w, d: startPos.d });

    // Initial state: invisible (will appear as cycle advances)
    updateBuildingConstruction(modules, 0);
    modules.plinth.visible = false;
    modules.body.visible = false;
    modules.cornice.visible = false;
    modules.parapet.visible = false;
    for (const c of modules.columns) c.visible = false;
    for (const s of modules.slabs) s.visible = false;

    const cyclePeriod = 48_000 + Math.random() * 12_000;
    constructionSlots.push({
      modules,
      birthTime: -cyclePeriod * (i / slotCount), // stagger births
      cyclePeriod,
      positions: constructionPositions,
      posIdx: i % constructionPositions.length,
    });
  }

  // --- Spruce forest ---
  const treeGroup = new THREE.Group();
  const trunkMaterial = tracker.trackMat(
    new THREE.MeshStandardMaterial({
      color: variant === 'night' ? 0x1a150c : 0x6b5a3c,
      metalness: 0.0,
      roughness: 0.98,
      transparent: false,
    })
  );
  const spruceMaterialDark = tracker.trackMat(
    new THREE.MeshStandardMaterial({
      color: variant === 'night' ? 0x0f2418 : 0x2f6b49,
      metalness: 0.0,
      roughness: 0.9,
      transparent: false,
    })
  );
  const spruceMaterialMid = tracker.trackMat(
    new THREE.MeshStandardMaterial({
      color: variant === 'night' ? 0x153726 : 0x4ba27f,
      metalness: 0.0,
      roughness: 0.9,
      transparent: false,
    })
  );
  const spruceEdgeMaterial = tracker.trackMat(
    new THREE.LineBasicMaterial({
      color: palette.edge,
      transparent: true,
      opacity: 0.6,
    })
  );

  const treeCount = 30;
  let placed = 0;
  let attempts = 0;
  while (placed < treeCount && attempts < 500) {
    attempts++;
    const tx = (Math.random() - 0.5) * blockExtent * 1.95;
    const tz = (Math.random() - 0.5) * blockExtent * 1.95;

    const collides = occupied.some(
      (o) =>
        Math.abs(tx - o.x) < o.w / 2 + 0.5 && Math.abs(tz - o.z) < o.d / 2 + 0.5
    );
    if (collides) continue;

    const scale = 0.85 + Math.random() * 0.7;
    const trunkH = 0.35 * scale;
    const trunkR = 0.12 * scale;
    const tierSides = 4;
    const r1 = 0.8 * scale;
    const h1 = 1.1 * scale;
    const r2 = 0.62 * scale;
    const h2 = 1.0 * scale;
    const r3 = 0.42 * scale;
    const h3 = 0.9 * scale;

    const trunkGeom = tracker.trackGeom(
      new THREE.CylinderGeometry(trunkR, trunkR * 1.15, trunkH, 5)
    );
    const trunk = new THREE.Mesh(trunkGeom, trunkMaterial);
    trunk.position.set(tx, trunkH / 2, tz);
    treeGroup.add(trunk);

    const canopyMat = Math.random() < 0.5 ? spruceMaterialDark : spruceMaterialMid;

    const addCone = (r: number, h: number, yBase: number) => {
      const g = tracker.trackGeom(new THREE.ConeGeometry(r, h, tierSides));
      const m = new THREE.Mesh(g, canopyMat);
      m.position.set(tx, yBase + h / 2, tz);
      m.rotation.y = Math.random() * Math.PI;
      treeGroup.add(m);
      const edgeGeom = tracker.trackGeom(new THREE.EdgesGeometry(g));
      const edges = new THREE.LineSegments(edgeGeom, spruceEdgeMaterial);
      edges.position.copy(m.position);
      edges.rotation.copy(m.rotation);
      treeGroup.add(edges);
    };

    addCone(r1, h1, trunkH);
    addCone(r2, h2, trunkH + h1 * 0.6);
    addCone(r3, h3, trunkH + h1 * 0.6 + h2 * 0.6);

    occupied.push({ x: tx, z: tz, w: r1 * 2.2, d: r1 * 2.2 });
    placed++;
  }
  scene.add(treeGroup);

  // --- Animation loop ---
  const clock = new THREE.Clock();
  let animationId = 0;
  let running = true;

  // Lightning state (night only)
  let nextLightningAt = variant === 'night' ? 8_000 + Math.random() * 12_000 : Infinity;
  let lightningPhase = 0;
  let lightningStart = 0;

  const baseAmbientIntensity = palette.ambientIntensity;

  function animate() {
    if (!running) return;
    animationId = requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime() * 1000;

    // Update construction slots
    for (const slot of constructionSlots) {
      const age = elapsed - slot.birthTime;
      if (age < 0) continue;
      const t = (age % slot.cyclePeriod) / slot.cyclePeriod;
      updateBuildingConstruction(slot.modules, t);

      // When we wrap around (t just became < previous t), move to a new position
      const cycleIndex = Math.floor(age / slot.cyclePeriod);
      const expectedPosIdx =
        (slot.posIdx + cycleIndex) % slot.positions.length;
      if (expectedPosIdx !== ((slot.posIdx + cycleIndex) % slot.positions.length)) {
        // unreachable; keeping structure
      }
      // Compute the "current" position: initial idx plus number of completed cycles
      const curPos = slot.positions[(slot.posIdx + cycleIndex) % slot.positions.length];
      if (
        slot.modules.group.position.x !== curPos.x ||
        slot.modules.group.position.z !== curPos.z
      ) {
        slot.modules.group.position.set(curPos.x, 0, curPos.z);
      }
    }

    // Lightning (night only)
    if (variant === 'night') {
      if (elapsed >= nextLightningAt && lightningPhase === 0) {
        lightningPhase = 1;
        lightningStart = elapsed;
      }
      if (lightningPhase > 0) {
        const dt = elapsed - lightningStart;
        // Phase timing: 0-60ms main flash, 60-250ms decay, 250-270ms flicker, 270-600ms final decay
        if (dt < 60) {
          ambient.intensity = baseAmbientIntensity + 2.2;
          scene.background = new THREE.Color(0xffffff);
        } else if (dt < 250) {
          const k = 1 - (dt - 60) / 190;
          ambient.intensity = baseAmbientIntensity + 1.8 * k;
          scene.background = new THREE.Color().lerpColors(
            palette.bg!,
            new THREE.Color(0xffffff),
            k * 0.8
          );
        } else if (dt < 270) {
          ambient.intensity = baseAmbientIntensity + 1.2;
          scene.background = new THREE.Color(0xf0f0ff);
        } else if (dt < 600) {
          const k = 1 - (dt - 270) / 330;
          ambient.intensity = baseAmbientIntensity + 1.0 * k;
          scene.background = new THREE.Color().lerpColors(palette.bg!, new THREE.Color(0xffffff), k * 0.4);
        } else {
          ambient.intensity = baseAmbientIntensity;
          scene.background = palette.bg;
          lightningPhase = 0;
          nextLightningAt = elapsed + 18_000 + Math.random() * 22_000;
        }
      }
    }

    // Orbital camera drift
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

    tracker.disposeAll();
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
