import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ActiveEirRule } from './eirRules';
import type { AddressValue } from './eirConfig';

/**
 * Tiny three.js cube preview for the EIR builder. Renders an extruded
 * site box derived from active EIR rules, with HTML labels anchored to
 * three of its corners summarising what an IFC delivery would carry
 * (schema, classification, MMI, tagging Psets).
 *
 * Vanilla three.js (already in the bundle for the main viewer). Scene,
 * renderer, geometry and materials are disposed on unmount; a single
 * resize observer keeps the canvas in sync with its container.
 */
interface EirIfcCubePreviewProps {
  rules: ActiveEirRule[];
}

interface ScreenLabel {
  id: string;
  /** Anchor in NDC-projected (xPct, yPct) inside the canvas, 0–100. */
  xPct: number;
  yPct: number;
  /** Anchor corner — affects label flip + connector direction. */
  anchor: 'tl' | 'tr' | 'bl' | 'br';
  title: string;
  detail: string;
  hint?: string;
}

interface CubeMeta {
  width: number;
  depth: number;
  height: number;
  derived: boolean;
}

const FALLBACK_W = 10;
const FALLBACK_D = 10;
const FALLBACK_H = 3;

function deriveCubeMeta(rules: ActiveEirRule[]): CubeMeta {
  // The MVP: site footprint isn't a discrete EIR field yet, so we use the
  // building-storey count + canonical floor list to give the height a
  // realistic shape. Width/depth fallback to 10 m until site_plan grows
  // extent fields.
  const canonical = rules.find((r) => r.kind === 'canonical_floors');
  const floors = canonical ? 2 : 1; // placeholder until floor list lands

  const height = floors > 1 ? floors * FALLBACK_H : FALLBACK_H;
  return {
    width: FALLBACK_W,
    depth: FALLBACK_D,
    height,
    derived: false,
  };
}

interface SceneAnchor {
  id: 'top' | 'south' | 'east';
  position: THREE.Vector3;
  anchor: 'tl' | 'tr' | 'bl' | 'br';
}

