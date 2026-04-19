import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

/**
 * Architect diorama — welcome scene.
 *
 * Phase B+C build: full bento composition with extruded massing, specific
 * landmark geometry (opera wedge, civic courtyard, tower cores, market bay
 * striations), subdivided low-rise clusters, custom water shader for the
 * river, and a staggered intro reveal that lifts buildings out of the slab.
 *
 * Plan source of truth: `/tmp/diorama-blueprint.html` (Rev C) and the matching
 * scaffold at `/tmp/diorama-scaffold.html`. All plan coords use a 720-unit
 * range (40..760) which maps onto a 42-unit slab in world space.
 *
 * See `frontend/docs/plans/2026-04-14-12-06_Architect-diorama-welcome.md`.
 */

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const PALETTE = {
  bg: null as THREE.Color | null, // CSS parchment shows through

  slab: 0x21263a,        // navy photographer's board
  slabSide: 0x181c2c,

  bone: 0xf2ebd6,        // bright cream massing
  boneWarm: 0xeae0c0,
  boneCool: 0xe4dcc4,
  boneDeep: 0xd6cba8,    // mid-landmark fill
  oldTown: 0xddd0a8,

  tower: 0xf2ebd6,
  towerCore: 0x8a7a55,   // dark warm core inside tower outline

  paving: 0xc7c5b8,      // plaza stone
  road:   0x3a4160,      // lane stone (lighter navy, reads as ink)

  park:   0x4f7d57,      // muted forest green
  bridge: 0xc8b88a,      // warm wood

  outline: 0x000000,
  hemiSky: 0xcfd8e4,
  hemiGround: 0xe8dfc2,
  sun: 0xfff1cf,
} as const;

// ---------------------------------------------------------------------------
// Geometry / layout constants
// ---------------------------------------------------------------------------

const SLAB_SIZE = 50.4;        // grew 20% to make room for streets around blocks
const SLAB_THICKNESS = 2.7;    // 3x thicker so the slab reads as a substantial base
const SLAB_HALF = SLAB_SIZE / 2;

// Blocks use ~83% of their cell area. The remaining ~17% becomes street / air
// between buildings so the composition reads as a city with breathing room,
// not a dense matrix.
const BLOCK_SHRINK = 0.833;

// ---------------------------------------------------------------------------
// 3D layer plan — explicit Y coords prevent z-fighting. Each layer has a
// guaranteed separation from the next, and secondary building components
// (tower cores, market spines, museum ribs) sit slightly above their base top.
// ---------------------------------------------------------------------------
const LAYERS = {
  slabTop:   0.000,  // slab surface
  grid:      0.012,  // BIM datum grid on the slab
  roadBot:   0.020,  // road bottom
  roadTop:   0.060,  // road top
  surfBot:   0.030,  // ground surface bottom (parks/plazas)
  surfTop:   0.080,  // ground surface top
  waterBot:  0.030,  // river bottom (slight recess feel)
  waterTop:  0.180,  // river top
  bridgeBot: 0.180,  // bridge bottom (sits on the water)
  bridgeTop: 0.480,
  buildingBase: 0.090, // buildings sit above the ground layer
  componentLift: 0.010, // tower cores, spines, ribs float above their base
} as const;

// Plan-coord range from the blueprint SVG (40..760)
const PLAN_MIN = 40;
const PLAN_MAX = 760;
const PLAN_RANGE = PLAN_MAX - PLAN_MIN;
const SCALE = SLAB_SIZE / PLAN_RANGE;

const toX = (planX: number): number =>
  (planX - PLAN_MIN - PLAN_RANGE / 2) * SCALE;
const toZ = (planY: number): number =>
  (planY - PLAN_MIN - PLAN_RANGE / 2) * SCALE;
const toW = (planSize: number): number => planSize * SCALE * BLOCK_SHRINK;
// Full (un-shrunk) plan-to-world size — for ground-level infrastructure that
// must fill its plan area exactly: slab, water, roads, bridges.
const toWFull = (planSize: number): number => planSize * SCALE;

// Building heights (world units). Tuned for a 42-unit slab.
const H = {
  towerA: 30,
  towerB: 36,
  towerTall: 42,
  civic: 11,
  opera: 9,
  concert: 7,
  museum: 13,
  market: 10,
  midBlock: 6,
  residential: 5,
  riverfront: 3,
  oldTownLow: 3.5,
  oldTownHigh: 5,
} as const;

// ---------------------------------------------------------------------------
// Disposal tracker
// ---------------------------------------------------------------------------

class DisposalTracker {
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(thing: T): T {
    if ((thing as THREE.BufferGeometry).isBufferGeometry) {
      this.geometries.push(thing as unknown as THREE.BufferGeometry);
    } else if ((thing as THREE.Material).isMaterial) {
      this.materials.push(thing as unknown as THREE.Material);
    } else if ((thing as THREE.Texture).isTexture) {
      this.textures.push(thing as unknown as THREE.Texture);
    }
    return thing;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries = [];
    this.materials = [];
    this.textures = [];
  }
}

// ---------------------------------------------------------------------------
// Scene context — shared across builders so they can register animatables
// and outline materials in one place.
// ---------------------------------------------------------------------------

interface RisingBuilding {
  mesh: THREE.Object3D;
  finalY: number;
  height: number;
  delay: number;
}

// Modular building components, for phased construction reveal
interface BuildingModules {
  plinth: THREE.Mesh;
  columns: THREE.Mesh[];
  slabs: THREE.Mesh[];
  body: THREE.Mesh;
  cornice: THREE.Mesh;
  parapet: THREE.Mesh;
  roof: THREE.Mesh | null;
}

interface RevealedBuilding {
  modules: BuildingModules;
  delay: number;
  duration: number;
}

interface CraneState {
  top: THREE.Group;       // rotating top of the crane (jib + counter-jib + cabin)
  cranePosX: number;      // crane mast world x
  cranePosZ: number;      // crane mast world z
  mastTopY: number;       // world y of the crane mast top
  maxRadius: number;      // jib length (trolley can't reach past this)
  pickupAngle: number;
  pickupRadius: number;
  stackBaseY: number;     // world y of civic hall roof (stack base)
  boxSize: number;
  material: THREE.Material;
  scene: THREE.Scene;
  stackBoxes: THREE.Mesh[];
  activeBox: THREE.Mesh | null;
  currentDest: {
    x: number;
    y: number;
    z: number;
    angle: number;
    radius: number;
  } | null;
  cycleStart: number;
  cycleDuration: number;
}

interface SceneCtx {
  tracker: DisposalTracker;
  outlineMaterials: LineMaterial[];
  waterMaterials: THREE.ShaderMaterial[];
  rising: RisingBuilding[];
  revealed: RevealedBuilding[];
  windowTex: THREE.Texture | null;
  crane: CraneState | null;
}

// Procedural window-grid texture — dark punched windows on a white base so
// the material color tint shows through. Tiles cleanly so proportional UV
// repeats give each facade the right number of floors/bays.
function makeWindowColorTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Facade base — white, so material color tints through
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const cols = 4;
  const rows = 5;
  const cellW = size / cols;
  const cellH = size / rows;
  const winW = cellW * 0.52;
  const winH = cellH * 0.66;

  // Punched windows — deep navy
  ctx.fillStyle = '#21263a';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * cellW + cellW / 2;
      const cy = r * cellH + cellH / 2;
      ctx.fillRect(cx - winW / 2, cy - winH / 2, winW, winH);
    }
  }

  // Faint pilaster stripes — every other column, translucent ink
  ctx.fillStyle = 'rgba(33, 38, 58, 0.14)';
  for (let c = 1; c < cols; c += 2) {
    const x = c * cellW - 1;
    ctx.fillRect(x, 0, 2, size);
  }

  // Floor lines — every 2 rows
  ctx.strokeStyle = 'rgba(33, 38, 58, 0.18)';
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

// Oasia window texture — rust/terracotta-shaded windows on the red mesh
function makeOasiaWindowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Base — white so the material's red color tints through as the mesh
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const cols = 4;
  const rows = 5;
  const cellW = size / cols;
  const cellH = size / rows;
  const winW = cellW * 0.54;
  const winH = cellH * 0.68;

  // 4 terracotta / rust shades
  const shades = ['#5a1f12', '#7a2b1a', '#8c3622', '#a3452a'];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * cellW + cellW / 2;
      const cy = r * cellH + cellH / 2;
      ctx.fillStyle = shades[(r * cols + c) % shades.length];
      ctx.fillRect(cx - winW / 2, cy - winH / 2, winW, winH);
    }
  }

  // Faint vertical ribs — rust tone
  ctx.fillStyle = 'rgba(110, 38, 24, 0.22)';
  for (let c = 1; c < cols; c += 2) {
    const x = c * cellW - 1;
    ctx.fillRect(x, 0, 2, size);
  }

  // Horizontal string courses — rust tone
  ctx.strokeStyle = 'rgba(110, 38, 24, 0.24)';
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

// Iron red — the scaffolding / steel structure tone
const SCAFFOLD_COLOR = 0x8b2e1f;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function updateConstructionPhase(m: BuildingModules, t: number): void {
  // Plinth 0.00 → 0.04
  m.plinth.visible = t >= 0;
  m.plinth.scale.y = smoothstep(0, 0.04, t);

  // Columns 0.04 → 0.16, staggered
  for (let i = 0; i < m.columns.length; i++) {
    const start = 0.04 + i * 0.025;
    const end = start + 0.05;
    m.columns[i].visible = t >= start;
    m.columns[i].scale.y = smoothstep(start, end, t);
  }

  // Slabs 0.16 → 0.28, staggered
  for (let i = 0; i < m.slabs.length; i++) {
    const start = 0.16 + i * 0.03;
    const end = start + 0.04;
    m.slabs[i].visible = t >= start;
    m.slabs[i].scale.y = smoothstep(start, end, t);
  }

  // Body 0.28 → 0.66 (grows to full height, occluding the frame)
  m.body.visible = t >= 0.28;
  m.body.scale.y = smoothstep(0.28, 0.66, t);

  // Cornice 0.66 → 0.72
  m.cornice.visible = t >= 0.66;
  m.cornice.scale.y = smoothstep(0.66, 0.72, t);

  // Parapet 0.72 → 0.78
  m.parapet.visible = t >= 0.72;
  m.parapet.scale.y = smoothstep(0.72, 0.78, t);

  // Roof cap 0.78 → 0.84
  if (m.roof) {
    m.roof.visible = t >= 0.78;
    m.roof.scale.y = smoothstep(0.78, 0.84, t);
  }
}

function hideModules(m: BuildingModules): void {
  m.plinth.visible = false;
  m.body.visible = false;
  m.cornice.visible = false;
  m.parapet.visible = false;
  if (m.roof) m.roof.visible = false;
  for (const c of m.columns) c.visible = false;
  for (const s of m.slabs) s.visible = false;
}

// ---------------------------------------------------------------------------
// Hairline outlines (BIM signature)
// ---------------------------------------------------------------------------

function createOutlineMaterial(
  ctx: SceneCtx,
  linewidth: number,
  color: number = PALETTE.outline,
): LineMaterial {
  const mat = new LineMaterial({
    color,
    linewidth,
    worldUnits: false,
    dashed: false,
    alphaToCoverage: false,
    transparent: false,
    depthTest: true,
    toneMapped: false,
  });
  mat.resolution.set(window.innerWidth, window.innerHeight);
  ctx.tracker.track(mat);
  ctx.outlineMaterials.push(mat);
  return mat;
}

function attachOutline(
  mesh: THREE.Mesh,
  ctx: SceneCtx,
  linewidth = 2.0,
): void {
  const edges = ctx.tracker.track(new THREE.EdgesGeometry(mesh.geometry, 18));
  const lineGeom = new LineSegmentsGeometry().fromEdgesGeometry(edges);
  ctx.tracker.track(lineGeom as unknown as THREE.BufferGeometry);
  const mat = createOutlineMaterial(ctx, linewidth);
  const lines = new LineSegments2(lineGeom, mat);
  lines.computeLineDistances();
  lines.renderOrder = 2;
  mesh.add(lines);
}

