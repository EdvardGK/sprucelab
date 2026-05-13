import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTranslation } from 'react-i18next';

import { useLazyViewerMount } from '@/hooks/useLazyViewerMount';
import { cn } from '@/lib/utils';
import type { FamilyKey } from '@/lib/material-families';
import type { AggregatedMaterial } from '@/hooks/use-project-materials';

interface MaterialSpherePreviewProps {
  material: AggregatedMaterial;
  className?: string;
}

interface PbrPreset {
  color: number;
  roughness: number;
  metalness: number;
  clearcoat?: number;
  transmission?: number;
  ior?: number;
  opacity?: number;
}

/**
 * Twinmotion/Blender-style material preview. A PBR sphere shaded with
 * `THREE.MeshPhysicalMaterial`, lit by a procedural three-point rig.
 *
 * The shader parameters are derived from the material family — concrete
 * is matte and grey, metal is glossy and reflective, glass is
 * transparent, etc. When the EPD/product pipeline lands real texture
 * maps (e.g. NOBB albedo/normal), this is the canonical place to wire
 * them in.
 *
 * Lazy-mounted via `useLazyViewerMount` so a long list of cards doesn't
 * blow the WebGL context budget. The renderer is created with
 * `alpha: true` and a transparent clear color so the sphere floats on
 * the card's background.
 */
export function MaterialSpherePreview({
  material,
  className,
}: MaterialSpherePreviewProps) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const geomRef = useRef<THREE.SphereGeometry | null>(null);
  const rafRef = useRef<number | null>(null);
  const { ref, shouldMount } = useLazyViewerMount({ rootMargin: '120px' });

  // Init three.js scene once a slot is granted.
  useEffect(() => {
    if (!shouldMount) return;
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.4, 3.0);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.background = 'transparent';

    // Three-light rig — key + fill + rim, plus a soft hemisphere for
    // ambient bounce. Matches what every DCC tool defaults to for a
    // material orb preview.
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2.5, 3, 4);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xc8d4ff, 0.55);
    fill.position.set(-3, 1.2, 2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xfff4d0, 0.7);
    rim.position.set(-1, 2, -3);
    scene.add(rim);

    const hemi = new THREE.HemisphereLight(0xfff7e0, 0.35);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(ambient);

    const preset = presetForFamily(material.family);
    const geom = new THREE.SphereGeometry(1, 64, 64);
    const mat = new THREE.MeshPhysicalMaterial({
      color: preset.color,
      roughness: preset.roughness,
      metalness: preset.metalness,
      clearcoat: preset.clearcoat ?? 0,
      clearcoatRoughness: 0.15,
      transmission: preset.transmission ?? 0,
      ior: preset.ior ?? 1.5,
      opacity: preset.opacity ?? 1,
      transparent: (preset.opacity ?? 1) < 1 || (preset.transmission ?? 0) > 0,
      thickness: preset.transmission ? 0.8 : 0,
    });
    const sphere = new THREE.Mesh(geom, mat);
    scene.add(sphere);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    sphereRef.current = sphere;
    matRef.current = mat;
    geomRef.current = geom;

    const resize = () => {
      const r = rendererRef.current;
      const c = cameraRef.current;
      if (!host || !r || !c) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w <= 0 || h <= 0) return;
      c.aspect = w / h;
      c.updateProjectionMatrix();
      r.setSize(w, h, false);
    };
    resize();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(host);
    } else {
      window.addEventListener('resize', resize);
    }

    // Slow autorotate — readable, not dizzying.
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      if (sphereRef.current) {
        sphereRef.current.rotation.y = elapsed * 0.5;
      }
      const r = rendererRef.current;
      const s = sceneRef.current;
      const c = cameraRef.current;
      if (r && s && c) r.render(s, c);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', resize);
      }
      geom.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      sphereRef.current = null;
      matRef.current = null;
      geomRef.current = null;
    };
    // Only depends on shouldMount + family preset. The preset itself is
    // captured at init; material changes within the same family are
    // handled by the live-update effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldMount, material.family]);

  // Live preset updates when the material changes (selection within the
  // same family or a re-classification).
  useEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    const preset = presetForFamily(material.family);
    mat.color.setHex(preset.color);
    mat.roughness = preset.roughness;
    mat.metalness = preset.metalness;
    mat.clearcoat = preset.clearcoat ?? 0;
    mat.transmission = preset.transmission ?? 0;
    mat.ior = preset.ior ?? 1.5;
    mat.opacity = preset.opacity ?? 1;
    mat.transparent = (preset.opacity ?? 1) < 1 || (preset.transmission ?? 0) > 0;
    mat.thickness = preset.transmission ? 0.8 : 0;
    mat.needsUpdate = true;
  }, [material.family, material.key]);

  return (
    <div
      ref={(node) => {
        hostRef.current = node;
        ref.current = node;
      }}
      className={cn(
        'relative aspect-square w-[clamp(140px,18vw,220px)] mx-auto overflow-hidden rounded-full',
        className,
      )}
      aria-label={t('materialBrowser.sphere.aria', { name: material.name })}
    >
      {!shouldMount && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-muted/30 text-[clamp(0.5rem,0.7vw,0.65rem)] text-muted-foreground">
          {t('materialBrowser.sphere.loading')}
        </div>
      )}
    </div>
  );
}

/**
 * Family -> PBR preset. Conservative defaults — we'd rather every sphere
 * read distinctly than chase realism on a 220px preview.
 */
function presetForFamily(family: FamilyKey): PbrPreset {
  switch (family) {
    case 'concrete':
      return { color: 0x9a958e, roughness: 0.85, metalness: 0.0 };
    case 'masonry':
      return { color: 0x8a6f5b, roughness: 0.8, metalness: 0.0 };
    case 'metal':
      return { color: 0xc0c4c8, roughness: 0.25, metalness: 0.95 };
    case 'wood':
      return { color: 0x8b5a2b, roughness: 0.65, metalness: 0.0, clearcoat: 0.15 };
    case 'boards':
      return { color: 0xddd0b7, roughness: 0.75, metalness: 0.0 };
    case 'insulation':
      return { color: 0xeae1d2, roughness: 0.95, metalness: 0.0 };
    case 'glass':
      return {
        color: 0xbfd5ea,
        roughness: 0.05,
        metalness: 0.0,
        transmission: 0.9,
        ior: 1.5,
        opacity: 0.6,
      };
    case 'membrane':
      return { color: 0x6b6f73, roughness: 0.4, metalness: 0.0, clearcoat: 0.3 };
    case 'polymer':
      return { color: 0x9aa3b0, roughness: 0.35, metalness: 0.0, clearcoat: 0.4 };
    case 'finish':
      return { color: 0xd9c9b0, roughness: 0.55, metalness: 0.0, clearcoat: 0.2 };
    case 'composite':
      return { color: 0xa9a39a, roughness: 0.5, metalness: 0.1 };
    case 'technical':
      return { color: 0x6d8480, roughness: 0.5, metalness: 0.05 };
    case 'other':
    default:
      return { color: 0x9ca3af, roughness: 0.7, metalness: 0.0 };
  }
}