export function EirIfcCubePreview({ rules }: EirIfcCubePreviewProps) {
  const { t } = useTranslation();
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const anchorsRef = useRef<SceneAnchor[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const [labels, setLabels] = useState<ScreenLabel[]>([]);
  const cubeMeta = useMemo(() => deriveCubeMeta(rules), [rules]);

  // Pull live values for label content.
  const ifcSchema = rules.find((r) => r.kind === 'ifc_schema');
  const versions = (ifcSchema?.config.versions as string[] | undefined) ?? [];
  const mvds = (ifcSchema?.config.mvds as string[] | undefined) ?? [];
  const crsRule = rules.find((r) => r.kind === 'crs');
  const hCrs = (crsRule?.config.horizontal_crs as string[] | undefined) ?? [];
  const vDatum = (crsRule?.config.vertical_datum as string[] | undefined) ?? [];
  const sitePlan = rules.find((r) => r.kind === 'site_plan');
  const addr = sitePlan?.config.address as AddressValue | undefined;
  const classifications = rules.filter((r) => r.kind === 'classification');
  const mmi = rules.find((r) => r.kind === 'mmi_lod');
  const tags = rules.filter((r) => r.kind === 'tagging');

  // Stable scene info bundle used to refresh label content + positions
  // without recreating the renderer.
  const labelDefs = useMemo<
    Array<{
      anchorId: SceneAnchor['id'];
      title: string;
      detail: string;
      hint?: string;
    }>
  >(() => {
    const tl: { anchorId: SceneAnchor['id']; title: string; detail: string; hint?: string }[] = [];

    tl.push({
      anchorId: 'top',
      title: t('eirBuilder.cube.labelSchema', { defaultValue: 'IFC schema' }),
      detail: versions[0] ?? '—',
      hint:
        mvds[0] ??
        t('eirBuilder.cube.labelMvdNone', { defaultValue: 'No MVD' }),
    });

    tl.push({
      anchorId: 'south',
      title: t('eirBuilder.cube.labelCrs', { defaultValue: 'CRS' }),
      detail: hCrs[0] ?? '—',
      hint:
        vDatum[0] ??
        t('eirBuilder.cube.labelDatumNone', { defaultValue: 'No vertical datum' }),
    });

    const psetSummary = classifications
      .map((c) => `${c.config.ifc_pset ?? 'Pset_?'}.${c.config.ifc_property ?? '?'}`)
      .filter(Boolean);
    const taggingSummary = tags
      .map((tag) => `${tag.config.ifc_pset ?? 'Pset_?'}.${tag.config.ifc_property ?? '?'}`)
      .filter(Boolean);
    const eastDetail =
      psetSummary[0] ??
      taggingSummary[0] ??
      (mmi
        ? `${mmi.config.ifc_pset ?? 'Pset_?'}.${mmi.config.ifc_property ?? '?'}`
        : '—');
    const eastHint = [
      psetSummary.length > 1 ? `+${psetSummary.length - 1}` : null,
      taggingSummary[0] && psetSummary[0] !== taggingSummary[0] ? taggingSummary[0] : null,
      mmi ? `MMI ${mmi.config.system ?? ''}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    tl.push({
      anchorId: 'east',
      title: t('eirBuilder.cube.labelPsets', { defaultValue: 'Psets on instances' }),
      detail: eastDetail,
      hint: eastHint || undefined,
    });

    return tl;
  }, [t, versions, mvds, hCrs, vDatum, classifications, tags, mmi]);

  // One-shot init: renderer + scene + camera + initial cube.
  useEffect(() => {
    const host = canvasContainerRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = null; // transparent — host card provides background
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
    camera.up.set(0, 0, 1); // Z-up to match IFC convention
    camera.position.set(28, -28, 22);
    camera.lookAt(0, 0, cubeMeta.height / 2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    // Lights: a soft top + a warm side rim. Enough to read corners.
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.65);
    sun.position.set(15, -20, 30);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xfff1c2, 0.25);
    rim.position.set(-20, 18, 10);
    scene.add(rim);

    // Ground plane — thin disc as a visual reference.
    const groundGeo = new THREE.CircleGeometry(22, 64);
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0xe5e5e5,
      transparent: true,
      opacity: 0.35,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = 0; // already XY-plane (circle is XY by default)
    scene.add(ground);

    // Grid lines on ground for spatial reading.
    const grid = new THREE.GridHelper(40, 20, 0x999999, 0xdddddd);
    grid.rotation.x = Math.PI / 2; // GridHelper is XZ-plane by default; rotate to XY
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    scene.add(grid);

    const { width, depth, height } = cubeMeta;
    const cubeGeo = new THREE.BoxGeometry(width, depth, height);
    cubeGeo.translate(0, 0, height / 2);
    const cubeMat = new THREE.MeshStandardMaterial({
      color: 0x9aa8b2,
      roughness: 0.78,
      metalness: 0.05,
      transparent: true,
      opacity: 0.92,
    });
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    scene.add(cube);

    // Edge overlay so the cube reads cleanly.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(cubeGeo),
      new THREE.LineBasicMaterial({ color: 0x21263a, transparent: true, opacity: 0.6 })
    );
    scene.add(edges);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    meshRef.current = cube;
    anchorsRef.current = computeAnchors(width, depth, height);

    const handleResize = () => {
      if (!host || !cameraRef.current || !rendererRef.current) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w <= 0 || h <= 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h, false);
      renderOnce();
    };
    handleResize();

    let resizeObs: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(handleResize);
      resizeObs.observe(host);
    } else {
      window.addEventListener('resize', handleResize);
    }

    // Initial label projection.
    projectLabelsToScreen();
    // Slow autorotate for liveliness, throttled.
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      if (cameraRef.current && sceneRef.current) {
        const radius = 36;
        cameraRef.current.position.x = Math.cos(elapsed * 0.15) * radius;
        cameraRef.current.position.y = Math.sin(elapsed * 0.15) * radius;
        cameraRef.current.position.z = 22;
        cameraRef.current.lookAt(0, 0, height / 2);
        renderOnce();
        projectLabelsToScreen();
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (resizeObs) {
        resizeObs.disconnect();
      } else {
        window.removeEventListener('resize', handleResize);
      }
      cubeGeo.dispose();
      cubeMat.dispose();
      (edges.geometry as THREE.BufferGeometry).dispose();
      (edges.material as THREE.Material).dispose();
      groundGeo.dispose();
      groundMat.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      meshRef.current = null;
      anchorsRef.current = [];
    };
    // We intentionally re-init only when cube dimensions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cubeMeta.width, cubeMeta.depth, cubeMeta.height]);

  function renderOnce() {
    const r = rendererRef.current;
    const s = sceneRef.current;
    const c = cameraRef.current;
    if (r && s && c) r.render(s, c);
  }

  function projectLabelsToScreen() {
    const host = canvasContainerRef.current;
    const camera = cameraRef.current;
    const anchors = anchorsRef.current;
    if (!host || !camera || anchors.length === 0) return;

    const next: ScreenLabel[] = [];
    const ndc = new THREE.Vector3();
    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i];
      ndc.copy(a.position).project(camera);
      // Skip points clearly behind camera.
      if (ndc.z > 1) continue;
      const xPct = (ndc.x * 0.5 + 0.5) * 100;
      const yPct = (-ndc.y * 0.5 + 0.5) * 100;
      const def = labelDefs.find((d) => d.anchorId === a.id);
      if (!def) continue;
      next.push({
        id: a.id,
        xPct: clampPct(xPct),
        yPct: clampPct(yPct),
        anchor: a.anchor,
        title: def.title,
        detail: def.detail,
        hint: def.hint,
      });
    }
    setLabels(next);
  }

  // Re-project (cheap) whenever label content changes — animation loop
  // also calls this every frame, but this avoids stale text on
  // throttled tabs.
  useEffect(() => {
    projectLabelsToScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelDefs]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={canvasContainerRef}
        className="absolute inset-0"
        aria-label={t('eirBuilder.cube.canvasAria', {
          defaultValue: 'Sample IFC building cube',
        })}
      />
      {/* Anchored labels */}
      <div className="pointer-events-none absolute inset-0">
        {labels.map((l) => (
          <LabelChip key={l.id} label={l} />
        ))}
      </div>
      {/* Empty-state hint */}
      {labels.every((l) => l.detail === '—') && (
        <div className="pointer-events-none absolute bottom-1 left-1 right-1 text-center text-[clamp(0.5rem,0.65vw,0.7rem)] text-muted-foreground/70 italic">
          {t('eirBuilder.cube.emptyHint', {
            defaultValue: 'Add rules — labels fill in live as you configure',
          })}
        </div>
      )}
      {/* Address corner stamp */}
      {addr && (
        <div className="pointer-events-none absolute top-1 left-1 text-[clamp(0.45rem,0.6vw,0.65rem)] text-muted-foreground/80 tabular-nums">
          {addr.adressetekst}
        </div>
      )}
    </div>
  );
}

function clampPct(v: number) {
  if (!Number.isFinite(v)) return 50;
  if (v < 1) return 1;
  if (v > 99) return 99;
  return v;
}

function computeAnchors(w: number, d: number, h: number): SceneAnchor[] {
  // Three anchors give us schema (top), CRS (south face), Psets (east face).
  return [
    {
      id: 'top',
      position: new THREE.Vector3(0, 0, h),
      anchor: 'tl',
    },
    {
      id: 'south',
      position: new THREE.Vector3(0, -d / 2, h / 4),
      anchor: 'bl',
    },
    {
      id: 'east',
      position: new THREE.Vector3(w / 2, 0, (h * 3) / 4),
      anchor: 'tr',
    },
  ];
}

function LabelChip({ label }: { label: ScreenLabel }) {
  // Decide which corner of the label sits on the anchor point.
  const translateMap: Record<ScreenLabel['anchor'], string> = {
    tl: 'translate(0%, 0%)',
    tr: 'translate(-100%, 0%)',
    bl: 'translate(0%, -100%)',
    br: 'translate(-100%, -100%)',
  };
  return (
    <div
      className="absolute"
      style={{
        left: `${label.xPct}%`,
        top: `${label.yPct}%`,
        transform: translateMap[label.anchor],
      }}
    >
      <div
        className={cn(
          'pointer-events-none rounded-md border border-border/60 bg-card/95 backdrop-blur shadow-sm',
          'px-[clamp(0.375rem,0.6vw,0.625rem)] py-[clamp(0.25rem,0.4vh,0.45rem)] min-w-[clamp(5rem,8vw,8rem)] max-w-[clamp(8rem,14vw,14rem)]'
        )}
      >
        <div className="text-[clamp(0.45rem,0.6vw,0.65rem)] uppercase tracking-wide font-semibold text-muted-foreground">
          {label.title}
        </div>
        <div
          className={cn(
            'text-[clamp(0.6rem,0.72vw,0.78rem)] font-medium truncate',
            label.detail === '—' ? 'text-amber-600 dark:text-amber-500' : 'text-foreground'
          )}
        >
          {label.detail}
        </div>
        {label.hint && (
          <div className="text-[clamp(0.45rem,0.6vw,0.65rem)] text-muted-foreground/80 truncate">
            {label.hint}
          </div>
        )}
      </div>
    </div>
  );
}