// ---------------------------------------------------------------------------
// Water shader — animated noise ripple, fresnel-tinted, blends two navys
// ---------------------------------------------------------------------------

const WATER_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorDeep;
  uniform vec3 uColorShallow;
  uniform vec3 uHighlight;
  uniform vec3 uCameraPos;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    // Two slow-moving noise layers create the ripple
    vec2 uv = vUv * 14.0;
    float n1 = vnoise(uv + vec2(uTime * 0.07, uTime * 0.04));
    float n2 = vnoise(uv * 1.7 - vec2(uTime * 0.05, uTime * 0.08));
    float ripple = n1 * 0.6 + n2 * 0.4;

    vec3 col = mix(uColorDeep, uColorShallow, smoothstep(0.30, 0.78, ripple));

    // Soft highlight — gentle multiplier so it doesn't read as Sketchup
    col += uHighlight * smoothstep(0.68, 0.92, ripple) * 0.35;

    // Fresnel rim — subtle at grazing angles
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float fresnel = pow(1.0 - max(dot(viewDir, vWorldNormal), 0.0), 3.0);
    col += uHighlight * fresnel * 0.18;

    gl_FragColor = vec4(col, 0.96);
  }
`;

function makeWaterMaterial(ctx: SceneCtx): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:         { value: 0 },
      uColorDeep:    { value: new THREE.Color(0x7ea4c0) },
      uColorShallow: { value: new THREE.Color(0xa8c8dc) },
      uHighlight:    { value: new THREE.Color(0xc8dae6) },
      uCameraPos:    { value: new THREE.Vector3() },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: true,
  });
  ctx.tracker.track(mat);
  ctx.waterMaterials.push(mat);
  return mat;
}

// ---------------------------------------------------------------------------
// Slab + grid (Phase A foundation, kept)
// ---------------------------------------------------------------------------

function buildSlab(ctx: SceneCtx): THREE.Group {
  const group = new THREE.Group();
  const topMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: PALETTE.slab, roughness: 0.9, metalness: 0 }),
  );
  const sideMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: PALETTE.slabSide, roughness: 0.95, metalness: 0 }),
  );
  const mats: THREE.Material[] = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];

  // The slab is split into 3 rectangles around the river's L-shape so the
  // river geometry can drop into the gap and show as a section cut at the
  // slab edges.
  const makePiece = (
    planX: number,
    planY: number,
    planW: number,
    planH: number,
  ): THREE.Mesh => {
    const geom = ctx.tracker.track(
      new THREE.BoxGeometry(toWFull(planW), SLAB_THICKNESS, toWFull(planH)),
    );
    const mesh = new THREE.Mesh(geom, mats);
    mesh.position.set(
      toX(planX + planW / 2),
      -SLAB_THICKNESS / 2,
      toZ(planY + planH / 2),
    );
    mesh.receiveShadow = true;
    return mesh;
  };

  // West — full north-south strip west of the vertical river
  group.add(makePiece(40, 40, 120, 720));
  // NE — east of vertical river, north of horizontal river
  group.add(makePiece(220, 40, 540, 340));
  // South — south of horizontal river, full width minus the west piece
  group.add(makePiece(160, 440, 600, 320));

  return group;
}

function buildGridLines(ctx: SceneCtx): THREE.Object3D {
  // 6 cell columns + cell rows = 7 lines per axis
  const positions: number[] = [];
  const y = LAYERS.grid;
  const cellPlanSize = 120; // matches the blueprint
  const cellWorld = toWFull(cellPlanSize);
  const lines = SLAB_SIZE / cellWorld;
  for (let i = 0; i <= lines; i++) {
    const c = -SLAB_HALF + i * cellWorld;
    positions.push(c, y, -SLAB_HALF, c, y, SLAB_HALF);
    positions.push(-SLAB_HALF, y, c, SLAB_HALF, y, c);
  }
  const lineGeom = new LineSegmentsGeometry();
  lineGeom.setPositions(positions);
  ctx.tracker.track(lineGeom as unknown as THREE.BufferGeometry);
  const mat = createOutlineMaterial(ctx, 0.9, 0x3a4160);
  const obj = new LineSegments2(lineGeom, mat);
  obj.computeLineDistances();
  obj.renderOrder = 1;
  return obj;
}

// ---------------------------------------------------------------------------
// Roads + ground surfaces
// ---------------------------------------------------------------------------

function buildRoadsAndSurfaces(ctx: SceneCtx): THREE.Group {
  const group = new THREE.Group();
  const ROAD_Y = LAYERS.roadBot;
  const ROAD_HEIGHT = LAYERS.roadTop - LAYERS.roadBot;
  const SURF_Y = LAYERS.surfBot;
  const SURF_HEIGHT = LAYERS.surfTop - LAYERS.surfBot;

  const flatBox = (
    planX: number,
    planY: number,
    planW: number,
    planH: number,
    height: number,
    color: number,
    yBase: number,
  ): THREE.Mesh => {
    const geom = ctx.tracker.track(
      new THREE.BoxGeometry(toWFull(planW), height, toWFull(planH)),
    );
    const mat = ctx.tracker.track(
      new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 }),
    );
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(toX(planX + planW / 2), yBase + height / 2, toZ(planY + planH / 2));
    mesh.receiveShadow = true;
    return mesh;
  };

  // 5 N-S + 5 E-W roads (12 wide), full slab span. River will overdraw later.
  for (const x of [154, 274, 394, 514, 634]) {
    group.add(flatBox(x, 40, 12, 720, ROAD_HEIGHT, PALETTE.road, ROAD_Y));
  }
  for (const y of [154, 274, 394, 514, 634]) {
    group.add(flatBox(40, y, 720, 12, ROAD_HEIGHT, PALETTE.road, ROAD_Y));
  }

  // West Bank park (extends from slab edge through to river bank)
  group.add(flatBox(40, 40, 120, 400, SURF_HEIGHT, PALETTE.park, SURF_Y));
  // Botanical Gardens
  group.add(flatBox(286, 40, 108, 114, SURF_HEIGHT, PALETTE.park, SURF_Y));
  // Plaza C2
  group.add(flatBox(286, 166, 108, 108, SURF_HEIGHT, PALETTE.paving, SURF_Y));
  // Town Square
  group.add(flatBox(286, 526, 228, 108, SURF_HEIGHT, PALETTE.paving, SURF_Y));

  return group;
}

// ---------------------------------------------------------------------------
// River (custom shader) + bridges
// ---------------------------------------------------------------------------

function buildRiver(ctx: SceneCtx): THREE.Group {
  const group = new THREE.Group();
  const waterMat = makeWaterMaterial(ctx);

  // Water extends from slab bottom to just above the slab top so the section
  // cut at the slab edge shows the full river body as a thick end.
  const waterBottom = -SLAB_THICKNESS;
  const waterTopLocal = 0.15;
  const waterHeight = waterTopLocal - waterBottom;
  const waterCenterY = (waterBottom + waterTopLocal) / 2;

  const waterBox = (
    planX: number,
    planY: number,
    planW: number,
    planH: number,
  ): THREE.Mesh => {
    const geom = ctx.tracker.track(
      new THREE.BoxGeometry(toWFull(planW), waterHeight, toWFull(planH)),
    );
    const mesh = new THREE.Mesh(geom, waterMat);
    mesh.position.set(
      toX(planX + planW / 2),
      waterCenterY,
      toZ(planY + planH / 2),
    );
    mesh.receiveShadow = true;
    return mesh;
  };

  // Non-overlapping L — vertical stops where horizontal begins; horizontal
  // carries the L corner. 90° clean junction, no weird overlap at the bend.
  group.add(waterBox(160, 40, 60, 340));   // vertical: x=160-220, y=40-380
  group.add(waterBox(160, 380, 600, 60));  // horizontal: x=160-760, y=380-440

  return group;
}

function buildBridges(ctx: SceneCtx): THREE.Group {
  const group = new THREE.Group();
  const bridgeMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.82, metalness: 0.08 }),
  );

  const bridgeHeight = LAYERS.bridgeTop - LAYERS.bridgeBot;
  const bridgeCenterY = (LAYERS.bridgeBot + LAYERS.bridgeTop) / 2;

  const bridge = (planX: number, planY: number, planW: number, planH: number): THREE.Mesh => {
    const geom = ctx.tracker.track(
      new THREE.BoxGeometry(toWFull(planW), bridgeHeight, toWFull(planH)),
    );
    const mesh = new THREE.Mesh(geom, bridgeMat);
    mesh.position.set(toX(planX + planW / 2), bridgeCenterY, toZ(planY + planH / 2));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    attachOutline(mesh, ctx, 1.4);
    return mesh;
  };

  group.add(bridge(160, 200, 60, 28));   // BR-1 across vertical river
  group.add(bridge(460, 380, 28, 60));   // BR-2 across horizontal river

  return group;
}

// ---------------------------------------------------------------------------
// Building helpers — register every building as a "rising" animation target
// ---------------------------------------------------------------------------

function registerRising(
  ctx: SceneCtx,
  mesh: THREE.Object3D,
  height: number,
  finalY: number,
  delay: number,
): void {
  ctx.rising.push({ mesh, finalY, height, delay });
}

// Build a modular mass at the local origin (plinth bottom at y=0).
// Returns the group (unpositioned) and the modules for phased reveal.
interface ModularOpts {
  bodyColor: number;
  scaffoldColor?: number;
  stoneColor?: number;
  roofStyle?: 'flat' | 'pyramid' | 'chamfered';
  greenRoof?: boolean;
  waterTower?: boolean;
  outlineWidth?: number;
}

interface ModularResult {
  group: THREE.Group;
  modules: BuildingModules;
  totalHeight: number;
}

function buildModularMass(
  ctx: SceneCtx,
  w: number,
  d: number,
  h: number,
  opts: ModularOpts,
): ModularResult {
  const group = new THREE.Group();

  const plinthH = 0.35;
  const corniceH = 0.22;
  const parapetH = 0.30;
  const bodyH = Math.max(0.8, h - plinthH - corniceH - parapetH);

  const outlineW = opts.outlineWidth ?? 1.5;

  // Per-building clone of the window texture so each facade can set its own
  // UV repeat without fighting with others.
  const bodyTex = ctx.windowTex ? ctx.windowTex.clone() : null;
  if (bodyTex) {
    bodyTex.needsUpdate = true;
    bodyTex.wrapS = THREE.RepeatWrapping;
    bodyTex.wrapT = THREE.RepeatWrapping;
    bodyTex.magFilter = THREE.NearestFilter;
    ctx.tracker.track(bodyTex);
  }

  const bodyMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: opts.bodyColor,
      map: bodyTex ?? undefined,
      roughness: 0.86,
      metalness: 0,
    }),
  );
  const stoneMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: opts.stoneColor ?? PALETTE.boneDeep,
      roughness: 0.9,
      metalness: 0,
    }),
  );
  const scaffoldMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: opts.scaffoldColor ?? SCAFFOLD_COLOR,
      roughness: 0.72,
      metalness: 0.25,
    }),
  );

  // --- Plinth (footing) ---
  const plinthGeom = ctx.tracker.track(
    new THREE.BoxGeometry(w + 0.25, plinthH, d + 0.25),
  );
  plinthGeom.translate(0, plinthH / 2, 0);
  const plinth = new THREE.Mesh(plinthGeom, stoneMat);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  attachOutline(plinth, ctx, 1.2);
  group.add(plinth);

  // --- Scaffolding: 4 corner columns (inset 2cm inside the body walls so
  //     edge lines don't fight with the body's corner edges) ---
  const colW = Math.min(0.24, Math.min(w, d) * 0.08);
  const colInset = 0.02;
  const columns: THREE.Mesh[] = [];
  const colPositions: Array<[number, number]> = [
    [-w / 2 + colW / 2 + colInset, -d / 2 + colW / 2 + colInset],
    [w / 2 - colW / 2 - colInset, -d / 2 + colW / 2 + colInset],
    [w / 2 - colW / 2 - colInset, d / 2 - colW / 2 - colInset],
    [-w / 2 + colW / 2 + colInset, d / 2 - colW / 2 - colInset],
  ];
  for (const [cx, cz] of colPositions) {
    const colGeom = ctx.tracker.track(new THREE.BoxGeometry(colW, bodyH, colW));
    colGeom.translate(cx, plinthH + bodyH / 2, cz);
    const col = new THREE.Mesh(colGeom, scaffoldMat);
    col.castShadow = true;
    attachOutline(col, ctx, 0.8);
    group.add(col);
    columns.push(col);
  }

  // --- Scaffolding: horizontal floor slabs ---
  const slabs: THREE.Mesh[] = [];
  const slabCount = Math.max(1, Math.min(3, Math.floor(bodyH / 3)));
  const slabH = 0.07;
  for (let i = 0; i < slabCount; i++) {
    const slabGeom = ctx.tracker.track(
      new THREE.BoxGeometry(Math.max(0.1, w - colW * 2), slabH, Math.max(0.1, d - colW * 2)),
    );
    const fraction = (i + 1) / (slabCount + 1);
    slabGeom.translate(0, plinthH + bodyH * fraction, 0);
    const slab = new THREE.Mesh(slabGeom, scaffoldMat);
    slab.castShadow = true;
    attachOutline(slab, ctx, 0.7);
    group.add(slab);
    slabs.push(slab);
  }

  // Tiny Y offsets between stacked modules so their faces and edge lines
  // never share a plane with the module below (kills coplanar z-fighting).
  const LIFT_BODY = 0.005;
  const LIFT_CORNICE = 0.010;
  const LIFT_PARAPET = 0.015;
  const LIFT_ROOF = 0.020;

  // --- Body ---
  const bodyGeom = ctx.tracker.track(new THREE.BoxGeometry(w, bodyH, d));

  // Proportional window UVs — the window grid repeats per ~2.4 world units
  // of facade width, per ~2.6 units of facade height. Top/bottom faces stay
  // at the base UV so windows don't paint the roof.
  const uvs = bodyGeom.attributes.uv as THREE.BufferAttribute;
  const repU_wd = Math.max(1, Math.round(d / 2.4));
  const repU_ww = Math.max(1, Math.round(w / 2.4));
  const repV_face = Math.max(1, Math.round(bodyH / 2.6));
  for (let i = 0; i < uvs.count; i++) {
    const faceIdx = Math.floor(i / 4);
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    let repU = 1;
    let repV = 1;
    if (faceIdx === 0 || faceIdx === 1) {
      // +X / -X faces — width comes from d, height from bodyH
      repU = repU_wd;
      repV = repV_face;
    } else if (faceIdx === 4 || faceIdx === 5) {
      // +Z / -Z faces
      repU = repU_ww;
      repV = repV_face;
    } else {
      // top/bottom — crush UVs so texture reads as a flat tint
      repU = 0.02;
      repV = 0.02;
    }
    uvs.setXY(i, u * repU, v * repV);
  }
  uvs.needsUpdate = true;

  bodyGeom.translate(0, plinthH + LIFT_BODY + bodyH / 2, 0);
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  attachOutline(body, ctx, outlineW);
  group.add(body);

  // --- Cornice ---
  const corniceGeom = ctx.tracker.track(
    new THREE.BoxGeometry(w + 0.12, corniceH, d + 0.12),
  );
  corniceGeom.translate(0, plinthH + bodyH + LIFT_CORNICE + corniceH / 2, 0);
  const cornice = new THREE.Mesh(corniceGeom, stoneMat);
  cornice.castShadow = true;
  cornice.receiveShadow = true;
  attachOutline(cornice, ctx, 1.2);
  group.add(cornice);

  // --- Parapet ---
  const parapetGeom = ctx.tracker.track(
    new THREE.BoxGeometry(w + 0.22, parapetH, d + 0.22),
  );
  parapetGeom.translate(0, plinthH + bodyH + corniceH + LIFT_PARAPET + parapetH / 2, 0);
  const parapet = new THREE.Mesh(parapetGeom, stoneMat);
  parapet.castShadow = true;
  parapet.receiveShadow = true;
  attachOutline(parapet, ctx, 1.2);
  group.add(parapet);

  // --- Optional roof cap ---
  let roof: THREE.Mesh | null = null;
  const roofBase = plinthH + bodyH + corniceH + parapetH + LIFT_ROOF;

  if (opts.greenRoof) {
    // Low-poly planted roof: slightly inset green plate + a few bushes
    const greenMat = ctx.tracker.track(
      new THREE.MeshStandardMaterial({ color: 0x6a8c4f, roughness: 0.95, metalness: 0 }),
    );
    const plateGeom = ctx.tracker.track(
      new THREE.BoxGeometry(w - 0.15, 0.12, d - 0.15),
    );
    plateGeom.translate(0, roofBase + 0.06, 0);
    const plate = new THREE.Mesh(plateGeom, greenMat);
    plate.castShadow = true;
    plate.receiveShadow = true;
    attachOutline(plate, ctx, 1.0);
    group.add(plate);
    roof = plate;

    // Low-poly bushes (octahedrons) on the plate
    const bushMat = ctx.tracker.track(
      new THREE.MeshStandardMaterial({ color: 0x557a3e, roughness: 0.93, metalness: 0 }),
    );
    const bushCount = 3 + Math.floor((w * d) / 4);
    for (let i = 0; i < bushCount; i++) {
      const bushGeom = ctx.tracker.track(new THREE.OctahedronGeometry(0.22 + Math.random() * 0.12, 0));
      const bush = new THREE.Mesh(bushGeom, bushMat);
      bush.position.set(
        (Math.random() - 0.5) * (w - 0.5),
        roofBase + 0.22,
        (Math.random() - 0.5) * (d - 0.5),
      );
      bush.rotation.y = Math.random() * Math.PI;
      bush.castShadow = true;
      plate.add(bush);  // attach to plate so they animate with roof
    }
  } else if (opts.roofStyle === 'pyramid') {
    const capR = Math.min(w, d) * 0.55;
    const capH = Math.min(w, d) * 0.5;
    const rg = ctx.tracker.track(new THREE.ConeGeometry(capR, capH, 4));
    rg.rotateY(Math.PI / 4);
    rg.translate(0, roofBase + capH / 2, 0);
    roof = new THREE.Mesh(rg, stoneMat);
    roof.castShadow = true;
    attachOutline(roof, ctx, 1.3);
    group.add(roof);
  } else if (opts.roofStyle === 'chamfered') {
    const bottomR = Math.min(w, d) * 0.55;
    const topR = Math.min(w, d) * 0.3;
    const capH = Math.min(w, d) * 0.35;
    const rg = ctx.tracker.track(new THREE.CylinderGeometry(topR, bottomR, capH, 4));
    rg.rotateY(Math.PI / 4);
    rg.translate(0, roofBase + capH / 2, 0);
    roof = new THREE.Mesh(rg, stoneMat);
    roof.castShadow = true;
    attachOutline(roof, ctx, 1.3);
    group.add(roof);
  } else if (opts.waterTower && !opts.greenRoof) {
    // Low-poly water tower — 4 iron-red legs, wooden tank, small cone cap.
    // Attached to the parapet so it scales with the final reveal phase.
    const legMat = ctx.tracker.track(
      new THREE.MeshStandardMaterial({ color: SCAFFOLD_COLOR, roughness: 0.72, metalness: 0.3 }),
    );
    const tankMat = ctx.tracker.track(
      new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.92, metalness: 0 }),
    );

    const span = Math.min(w, d) * 0.35;
    const legH = Math.min(1.1, Math.min(w, d) * 0.4);
    const tankR = span * 0.7;
    const tankH = Math.min(1.2, Math.min(w, d) * 0.5);
    const capH = tankH * 0.35;

    // Local y is relative to parapet mesh origin (0,0,0). Parapet geometry
    // sits at world y = roofBase (via translate earlier). Water tower sits
    // just above it — in parapet-local coords that's (roofBase + something).
    const baseY = roofBase + 0.05;

    for (const [lx, lz] of [
      [-span / 2, -span / 2],
      [span / 2, -span / 2],
      [span / 2, span / 2],
      [-span / 2, span / 2],
    ]) {
      const legGeom = ctx.tracker.track(new THREE.BoxGeometry(0.08, legH, 0.08));
      legGeom.translate(lx, baseY + legH / 2, lz);
      const leg = new THREE.Mesh(legGeom, legMat);
      leg.castShadow = true;
      parapet.add(leg);
    }

    const tankGeom = ctx.tracker.track(new THREE.CylinderGeometry(tankR, tankR, tankH, 6));
    tankGeom.translate(0, baseY + legH + tankH / 2, 0);
    const tank = new THREE.Mesh(tankGeom, tankMat);
    tank.castShadow = true;
    tank.receiveShadow = true;
    parapet.add(tank);

    const capGeom = ctx.tracker.track(new THREE.ConeGeometry(tankR * 1.05, capH, 6));
    capGeom.translate(0, baseY + legH + tankH + capH / 2, 0);
    const cap = new THREE.Mesh(capGeom, tankMat);
    cap.castShadow = true;
    parapet.add(cap);
  }

  const totalHeight = roofBase + (roof ? 1 : 0);
  return {
    group,
    modules: { plinth, columns, slabs, body, cornice, parapet, roof },
    totalHeight,
  };
}

// planBox — thin wrapper around buildModularMass that positions the group.
// Pass animate=true to make the building rise through the construction phases;
// false leaves it fully built from scene start. duration controls how slow
// that reveal plays.
function planBox(
  ctx: SceneCtx,
  planX: number,
  planY: number,
  planW: number,
  planH: number,
  height: number,
  color: number,
  delay: number,
  outlineWidth = 1.6,
  greenRoof = false,
  animate = false,
  duration = 3.0,
  waterTower = false,
  stoneColor?: number,
): THREE.Group {
  const { group, modules } = buildModularMass(ctx, toW(planW), toW(planH), height, {
    bodyColor: color,
    stoneColor,
    outlineWidth,
    greenRoof,
    waterTower,
  });
  group.position.set(toX(planX + planW / 2), LAYERS.buildingBase, toZ(planY + planH / 2));
  if (animate) {
    ctx.revealed.push({ modules, delay, duration });
  }
  return group;
}

// Modular tower — plinth/body/cornice/parapet with iron-red scaffolding
function planTower(
  ctx: SceneCtx,
  planX: number,
  planY: number,
  planW: number,
  planH: number,
  height: number,
  delay: number,
): THREE.Group {
  const { group, modules } = buildModularMass(ctx, toW(planW), toW(planH), height, {
    bodyColor: PALETTE.tower,
    outlineWidth: 1.8,
  });
  group.position.set(toX(planX + planW / 2), LAYERS.buildingBase, toZ(planY + planH / 2));
  ctx.revealed.push({ modules, delay, duration: 3.2 });
  return group;
}

// Willis-style stepped high-rise — three stacked modular masses with
// decreasing footprint, so the scaffolding and ledges read as setbacks.
function planWillisTower(
  ctx: SceneCtx,
  planX: number,
  planY: number,
  planW: number,
  planH: number,
  totalHeight: number,
  delay: number,
): THREE.Group {
  const group = new THREE.Group();

  const w1 = toW(planW);
  const d1 = toW(planH);
  const h1 = totalHeight * 0.48;

  const w2 = w1 * 0.78;
  const d2 = d1 * 0.78;
  const h2 = totalHeight * 0.30;

  const w3 = w1 * 0.56;
  const d3 = d1 * 0.56;
  const h3 = totalHeight * 0.22;

  const sec1 = buildModularMass(ctx, w1, d1, h1, {
    bodyColor: PALETTE.tower,
    outlineWidth: 1.8,
  });
  sec1.group.position.y = 0;
  group.add(sec1.group);

  const sec2 = buildModularMass(ctx, w2, d2, h2, {
    bodyColor: PALETTE.tower,
    outlineWidth: 1.7,
  });
  sec2.group.position.y = h1;
  group.add(sec2.group);

  const sec3 = buildModularMass(ctx, w3, d3, h3, {
    bodyColor: PALETTE.tower,
    outlineWidth: 1.6,
  });
  sec3.group.position.y = h1 + h2;
  group.add(sec3.group);

  // Slender antenna masts on top — attached to sec3's parapet so they
  // scale and hide with the top section's reveal (no floating antennas).
  const antMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: SCAFFOLD_COLOR, roughness: 0.72, metalness: 0.3 }),
  );
  const mastH = totalHeight * 0.14;
  for (const sx of [-0.3, 0.3]) {
    const mastGeom = ctx.tracker.track(new THREE.CylinderGeometry(0.08, 0.08, mastH, 6));
    // Position is in sec3.modules.parapet local space. Parapet is at the
    // top of sec3; the antenna sits just above it.
    mastGeom.translate(sx * w3 * 0.4, h3 + mastH / 2, 0);
    const mast = new THREE.Mesh(mastGeom, antMat);
    mast.castShadow = true;
    sec3.modules.parapet.add(mast);
  }

  group.position.set(toX(planX + planW / 2), LAYERS.buildingBase, toZ(planY + planH / 2));

  // Stagger each section so it reads as bottom-up construction
  ctx.revealed.push({ modules: sec1.modules, delay,        duration: 3.0 });
  ctx.revealed.push({ modules: sec2.modules, delay: delay + 0.8, duration: 2.5 });
  ctx.revealed.push({ modules: sec3.modules, delay: delay + 1.4, duration: 2.0 });

  return group;
}

// Oasia-inspired tower — muted green body with horizontal terrace bands
// suggesting a plant-wrapped facade. Still a single massing for scaffolding
// stage; the real mesh-facade detail comes later.
function planOasiaTower(
  ctx: SceneCtx,
  planX: number,
  planY: number,
  planW: number,
  planH: number,
  height: number,
  delay: number,
): THREE.Group {
  const group = new THREE.Group();

  // Body — warm red aluminum mesh with terracotta / rust windows
  const bodyTex = ctx.tracker.track(makeOasiaWindowTexture());
  const bodyMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: 0xa23a2a,
      map: bodyTex ?? undefined,
      roughness: 0.68,
      metalness: 0.22,
    }),
  );
  const bodyGeom = ctx.tracker.track(
    new THREE.BoxGeometry(toW(planW), height, toW(planH)),
  );

  // Proportional window UVs
  const uvs = bodyGeom.attributes.uv as THREE.BufferAttribute;
  const ww = toW(planW);
  const wd = toW(planH);
  const repU_wd = Math.max(1, Math.round(wd / 2.4));
  const repU_ww = Math.max(1, Math.round(ww / 2.4));
  const repV_face = Math.max(1, Math.round(height / 2.6));
  for (let i = 0; i < uvs.count; i++) {
    const faceIdx = Math.floor(i / 4);
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    let rU = 1;
    let rV = 1;
    if (faceIdx === 0 || faceIdx === 1) {
      rU = repU_wd;
      rV = repV_face;
    } else if (faceIdx === 4 || faceIdx === 5) {
      rU = repU_ww;
      rV = repV_face;
    } else {
      rU = 0.02;
      rV = 0.02;
    }
    uvs.setXY(i, u * rU, v * rV);
  }
  uvs.needsUpdate = true;

  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  attachOutline(body, ctx, 1.8);
  group.add(body);

  // Foliage bands — green cascades growing through the red mesh at three levels
  const terraceMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x4e6d38, roughness: 0.94, metalness: 0 }),
  );
  const overhang = 0.35;
  const bandThickness = 0.5;
  const bandGeom = ctx.tracker.track(
    new THREE.BoxGeometry(toW(planW) + overhang * 2, bandThickness, toW(planH) + overhang * 2),
  );
  const levels = [0.25, 0.5, 0.75];
  for (const lvl of levels) {
    const band = new THREE.Mesh(bandGeom, terraceMat);
    band.position.y = -height / 2 + height * lvl;
    band.castShadow = true;
    band.receiveShadow = true;
    attachOutline(band, ctx, 1.2);
    group.add(band);
  }

  // Rooftop terrace — green planted surface covering the flat roof, with a
  // half-dome pergola rising from the middle in the red aluminum body tone.
  const terraceGeom = ctx.tracker.track(
    new THREE.BoxGeometry(toW(planW) * 0.96, 0.18, toW(planH) * 0.96),
  );
  const terrace = new THREE.Mesh(terraceGeom, terraceMat);
  terrace.position.y = height / 2 + 0.09;
  terrace.castShadow = true;
  terrace.receiveShadow = true;
  attachOutline(terrace, ctx, 1.3);
  group.add(terrace);

  const domeRadius = Math.min(toW(planW), toW(planH)) * 0.42;
  const domeGeom = ctx.tracker.track(
    new THREE.SphereGeometry(
      domeRadius,
      10,                  // width segments (low-poly)
      5,                   // height segments
      0, Math.PI * 2,      // full phi
      0, Math.PI / 2,      // theta 0..PI/2 → upper hemisphere
    ),
  );
  const dome = new THREE.Mesh(domeGeom, bodyMat);
  dome.position.y = height / 2 + 0.2;  // sits on top of the green terrace
  dome.castShadow = true;
  dome.receiveShadow = true;
  attachOutline(dome, ctx, 1.3);
  group.add(dome);

  const finalY = LAYERS.buildingBase + height / 2;
  group.position.set(toX(planX + planW / 2), finalY, toZ(planY + planH / 2));
  registerRising(ctx, group, height, finalY, delay);
  return group;
}

// Civic Hall — four box walls forming a rectangular ring around an open
// central courtyard. Much more reliable than ExtrudeGeometry-with-hole.
function planCivicHall(
  ctx: SceneCtx,
  planX: number,
  planY: number,
  planW: number,
  planH: number,
  height: number,
  courtyardW: number,
  courtyardH: number,
  delay: number,
): THREE.Group {
  const group = new THREE.Group();

  const ww = toW(planW);
  const wd = toW(planH);
  const cw = toW(courtyardW);
  const cd = toW(courtyardH);

  const wallThickZ = (wd - cd) / 2;   // N/S wall depth
  const wallThickX = (ww - cw) / 2;   // E/W wall width

  // Modern glass facade — blue-grey tint, low roughness, some metalness
  const mat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: 0x7a95b5,
      roughness: 0.14,
      metalness: 0.5,
    }),
  );

  const makeWall = (w: number, d: number, x: number, z: number): THREE.Mesh => {
    const geom = ctx.tracker.track(new THREE.BoxGeometry(w, height, d));
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    attachOutline(mesh, ctx, 1.6);
    return mesh;
  };

  // North wall — spans full width at +Z edge
  group.add(makeWall(ww, wallThickZ, 0, wd / 2 - wallThickZ / 2));
  // South wall — full width at -Z edge
  group.add(makeWall(ww, wallThickZ, 0, -wd / 2 + wallThickZ / 2));
  // East wall — only the courtyard depth, at +X edge
  group.add(makeWall(wallThickX, cd, ww / 2 - wallThickX / 2, 0));
  // West wall
  group.add(makeWall(wallThickX, cd, -ww / 2 + wallThickX / 2, 0));

  const cx = toX(planX + planW / 2);
  const cz = toZ(planY + planH / 2);
  group.position.set(cx, LAYERS.buildingBase, cz);

  registerRising(ctx, group, height, LAYERS.buildingBase, delay);
  return group;
}

// Blocky gate — two narrow pillars with a lintel beam sitting on top of
// them. Three separate meshes in one group; each gets its own outline so
// we never see edges from internal geometry merges.
function planBlackGate(
  ctx: SceneCtx,
  leftPlanX: number,
  rightPlanX: number,
  cellPlanW: number,
  planY: number,
  planH: number,
  totalHeight: number,
  delay: number,
): THREE.Group {
  const group = new THREE.Group();
  const mat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: 0x16161c,
      roughness: 0.8,
      metalness: 0.08,
    }),
  );

  const outerPlanSpan = rightPlanX + cellPlanW - leftPlanX;
  const outerW = toW(outerPlanSpan);
  const depth = toW(planH);
  const pillarW = toW(34);
  const pillarH = totalHeight;
  const beamH = totalHeight * 0.18;

  // Left pillar — outer edge flush with the west side of the span
  const leftGeom = ctx.tracker.track(new THREE.BoxGeometry(pillarW, pillarH, depth));
  const left = new THREE.Mesh(leftGeom, mat);
  left.position.set(-outerW / 2 + pillarW / 2, pillarH / 2, 0);
  left.castShadow = true;
  left.receiveShadow = true;
  attachOutline(left, ctx, 1.6);
  group.add(left);

  // Right pillar
  const rightGeom = ctx.tracker.track(new THREE.BoxGeometry(pillarW, pillarH, depth));
  const right = new THREE.Mesh(rightGeom, mat);
  right.position.set(outerW / 2 - pillarW / 2, pillarH / 2, 0);
  right.castShadow = true;
  right.receiveShadow = true;
  attachOutline(right, ctx, 1.6);
  group.add(right);

  // Lintel beam — on top of both pillars, spanning the full width.
  const beamGeom = ctx.tracker.track(new THREE.BoxGeometry(outerW, beamH, depth));
  const beam = new THREE.Mesh(beamGeom, mat);
  beam.position.set(0, pillarH + beamH / 2, 0);
  beam.castShadow = true;
  beam.receiveShadow = true;
  attachOutline(beam, ctx, 1.6);
  group.add(beam);

  const centerPlanX = (leftPlanX + rightPlanX + cellPlanW) / 2;
  const centerPlanY = planY + planH / 2;
  group.position.set(toX(centerPlanX), LAYERS.buildingBase, toZ(centerPlanY));

  const totalH = pillarH + beamH;
  registerRising(ctx, group, totalH, LAYERS.buildingBase, delay);
  return group;
}

// Market Hall — base box with a moderate 4-sided pyramidal cap, proportioned
// like the stave church's top (not obelisk-steep).
function planMarketHall(
  ctx: SceneCtx,
  planX: number,
  planY: number,
  planW: number,
  planH: number,
  height: number,
  delay: number,
): THREE.Group {
  const group = new THREE.Group();

  // Body material with window texture
  const bodyTex = ctx.windowTex ? ctx.windowTex.clone() : null;
  if (bodyTex) {
    bodyTex.needsUpdate = true;
    bodyTex.wrapS = THREE.RepeatWrapping;
    bodyTex.wrapT = THREE.RepeatWrapping;
    bodyTex.magFilter = THREE.NearestFilter;
    ctx.tracker.track(bodyTex);
  }
  const bodyMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: PALETTE.bone,
      map: bodyTex ?? undefined,
      roughness: 0.83,
      metalness: 0,
    }),
  );
  // Glass cap — same blue-grey as the civic hall facade
  const capMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: 0x7a95b5,
      roughness: 0.14,
      metalness: 0.5,
    }),
  );

  const w = toW(planW);
  const d = toW(planH);

  // Base with proportional window UVs
  const baseGeom = ctx.tracker.track(new THREE.BoxGeometry(w, height, d));
  const uvs = baseGeom.attributes.uv as THREE.BufferAttribute;
  const repU_wd = Math.max(1, Math.round(d / 2.4));
  const repU_ww = Math.max(1, Math.round(w / 2.4));
  const repV_face = Math.max(1, Math.round(height / 2.6));
  for (let i = 0; i < uvs.count; i++) {
    const faceIdx = Math.floor(i / 4);
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    let rU = 1;
    let rV = 1;
    if (faceIdx === 0 || faceIdx === 1) {
      rU = repU_wd;
      rV = repV_face;
    } else if (faceIdx === 4 || faceIdx === 5) {
      rU = repU_ww;
      rV = repV_face;
    } else {
      rU = 0.02;
      rV = 0.02;
    }
    uvs.setXY(i, u * rU, v * rV);
  }
  uvs.needsUpdate = true;

  const base = new THREE.Mesh(baseGeom, bodyMat);
  base.castShadow = true;
  base.receiveShadow = true;
  attachOutline(base, ctx, 1.8);
  group.add(base);

  // Moderate pyramidal cap — 4-sided cone, ~55% of min dimension tall
  const capH = Math.min(w, d) * 0.55;
  const capGeom = ctx.tracker.track(new THREE.ConeGeometry(0.5, 1, 4));
  capGeom.rotateY(Math.PI / 4);
  capGeom.scale(w, capH, d);
  capGeom.translate(0, capH / 2, 0);

  const cap = new THREE.Mesh(capGeom, capMat);
  cap.position.y = height / 2 + LAYERS.componentLift;
  cap.castShadow = true;
  cap.receiveShadow = true;
  attachOutline(cap, ctx, 1.4);
  group.add(cap);

  const finalY = LAYERS.buildingBase + height / 2;
  group.position.set(toX(planX + planW / 2), finalY, toZ(planY + planH / 2));
  registerRising(ctx, group, height + capH, finalY, delay);
  return group;
}

// Museum — long block with a moderate slanted roof. High side faces the
// tower cluster (NW), cut face slopes down to the SE (away from the towers).
function planMuseum(
  ctx: SceneCtx,
  planX: number,
  planY: number,
  planW: number,
  planH: number,
  height: number,
  delay: number,
): THREE.Group {
  const group = new THREE.Group();

  // Body material with window texture (proportional UVs applied below)
  const bodyTex = ctx.windowTex ? ctx.windowTex.clone() : null;
  if (bodyTex) {
    bodyTex.needsUpdate = true;
    bodyTex.wrapS = THREE.RepeatWrapping;
    bodyTex.wrapT = THREE.RepeatWrapping;
    bodyTex.magFilter = THREE.NearestFilter;
    ctx.tracker.track(bodyTex);
  }
  const bodyMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: PALETTE.bone,
      map: bodyTex ?? undefined,
      roughness: 0.82,
      metalness: 0,
    }),
  );
  // Glass wedge roof — matches the civic hall and market hall cap
  const roofMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: 0x7a95b5,
      roughness: 0.14,
      metalness: 0.5,
    }),
  );

  const w = toW(planW);
  const d = toW(planH);

  // Base
  const baseGeom = ctx.tracker.track(new THREE.BoxGeometry(w, height, d));
  // Proportional window UVs on the base
  const uvs = baseGeom.attributes.uv as THREE.BufferAttribute;
  const repU_wd = Math.max(1, Math.round(d / 2.4));
  const repU_ww = Math.max(1, Math.round(w / 2.4));
  const repV_face = Math.max(1, Math.round(height / 2.6));
  for (let i = 0; i < uvs.count; i++) {
    const faceIdx = Math.floor(i / 4);
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    let rU = 1;
    let rV = 1;
    if (faceIdx === 0 || faceIdx === 1) {
      rU = repU_wd;
      rV = repV_face;
    } else if (faceIdx === 4 || faceIdx === 5) {
      rU = repU_ww;
      rV = repV_face;
    } else {
      rU = 0.02;
      rV = 0.02;
    }
    uvs.setXY(i, u * rU, v * rV);
  }
  uvs.needsUpdate = true;

  const base = new THREE.Mesh(baseGeom, bodyMat);
  base.castShadow = true;
  base.receiveShadow = true;
  attachOutline(base, ctx, 1.8);
  group.add(base);

  // Slanted wedge roof — high at -Z (north, toward towers), low at +Z (south).
  // Top verts at +Z are collapsed to the bottom so the roof forms a wedge.
  const roofH = Math.min(w, d) * 0.34;
  const roofGeom = ctx.tracker.track(new THREE.BoxGeometry(w, roofH, d));
  const rpos = roofGeom.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rpos.count; i++) {
    if (rpos.getY(i) > 0 && rpos.getZ(i) > 0) {
      rpos.setY(i, -roofH / 2);
    }
  }
  rpos.needsUpdate = true;
  roofGeom.computeVertexNormals();

  const roof = new THREE.Mesh(roofGeom, roofMat);
  roof.position.y = height / 2 + roofH / 2 + LAYERS.componentLift;
  roof.castShadow = true;
  roof.receiveShadow = true;
  attachOutline(roof, ctx, 1.4);
  group.add(roof);

  const finalY = LAYERS.buildingBase + height / 2;
  group.position.set(toX(planX + planW / 2), finalY, toZ(planY + planH / 2));
  registerRising(ctx, group, height + roofH, finalY, delay);
  return group;
}

// ---------------------------------------------------------------------------
// Stave church — tiered square plan with pyramidal roofs. Real cones (4-sided)
// with eaves, tiered setbacks, and a slender spire on top. Nothing stacked.
// ---------------------------------------------------------------------------

function planStaveChurch(
  ctx: SceneCtx,
  planX: number,
  planY: number,
  planW: number,
  planH: number,
  delay: number,
): THREE.Group {
  const group = new THREE.Group();

  const cellW = toW(planW);
  const cellH = toW(planH);

  // Stave church — tar-stained brown timber
  const mat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: 0x5a3a1e,
      roughness: 0.92,
      metalness: 0,
    }),
  );

  // Floor 1 — rectangular nave (longer than wide)
  const f1W = cellW * 0.85;
  const f1D = cellH * 0.55;
  const f1H = 2.2;
  const f1Geom = ctx.tracker.track(new THREE.BoxGeometry(f1W, f1H, f1D));
  const f1 = new THREE.Mesh(f1Geom, mat);
  f1.position.y = f1H / 2;
  f1.castShadow = true;
  f1.receiveShadow = true;
  attachOutline(f1, ctx, 1.3);
  group.add(f1);

  // Floor 2 — first stacked cube, narrower and shorter footprint
  const f2Side = Math.min(f1W, f1D) * 0.92;
  const f2H = 1.8;
  const f2Geom = ctx.tracker.track(new THREE.BoxGeometry(f2Side, f2H, f2Side));
  const f2 = new THREE.Mesh(f2Geom, mat);
  f2.position.y = f1H + f2H / 2 + LAYERS.componentLift;
  f2.castShadow = true;
  f2.receiveShadow = true;
  attachOutline(f2, ctx, 1.3);
  group.add(f2);

  // Floor 3 — second stacked cube, smaller still
  const f3Side = f2Side * 0.68;
  const f3H = 1.6;
  const f3Geom = ctx.tracker.track(new THREE.BoxGeometry(f3Side, f3H, f3Side));
  const f3 = new THREE.Mesh(f3Geom, mat);
  f3.position.y = f1H + f2H + f3H / 2 + LAYERS.componentLift * 2;
  f3.castShadow = true;
  f3.receiveShadow = true;
  attachOutline(f3, ctx, 1.3);
  group.add(f3);

  // Pyramidal roof cap — 4-sided cone with small overhang
  const capH = 2.0;
  const capRadius = (f3Side + 0.25 * 2) / Math.SQRT2;
  const capGeom = ctx.tracker.track(new THREE.ConeGeometry(capRadius, capH, 4));
  capGeom.rotateY(Math.PI / 4);
  const cap = new THREE.Mesh(capGeom, mat);
  cap.position.y = f1H + f2H + f3H + capH / 2 + LAYERS.componentLift * 3;
  cap.castShadow = true;
  cap.receiveShadow = true;
  attachOutline(cap, ctx, 1.3);
  group.add(cap);

  const totalH = f1H + f2H + f3H + capH;
  const finalY = LAYERS.buildingBase;
  group.position.set(toX(planX + planW / 2), finalY, toZ(planY + planH / 2));
  registerRising(ctx, group, totalH, finalY, delay);
  return group;
}

// ---------------------------------------------------------------------------
// Low-rise subdivision — 2-3 sub-blocks per cell with seeded variation
// ---------------------------------------------------------------------------

// Body tones — broader spread than the base palette so adjacent sub-blocks
// are visibly different
const RES_TONES = [
  0xf2ebd6,  // bone (lightest)
  0xe2d8b8,  // warm sand
  0xcfc398,  // desaturated straw
  0xd6c5a2,  // tan
  0xbfac80,  // clay
  0xe8dcb6,  // pale buff
];

// Stone tones for plinth / cornice / parapet — three shades so roof trim
// varies between neighbors
const STONE_TONES = [
  0xcdc4a8,  // light stone
  0xa89a78,  // medium stone
  0x867858,  // dark stone
];

function lowRiseCell(
  ctx: SceneCtx,
  group: THREE.Object3D,
  planX: number,
  planY: number,
  planW: number,
  planH: number,
  baseH: number,
  seed: number,
  delayBase: number,
): void {
  const rand = (i: number): number => {
    const x = Math.sin(seed * 9.31 + i * 17.7) * 43758.5453;
    return x - Math.floor(x);
  };
  // Seeds 51 and 55 are the two signature white buildings (Row 5 corners)
  const whiteSignature = seed === 51 || seed === 55;
  const tone = (i: number): number =>
    whiteSignature ? 0xf6f2e8 : RES_TONES[Math.floor(rand(i + 50) * RES_TONES.length)];
  const stone = (i: number): number =>
    whiteSignature ? 0xe8e2d4 : STONE_TONES[Math.floor(rand(i + 170) * STONE_TONES.length)];

  const aspect = planW / planH;

  // ~25% chance a given sub-block gets a low-poly planted roof
  const gr = (i: number): boolean => rand(i + 80) > 0.75;
  // If not green, ~22% chance of a wooden water tower on top
  const wt = (i: number): boolean => !gr(i) && rand(i + 160) > 0.78;
  // ~28% chance a sub-block is in active construction (the rest are static)
  const anim = (i: number): boolean => rand(i + 90) > 0.72;
  // Slow, varied reveal duration 4-7s so motion lingers across the scene
  const dur = (i: number): number => 4 + rand(i + 120) * 3;

  if (Math.abs(aspect - 1) < 0.18) {
    const sw = 0.45 + rand(0) * 0.18;
    const sh = 0.5 + rand(1) * 0.18;
    const aw = planW * sw;
    const ah = planH * sh;
    group.add(planBox(ctx, planX, planY, aw, planH, baseH * (0.95 + rand(2) * 0.45), tone(0), delayBase + rand(5) * 0.25, 1.3, gr(0), anim(0), dur(0), wt(0), stone(0)));
    group.add(planBox(ctx, planX + aw, planY, planW - aw, ah, baseH * (0.7 + rand(3) * 0.3), tone(1), delayBase + rand(6) * 0.25, 1.3, gr(1), anim(1), dur(1), wt(1), stone(1)));
    group.add(planBox(ctx, planX + aw, planY + ah, planW - aw, planH - ah, baseH * (0.85 + rand(4) * 0.45), tone(2), delayBase + rand(7) * 0.25, 1.3, gr(2), anim(2), dur(2), wt(2), stone(2)));
  } else if (aspect > 1) {
    const split = 0.38 + rand(0) * 0.24;
    group.add(planBox(ctx, planX, planY, planW * split, planH, baseH * (0.85 + rand(1) * 0.5), tone(0), delayBase + rand(5) * 0.25, 1.3, gr(0), anim(0), dur(0), wt(0), stone(0)));
    group.add(planBox(ctx, planX + planW * split, planY, planW * (1 - split), planH, baseH * (0.95 + rand(2) * 0.4), tone(1), delayBase + rand(6) * 0.25, 1.3, gr(1), anim(1), dur(1), wt(1), stone(1)));
  } else {
    const split = 0.4 + rand(0) * 0.2;
    group.add(planBox(ctx, planX, planY, planW, planH * split, baseH * (0.9 + rand(1) * 0.45), tone(0), delayBase + rand(5) * 0.25, 1.3, gr(0), anim(0), dur(0), wt(0), stone(0)));
    group.add(planBox(ctx, planX, planY + planH * split, planW, planH * (1 - split), baseH * (0.85 + rand(2) * 0.5), tone(1), delayBase + rand(6) * 0.25, 1.3, gr(1), anim(1), dur(1), wt(1), stone(1)));
  }
}

// Norwegian flag — small canvas texture for the crane cabin
function makeNorwegianFlagTexture(): THREE.Texture {
  const w = 32;
  const h = 24;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Red background
  ctx.fillStyle = '#ba0c2f';
  ctx.fillRect(0, 0, w, h);

  // White cross — vertical bar offset toward the hoist (left)
  const hoistX = 10;
  const whiteThick = 4;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, h / 2 - whiteThick / 2, w, whiteThick);
  ctx.fillRect(hoistX - whiteThick / 2, 0, whiteThick, h);

  // Blue cross on top
  const blueThick = 2;
  ctx.fillStyle = '#00205b';
  ctx.fillRect(0, h / 2 - blueThick / 2, w, blueThick);
  ctx.fillRect(hoistX - blueThick / 2, 0, blueThick, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

// Yellow tower crane with rotating top, foundation, cabin, Norwegian flag,
// and an animated cable hanging from the jib trolley.
function planCrane(
  ctx: SceneCtx,
  cranePlanX: number,
  cranePlanY: number,
): {
  group: THREE.Group;
  top: THREE.Group;
  cable: THREE.Mesh;
  mastTopY: number;
  jibLen: number;
} {
  const group = new THREE.Group();

  const yellowMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0xe9be2c, roughness: 0.6, metalness: 0.2 }),
  );
  const cableMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85, metalness: 0.3 }),
  );
  const foundationMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x9a9486, roughness: 0.92, metalness: 0 }),
  );
  const poleMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.8, metalness: 0.15 }),
  );

  // Foundation — concrete pad, wider than the mast
  const foundH = 0.9;
  const foundW = 2.2;
  const foundGeom = ctx.tracker.track(new THREE.BoxGeometry(foundW, foundH, foundW));
  const foundation = new THREE.Mesh(foundGeom, foundationMat);
  foundation.position.y = foundH / 2;
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  attachOutline(foundation, ctx, 1.2);
  group.add(foundation);

  // Mast — stands on the foundation
  const mastH = 12.5;
  const mastW = 0.5;
  const mastGeom = ctx.tracker.track(new THREE.BoxGeometry(mastW, mastH, mastW));
  const mast = new THREE.Mesh(mastGeom, yellowMat);
  mast.position.y = foundH + mastH / 2;
  mast.castShadow = true;
  attachOutline(mast, ctx, 1.1);
  group.add(mast);

  const mastTopY = foundH + mastH;

  // Rotating top — this is what swings around the mast
  const top = new THREE.Group();
  top.position.y = mastTopY;
  group.add(top);

  const jibLen = 9.5;
  const jibH = 0.4;
  const jibD = mastW * 0.9;
  const counterLen = 2.6;

  // Jib — long arm along +X in top-local
  const jibGeom = ctx.tracker.track(new THREE.BoxGeometry(jibLen, jibH, jibD));
  const jib = new THREE.Mesh(jibGeom, yellowMat);
  jib.position.set(jibLen / 2, jibH / 2, 0);
  jib.castShadow = true;
  attachOutline(jib, ctx, 1.0);
  top.add(jib);

  // Counter-jib — shorter arm along -X
  const counterGeom = ctx.tracker.track(new THREE.BoxGeometry(counterLen, jibH * 0.95, jibD));
  const counter = new THREE.Mesh(counterGeom, yellowMat);
  counter.position.set(-counterLen / 2, jibH / 2, 0);
  counter.castShadow = true;
  attachOutline(counter, ctx, 1.0);
  top.add(counter);

  // Yellow counterweight — bigger, more realistic mass
  const cwW = 1.1;
  const cwH = 1.3;
  const cwD = 1.2;
  const cwGeom = ctx.tracker.track(new THREE.BoxGeometry(cwW, cwH, cwD));
  const cw = new THREE.Mesh(cwGeom, yellowMat);
  cw.position.set(-counterLen - cwW / 2 + 0.1, -cwH / 2 + jibH / 2, 0);
  cw.castShadow = true;
  attachOutline(cw, ctx, 1.1);
  top.add(cw);

  // Steering house / cabin — mounted just below and in front of the pivot
  const cabW = 0.95;
  const cabH = 0.8;
  const cabD = 0.95;
  const cabGeom = ctx.tracker.track(new THREE.BoxGeometry(cabW, cabH, cabD));
  const cabin = new THREE.Mesh(cabGeom, yellowMat);
  cabin.position.set(0.85, -cabH / 2 - 0.05, 0);
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  attachOutline(cabin, ctx, 1.1);
  top.add(cabin);

  // Flag pole on top of the cabin
  const poleH = 1.5;
  const poleGeom = ctx.tracker.track(new THREE.CylinderGeometry(0.035, 0.035, poleH, 6));
  const pole = new THREE.Mesh(poleGeom, poleMat);
  pole.position.set(0.85 + cabW / 2 - 0.1, cabH / 2 - 0.05 + poleH / 2, 0);
  pole.castShadow = true;
  top.add(pole);

  // Norwegian flag — plane with flag texture, two-sided
  const flagTex = ctx.tracker.track(makeNorwegianFlagTexture());
  const flagMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      map: flagTex,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0,
    }),
  );
  const flagW = 1.0;
  const flagH = 0.68;
  const poleX = 0.85 + cabW / 2 - 0.1;
  const flagGeom = ctx.tracker.track(new THREE.PlaneGeometry(flagW, flagH));
  const flag = new THREE.Mesh(flagGeom, flagMat);
  flag.position.set(
    poleX,
    cabH / 2 - 0.05 + poleH - flagH / 2 - 0.06,
    flagW / 2,
  );
  flag.rotation.y = Math.PI / 2;
  flag.castShadow = true;
  top.add(flag);

  // Cable — thin cylinder oriented each frame from jib end to box. Unit
  // height; the animate loop sets position/rotation/scale. Lives in the
  // scene (world space) so it doesn't inherit the crane group transform.
  const cableGeom = ctx.tracker.track(
    new THREE.CylinderGeometry(0.05, 0.05, 1, 6),
  );
  const cable = new THREE.Mesh(cableGeom, cableMat);
  cable.castShadow = false;
  cable.receiveShadow = false;

  // Position the crane in the world
  const craneWorldX = toX(cranePlanX);
  const craneWorldZ = toZ(cranePlanY);
  group.position.set(craneWorldX, 0, craneWorldZ);

  return { group, top, cable, mastTopY, jibLen };
}
interface Sailboat {
  group: THREE.Group;
}

function buildSailboat(ctx: SceneCtx): Sailboat {
  const group = new THREE.Group();

  // Hull — long along Z so the boat's natural forward = +Z (south)
  const hullMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0xdcd1b4, roughness: 0.82, metalness: 0 }),
  );
  const hullGeom = ctx.tracker.track(new THREE.BoxGeometry(0.32, 0.16, 0.95));
  const hull = new THREE.Mesh(hullGeom, hullMat);
  hull.position.y = 0.1;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // Mast
  const mastMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 0.9, metalness: 0 }),
  );
  const mastGeom = ctx.tracker.track(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 5));
  const mast = new THREE.Mesh(mastGeom, mastMat);
  mast.position.set(0, 0.55, 0);
  mast.castShadow = true;
  group.add(mast);

  // Sail — triangle via 3-vert BufferGeometry (low-poly, white, two-sided)
  const sailMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: 0xfcfaf0,
      roughness: 0.55,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  const sailGeom = ctx.tracker.track(new THREE.BufferGeometry());
  const verts = new Float32Array([
    0, 0.18, -0.05,   // bottom-aft
    0, 0.18,  0.50,   // bottom-fore
    0, 1.02, -0.02,   // top
  ]);
  sailGeom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  sailGeom.setIndex([0, 1, 2]);
  sailGeom.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeom, sailMat);
  sail.castShadow = true;
  sail.receiveShadow = true;
  group.add(sail);

  return { group };
}

// Low-poly spruce — trunk cylinder + 3 stacked cone skirts
function makeSpruce(
  ctx: SceneCtx,
  trunkMat: THREE.MeshStandardMaterial,
  needleMat: THREE.MeshStandardMaterial,
  scale: number,
): THREE.Group {
  const g = new THREE.Group();

  const trunkH = 0.28 * scale;
  const trunkGeom = ctx.tracker.track(
    new THREE.CylinderGeometry(0.06 * scale, 0.08 * scale, trunkH, 5),
  );
  trunkGeom.translate(0, trunkH / 2, 0);
  const trunk = new THREE.Mesh(trunkGeom, trunkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);

  // 3 stacked cones (4-5 radial segments for low-poly silhouette)
  const layers: Array<{ radius: number; height: number; y: number }> = [
    { radius: 0.48 * scale, height: 0.62 * scale, y: trunkH },
    { radius: 0.36 * scale, height: 0.54 * scale, y: trunkH + 0.36 * scale },
    { radius: 0.22 * scale, height: 0.46 * scale, y: trunkH + 0.70 * scale },
  ];
  for (const l of layers) {
    const coneGeom = ctx.tracker.track(new THREE.ConeGeometry(l.radius, l.height, 5));
    coneGeom.translate(0, l.y + l.height / 2, 0);
    const cone = new THREE.Mesh(coneGeom, needleMat);
    cone.castShadow = true;
    cone.receiveShadow = true;
    g.add(cone);
  }

  return g;
}

// Scatter spruces deterministically inside a region with strong height
// variation and three needle-color shades for a richer canopy.
function planSpruceGrove(
  ctx: SceneCtx,
  planX: number,
  planY: number,
  planW: number,
  planH: number,
  seed: number,
  density = 0.35,
): THREE.Group {
  const group = new THREE.Group();
  const w = toW(planW);
  const d = toW(planH);

  const trunkMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x5a3e24, roughness: 0.96, metalness: 0 }),
  );
  // Three shades of green — deep forest, mid forest, lighter sunlit
  const needleMats = [
    ctx.tracker.track(new THREE.MeshStandardMaterial({ color: 0x2a4c32, roughness: 0.93, metalness: 0 })),
    ctx.tracker.track(new THREE.MeshStandardMaterial({ color: 0x3b6a42, roughness: 0.93, metalness: 0 })),
    ctx.tracker.track(new THREE.MeshStandardMaterial({ color: 0x5a8450, roughness: 0.91, metalness: 0 })),
  ];

  const rand = (i: number): number => {
    const x = Math.sin(seed * 7.93 + i * 23.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const count = Math.max(2, Math.floor(w * d * density));
  for (let i = 0; i < count; i++) {
    // Strong scale variation: 0.7x to 2.2x (wide spread so trees have clear
    // big/small distinction)
    const sc = 0.7 + rand(i * 3) * 1.5;
    const mat = needleMats[Math.floor(rand(i * 3 + 7) * needleMats.length)];
    const tree = makeSpruce(ctx, trunkMat, mat, sc);
    tree.position.set(
      (rand(i * 3 + 1) - 0.5) * (w - 0.8),
      LAYERS.surfTop,
      (rand(i * 3 + 2) - 0.5) * (d - 0.8),
    );
    tree.rotation.y = rand(i * 3 + 5) * Math.PI;
    group.add(tree);
  }

  group.position.set(toX(planX + planW / 2), 0, toZ(planY + planH / 2));
  return group;
}

// Modern plaza — gridded paving bands, linear tree rows, benches, reflecting
// pool, and lighting bollards. Designed as a composed urban space rather than
// random scatter.
function planPlaza(
  ctx: SceneCtx,
  planX: number,
  planY: number,
  planW: number,
  planH: number,
): THREE.Group {
  const group = new THREE.Group();
  const w = toW(planW);
  const d = toW(planH);
  const y0 = LAYERS.surfTop;

  // Materials
  const darkPaveMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x9a9585, roughness: 0.88, metalness: 0 }),
  );
  const lightPaveMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0xd4cdb8, roughness: 0.85, metalness: 0 }),
  );
  const waterMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: 0x8aaabb, roughness: 0.15, metalness: 0.3,
      transparent: true, opacity: 0.7,
    }),
  );
  const benchMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x4a3827, roughness: 0.85, metalness: 0 }),
  );
  const benchLegMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.6 }),
  );
  const treeTrunkMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x3d2b1a, roughness: 0.9, metalness: 0 }),
  );
  const treeCanopyMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x4a6e3a, roughness: 0.92, metalness: 0 }),
  );
  const bollardMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.5 }),
  );
  const bollardCapMat = ctx.tracker.track(
    new THREE.MeshStandardMaterial({
      color: 0xfff8e0, roughness: 0.3, metalness: 0.1,
      emissive: new THREE.Color(0xfff8e0), emissiveIntensity: 0.3,
    }),
  );

  // --- Paving bands: alternating light/dark stripes along X ---
  const stripeCount = 9;
  const stripeW = w / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    const mat = i % 2 === 0 ? lightPaveMat : darkPaveMat;
    const geom = ctx.tracker.track(new THREE.BoxGeometry(stripeW, 0.02, d));
    const stripe = new THREE.Mesh(geom, mat);
    stripe.position.set(
      -w / 2 + stripeW / 2 + i * stripeW,
      y0 + 0.01,
      0,
    );
    stripe.receiveShadow = true;
    group.add(stripe);
  }

  // --- Reflecting pool: slim rectangle off-center ---
  const poolW = w * 0.35;
  const poolD = d * 0.2;
  const poolH = 0.06;
  const poolGeom = ctx.tracker.track(new THREE.BoxGeometry(poolW, poolH, poolD));
  const pool = new THREE.Mesh(poolGeom, waterMat);
  pool.position.set(w * 0.08, y0 + poolH / 2 + 0.02, -d * 0.15);
  pool.receiveShadow = true;
  group.add(pool);
  // Pool rim — thin stone border
  const rimThick = 0.06;
  const rimH = 0.08;
  const rimParts: [number, number, number, number][] = [
    [poolW + rimThick * 2, rimThick, 0, -poolD / 2 - rimThick / 2],  // south
    [poolW + rimThick * 2, rimThick, 0, poolD / 2 + rimThick / 2],   // north
    [rimThick, poolD, -poolW / 2 - rimThick / 2, 0],                  // west
    [rimThick, poolD, poolW / 2 + rimThick / 2, 0],                   // east
  ];
  for (const [rw, rd, rx, rz] of rimParts) {
    const rGeom = ctx.tracker.track(new THREE.BoxGeometry(rw, rimH, rd));
    const rim = new THREE.Mesh(rGeom, darkPaveMat);
    rim.position.set(
      pool.position.x + rx,
      y0 + rimH / 2 + 0.02,
      pool.position.z + rz,
    );
    rim.receiveShadow = true;
    rim.castShadow = true;
    group.add(rim);
  }

  // --- Tree rows: two parallel rows of deciduous trees ---
  const treeRow = (rowX: number, count: number, startZ: number, spacing: number): void => {
    for (let i = 0; i < count; i++) {
      const tz = startZ + i * spacing;
      // Trunk
      const trunkH = 0.7;
      const trunkGeom = ctx.tracker.track(new THREE.CylinderGeometry(0.04, 0.06, trunkH, 6));
      const trunk = new THREE.Mesh(trunkGeom, treeTrunkMat);
      trunk.position.set(rowX, y0 + trunkH / 2, tz);
      trunk.castShadow = true;
      group.add(trunk);
      // Canopy — icosahedron for rounded deciduous look
      const canopyR = 0.35 + (i % 3) * 0.05;
      const canopyGeom = ctx.tracker.track(new THREE.IcosahedronGeometry(canopyR, 1));
      const canopy = new THREE.Mesh(canopyGeom, treeCanopyMat);
      canopy.position.set(rowX, y0 + trunkH + canopyR * 0.6, tz);
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      group.add(canopy);
    }
  };
  const treeSpacing = d / 4;
  treeRow(-w * 0.35, 3, -d * 0.3, treeSpacing);
  treeRow(w * 0.35, 3, -d * 0.3, treeSpacing);

  // --- Benches: paired along tree rows, facing inward ---
  const placeBench = (bx: number, bz: number, rotY: number): void => {
    const seatW = 0.6;
    const seatD = 0.18;
    const seatH = 0.22;
    // Seat plank
    const seatGeom = ctx.tracker.track(new THREE.BoxGeometry(seatW, 0.04, seatD));
    const seat = new THREE.Mesh(seatGeom, benchMat);
    seat.position.set(bx, y0 + seatH, bz);
    seat.rotation.y = rotY;
    seat.castShadow = true;
    seat.receiveShadow = true;
    group.add(seat);
    // Two legs
    const legGeom = ctx.tracker.track(new THREE.BoxGeometry(0.04, seatH, 0.04));
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeom, benchLegMat);
      const dx = side * (seatW / 2 - 0.06);
      leg.position.set(
        bx + dx * Math.cos(rotY),
        y0 + seatH / 2,
        bz + dx * Math.sin(rotY),
      );
      leg.castShadow = true;
      group.add(leg);
    }
  };
  // Benches between trees on left row, facing right
  placeBench(-w * 0.28, -d * 0.3 + treeSpacing * 0.5, 0);
  placeBench(-w * 0.28, -d * 0.3 + treeSpacing * 1.5, 0);
  // Benches between trees on right row, facing left
  placeBench(w * 0.28, -d * 0.3 + treeSpacing * 0.5, 0);
  placeBench(w * 0.28, -d * 0.3 + treeSpacing * 1.5, 0);

  // --- Bollards: line of small light posts along the south edge ---
  const bollardCount = 5;
  const bollardSpacing = w * 0.7 / (bollardCount - 1);
  for (let i = 0; i < bollardCount; i++) {
    const bx = -w * 0.35 + i * bollardSpacing;
    const postH = 0.35;
    const postGeom = ctx.tracker.track(new THREE.CylinderGeometry(0.025, 0.03, postH, 6));
    const post = new THREE.Mesh(postGeom, bollardMat);
    post.position.set(bx, y0 + postH / 2, d * 0.4);
    post.castShadow = true;
    group.add(post);
    // Glowing cap
    const capGeom = ctx.tracker.track(new THREE.SphereGeometry(0.04, 6, 4));
    const cap = new THREE.Mesh(capGeom, bollardCapMat);
    cap.position.set(bx, y0 + postH + 0.02, d * 0.4);
    group.add(cap);
  }

  group.position.set(toX(planX + planW / 2), 0, toZ(planY + planH / 2));
  return group;
}

// ---------------------------------------------------------------------------
// Buildings — places every massing element on the slab
// ---------------------------------------------------------------------------

function buildBuildings(ctx: SceneCtx): THREE.Group {
  const group = new THREE.Group();
  const add = (m: THREE.Object3D): void => {
    group.add(m);
  };

  // === Quay sliver east of vertical river (3 cells) ===
  lowRiseCell(ctx, group, 220, 40,  54, 114, H.residential, 11, 0.05);
  lowRiseCell(ctx, group, 220, 166, 54, 108, H.residential, 12, 0.10);
  lowRiseCell(ctx, group, 220, 286, 54,  94, H.residential, 13, 0.15);

  // === Row 0 — D1, E1 mid blocks ===
  lowRiseCell(ctx, group, 526, 40, 108, 114, H.midBlock, 21, 0.20);
  lowRiseCell(ctx, group, 646, 40, 114, 114, H.midBlock, 22, 0.25);

  // === Civic Hall — large landmark with central courtyard, rows 0-1 col 3 ===
  add(planCivicHall(ctx, 406, 40, 108, 234, H.civic, 48, 134, 0.30));

  // === Towers — rows 1-2, cols 4-5 ===
  add(planTower(ctx, 526, 166, 108, 108, H.towerA, 0.45));              // D2 — plain modular tower
  add(planOasiaTower(ctx, 646, 166, 114, 108, H.towerB, 0.55));         // E2 — Oasia-inspired plant tower
  add(planWillisTower(ctx, 526, 286, 108,  94, H.towerTall, 0.65));     // D3 — Willis-style stepped tallest

  // === Row 2 waterfront landmarks ===
  // Black gate spanning the opera + concert cells — one continuous mass
  add(planBlackGate(ctx, 286, 406, 108, 286, 94, 13, 0.40));
  add(planMuseum(ctx, 646, 286, 114, 94, H.museum, 0.50));

  // === Row 3 — Riverfront row (south of horizontal river) ===
  lowRiseCell(ctx, group, 40,  440, 114, 74, H.riverfront, 31, 0.70);
  lowRiseCell(ctx, group, 166, 440, 108, 74, H.riverfront, 32, 0.72);
  lowRiseCell(ctx, group, 286, 440, 108, 74, H.riverfront, 33, 0.74);
  lowRiseCell(ctx, group, 406, 440, 108, 74, H.riverfront, 34, 0.76);
  lowRiseCell(ctx, group, 526, 440, 108, 74, H.riverfront, 35, 0.78);
  lowRiseCell(ctx, group, 646, 440, 114, 74, H.riverfront, 36, 0.80);

  // === Old town (col 0 row 4) — quad-split, slight per-block variation ===
  // Col 1 row 4 is replaced by the stave church (below), so those 4 cells drop.
  const oldRects: Array<[number, number, number, number, number, number]> = [
    [40,  526, 56, 54, H.oldTownLow,  101],
    [98,  526, 56, 54, H.oldTownHigh, 102],
    [40,  580, 56, 54, H.oldTownHigh, 103],
    [98,  580, 56, 54, H.oldTownLow,  104],
  ];
  for (const r of oldRects) {
    const [x, y, w, h, height, seed] = r;
    add(planBox(ctx, x, y, w, h, height, PALETTE.oldTown, 0.85 + (seed % 8) * 0.02, 1.2));
  }

  // === Stave church — interior of the old town block ===
  add(planStaveChurch(ctx, 166, 526, 108, 108, 0.90));

  // === Spruce groves — the green mass of the parks ===
  add(planSpruceGrove(ctx, 40,  40, 120, 400, 401, 0.55));  // West Bank — dense linear forest
  add(planSpruceGrove(ctx, 286, 40, 108, 114, 402, 0.60));  // Botanical Gardens — denser still

  // === Foliage — bushes and flower beds in plazas (softer scale) ===
  add(planFoliage(ctx, 286, 166, 108, 108, 303, 0.4));  // Plaza C2
  add(planFoliage(ctx, 286, 526, 228, 108, 304, 0.35)); // Town Square

  // === Row 4 — D4, E4 residential ===
  lowRiseCell(ctx, group, 526, 526, 108, 108, H.midBlock, 41, 0.95);
  lowRiseCell(ctx, group, 646, 526, 114, 108, H.midBlock, 42, 1.00);

  // === Row 5 ===
  lowRiseCell(ctx, group, 40,  646, 114, 114, H.residential, 51, 1.05);
  lowRiseCell(ctx, group, 166, 646, 108, 114, H.residential, 52, 1.07);
  lowRiseCell(ctx, group, 286, 646, 108, 114, H.residential, 53, 1.09);
  add(planMarketHall(ctx, 406, 646, 108, 114, H.market, 1.10));
  lowRiseCell(ctx, group, 526, 646, 108, 114, H.residential, 54, 1.12);
  lowRiseCell(ctx, group, 646, 646, 114, 114, H.residential, 55, 1.14);

  return group;
}

// ---------------------------------------------------------------------------
// initDioramaScene — public entry, matches BlueprintCity signature
// ---------------------------------------------------------------------------

export function initDioramaScene(container: HTMLElement): () => void {
  const tracker = new DisposalTracker();
  const windowTex = makeWindowColorTexture();
  tracker.track(windowTex);

  const ctx: SceneCtx = {
    tracker,
    outlineMaterials: [],
    waterMaterials: [],
    rising: [],
    revealed: [],
    windowTex,
    crane: null,
  };

  const scene = new THREE.Scene();
  scene.background = PALETTE.bg;

  const width = container.clientWidth;
  const height = container.clientHeight;

  const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 500);
  camera.position.set(94, 110, 94);
  camera.lookAt(0, 6, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Global clipping plane at the slab's bottom face — nothing below the slab
  // bounding box ever renders, so rising buildings appear out of nothing.
  renderer.clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(0, 1, 0), SLAB_THICKNESS),
  ];

  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  // Lighting rig — cool hemi + warm directional sun, no ambient
  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.55);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.1);
  sun.position.set(-22, 50, 22);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(sun.target);

  // Build content
  scene.add(buildSlab(ctx));
  scene.add(buildGridLines(ctx));
  scene.add(buildRoadsAndSurfaces(ctx));
  scene.add(buildRiver(ctx));
  scene.add(buildBridges(ctx));
  scene.add(buildBuildings(ctx));

  // Sailboat on the river
  const boat = buildSailboat(ctx);
  scene.add(boat.group);

  // Yellow tower crane — in plaza C2. Jib swings between a pickup angle
  // (north of the mast) and a drop angle (civic hall roof), lifting black
  // boxes onto the roof on repeat.
  {
    const civicCenterWorldX = toX(460);
    const civicCenterWorldZ = toZ(157);
    const civicRoofY = LAYERS.buildingBase + H.civic;

    const { group: craneGroup, top, cable, mastTopY, jibLen } = planCrane(
      ctx,
      340,  // plaza C2 center X (plan)
      220,  // plaza C2 center Y (plan)
    );
    scene.add(craneGroup);
    scene.add(cable);  // cable lives in world space so we can orient it freely

    // Pickup is due north of the mast, in the Botanical Gardens park.
    // The jib sweeps N → NE → E to reach the civic hall wall, staying
    // well clear of both the black gate (south) and the tower cluster.
    const pickupAngle = Math.PI / 2;   // +90°, jib points north
    const pickupRadius = 5.5;

    top.rotation.y = pickupAngle;

    const boxMat = ctx.tracker.track(
      new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.85, metalness: 0.05 }),
    );

    void civicCenterWorldX;
    void civicCenterWorldZ;

    ctx.crane = {
      top,
      cranePosX: craneGroup.position.x,
      cranePosZ: craneGroup.position.z,
      mastTopY,
      maxRadius: jibLen - 0.4,
      pickupAngle,
      pickupRadius,
      stackBaseY: civicRoofY,
      boxSize: 0.75,
      material: boxMat,
      scene,
      stackBoxes: [],
      activeBox: null,
      currentDest: null,
      cycleStart: 0,
      cycleDuration: 26,
    };

    (ctx.crane as CraneState & { cable?: THREE.Mesh }).cable = cable;
  }

  // Pre-position rising buildings just under the slab AND hide them — the
  // animate loop unhides each one when its delay elapses, so they appear
  // out of nothing rather than peeking below the slab.
  for (const r of ctx.rising) {
    r.mesh.position.y = r.finalY - r.height - 0.4;
    r.mesh.visible = false;
  }

  // Hide modular buildings initially — the phased construction reveal shows them
  for (const r of ctx.revealed) {
    hideModules(r.modules);
  }

  // Animation loop
  let raf = 0;
  let running = true;
  const startTime = performance.now();
  const radius = Math.hypot(camera.position.x, camera.position.z);
  const baseY = camera.position.y;
  let theta = Math.atan2(camera.position.z, camera.position.x);

  const REVEAL_DURATION = 1.1;
  const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

  // Construction time runs at 0.2x real time — lazy background pacing,
  // full reveal completes in ~20 seconds. Camera and water stay at real speed.
  const ANIM_SPEED = 0.1;

  const animate = (): void => {
    if (!running) return;
    const t = (performance.now() - startTime) / 1000;
    const animT = t * ANIM_SPEED;

    // Slow rotation (real time — unaffected)
    theta += 0.0006;
    camera.position.x = Math.cos(theta) * radius;
    camera.position.z = Math.sin(theta) * radius;
    camera.position.y = baseY;
    camera.lookAt(0, 6, 0);

    // Water shader uniforms (real time)
    for (const m of ctx.waterMaterials) {
      m.uniforms.uTime.value = t;
      (m.uniforms.uCameraPos.value as THREE.Vector3).copy(camera.position);
    }

    // Rising buildings (landmarks use this simpler lift reveal)
    for (const r of ctx.rising) {
      const local = animT - r.delay;
      if (local <= 0) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.visible = true;
      const eased = easeOutCubic(Math.min(local / REVEAL_DURATION, 1));
      r.mesh.position.y = (r.finalY - r.height - 0.4) + (r.height + 0.4) * eased;
    }

    // Modular buildings — phased construction reveal
    for (const rev of ctx.revealed) {
      const local = animT - rev.delay;
      if (local <= 0) {
        hideModules(rev.modules);
        continue;
      }
      const phaseT = Math.min(local / rev.duration, 0.86);
      updateConstructionPhase(rev.modules, phaseT);
    }

    // Sailboat — slow loop along the river's L-path
    const cycleSec = 85;
    const phase = (t % cycleSec) / cycleSec;
    const vertLen = 370;
    const horizLen = 570;
    const total = vertLen + horizLen;
    const vertFrac = vertLen / total;
    let planPx: number;
    let planPy: number;
    let yaw: number;
    if (phase < vertFrac) {
      const sub = phase / vertFrac;
      planPx = 190;
      planPy = 40 + sub * vertLen;
      yaw = 0;
    } else {
      const sub = (phase - vertFrac) / (1 - vertFrac);
      planPx = 190 + sub * horizLen;
      planPy = 410;
      yaw = -Math.PI / 2;
    }
    boat.group.position.set(toX(planPx), LAYERS.waterTop + 0.02, toZ(planPy));
    boat.group.rotation.y = yaw;

    // Crane — rotating tower crane. The trolley + cable operate like a real
    // tower crane: box is always directly under the jib at some radius R
    // along the jib. Lifting is vertical; horizontal motion comes from the
    // jib rotating and the trolley moving along the jib.
    const cr = ctx.crane;
    if (cr) {
      const liftY = cr.mastTopY - 0.5;
      const groundY = LAYERS.surfTop + cr.boxSize / 2;

      // Stack slot computation (pyramid pattern along west wall of civic hall)
      const MAX_PYRAMIDS = 2;
      const MAX_BOXES = MAX_PYRAMIDS * 10;
      const stackSlot = (rawIdx: number): { x: number; y: number; z: number } => {
        const i = rawIdx % MAX_BOXES;
        const pyrIdx = Math.floor(i / 10);
        const inPyr = i % 10;
        let layer: number;
        let zSlot: number;
        if (inPyr < 4) {
          layer = 0;
          zSlot = inPyr;
        } else if (inPyr < 7) {
          layer = 1;
          zSlot = inPyr - 4 + 0.5;
        } else if (inPyr < 9) {
          layer = 2;
          zSlot = inPyr - 7 + 1;
        } else {
          layer = 3;
          zSlot = 1.5;
        }
        const b = cr.boxSize;
        // West wall top center
        const wallCenterX = toX(460) - toW(54) + toW(15);
        // South end of wall (closest to crane) — pyramids extend north.
        const wallSouthZ = toZ(157) + toW(67) - b / 2 - 0.3;
        return {
          x: wallCenterX,
          y: cr.stackBaseY + layer * b + b / 2,
          z: wallSouthZ - (pyrIdx * 4 + zSlot + 0.5) * b,
        };
      };

      // --- Cycle lifecycle ---
      const localT = t - cr.cycleStart;
      const phase = localT / cr.cycleDuration;

      if (phase >= 1) {
        cr.cycleStart = t;
        cr.currentDest = null;
      }

      if (!cr.currentDest) {
        const slot = stackSlot(cr.stackBoxes.length);
        const dx = slot.x - cr.cranePosX;
        const dz = slot.z - cr.cranePosZ;
        const angle = Math.atan2(-dz, dx);
        const radius = Math.min(cr.maxRadius, Math.hypot(dx, dz));
        cr.currentDest = { x: slot.x, y: slot.y, z: slot.z, angle, radius };

        const bGeom = new THREE.BoxGeometry(cr.boxSize, cr.boxSize, cr.boxSize);
        ctx.tracker.track(bGeom);
        const box = new THREE.Mesh(bGeom, cr.material);
        box.castShadow = true;
        box.receiveShadow = true;
        attachOutline(box, ctx, 1.2);
        cr.activeBox = box;
        cr.scene.add(box);
      }

      const dest = cr.currentDest;
      const phaseLocal = Math.min(1, (t - cr.cycleStart) / cr.cycleDuration);

      // Phase timeline:
      //   0.00-0.05  box sits at pickup ground
      //   0.05-0.22  cable lifts to clearance
      //   0.22-0.55  jib rotates + trolley slides pickup→drop (box at lift Y)
      //   0.55-0.78  cable lowers onto stack slot
      //   0.78-0.88  pause on stack
      //   0.88-1.00  jib rotates back + trolley slides back (empty return)
      let jibAngle = cr.pickupAngle;
      let trolleyR = cr.pickupRadius;
      let boxY = groundY;

      if (phaseLocal < 0.05) {
        jibAngle = cr.pickupAngle;
        trolleyR = cr.pickupRadius;
        boxY = groundY;
      } else if (phaseLocal < 0.22) {
        const p = (phaseLocal - 0.05) / 0.17;
        jibAngle = cr.pickupAngle;
        trolleyR = cr.pickupRadius;
        boxY = groundY + (liftY - groundY) * p;
      } else if (phaseLocal < 0.55) {
        const p = (phaseLocal - 0.22) / 0.33;
        jibAngle = cr.pickupAngle + (dest.angle - cr.pickupAngle) * p;
        trolleyR = cr.pickupRadius + (dest.radius - cr.pickupRadius) * p;
        boxY = liftY;
      } else if (phaseLocal < 0.78) {
        const p = (phaseLocal - 0.55) / 0.23;
        jibAngle = dest.angle;
        trolleyR = dest.radius;
        boxY = liftY + (dest.y - liftY) * p;
      } else if (phaseLocal < 0.88) {
        jibAngle = dest.angle;
        trolleyR = dest.radius;
        boxY = dest.y;
      } else {
        const p = (phaseLocal - 0.88) / 0.12;
        jibAngle = dest.angle + (cr.pickupAngle - dest.angle) * p;
        trolleyR = dest.radius + (cr.pickupRadius - dest.radius) * p;
        boxY = liftY;  // cable stays retracted at clearance
      }

      cr.top.rotation.y = jibAngle;

      // Box is ALWAYS directly under the trolley in XZ
      const boxX = cr.cranePosX + trolleyR * Math.cos(jibAngle);
      const boxZ = cr.cranePosZ - trolleyR * Math.sin(jibAngle);

      const hasBox = phaseLocal < 0.88;
      if (hasBox && cr.activeBox) {
        cr.activeBox.position.set(boxX, boxY, boxZ);
      }
      // Release exactly once when we cross into the empty-return phase
      if (!hasBox && cr.activeBox) {
        cr.activeBox.position.set(dest.x, dest.y, dest.z);
        cr.stackBoxes.push(cr.activeBox);
        cr.activeBox = null;
      }

      // Cable is always vertical — from trolley (above box) down to box top.
      const cableAny = cr as CraneState & { cable?: THREE.Mesh };
      if (cableAny.cable) {
        const trolleyY = cr.mastTopY;
        const hookY = hasBox ? boxY + cr.boxSize / 2 : trolleyY - 0.3;
        const length = Math.max(0.05, trolleyY - hookY);
        const cable = cableAny.cable;
        cable.position.set(boxX, (trolleyY + hookY) / 2, boxZ);
        cable.scale.set(1, length, 1);
        cable.quaternion.identity();
      }
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  };
  animate();

  // Pause when hidden
  const handleVisibility = (): void => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      animate();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Resize handler — also propagates resolution to LineMaterial outlines
  const handleResize = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const mat of ctx.outlineMaterials) {
      mat.resolution.set(w, h);
    }
  };
  handleResize();
  const resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(container);

  return (): void => {
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', handleVisibility);
    resizeObserver.disconnect();
    renderer.dispose();
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
    tracker.dispose();
  };
}
