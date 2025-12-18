/**
 * Section Planes Hook
 *
 * Manages clipping planes for the BIM viewer.
 * Uses Three.js clipping planes with ThatOpen renderer integration.
 *
 * Supports up to 4 color-coded planes with keyboard/mouse manipulation.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import * as OBC from '@thatopen/components';
import * as THREE from 'three';

// Plane colors for visual distinction
const PLANE_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#eab308'] as const; // red, green, blue, yellow
const PLANE_LABELS = ['Section 1', 'Section 2', 'Section 3', 'Section 4'] as const;
const MAX_PLANES = 4;

export interface SectionPlane {
  id: string;
  color: string;
  label: string;
  normal: THREE.Vector3;
  point: THREE.Vector3;
  threeClipPlane: THREE.Plane;
  helperGroup?: THREE.Group;  // Visual gizmo indicator for the plane
}

export interface UseSectionPlanesOptions {
  components: OBC.Components | null;
  world: OBC.World | null;
  enabled?: boolean;
}

export type SectionOrientation = 'horizontal' | 'vertical-x' | 'vertical-z' | 'parallel';

export interface UseSectionPlanesReturn {
  // State
  planes: SectionPlane[];
  activePlaneId: string | null;
  canAddPlane: boolean;

  // Actions
  addPlane: (point: THREE.Vector3, normal: THREE.Vector3, orientation?: SectionOrientation) => SectionPlane | null;
  deletePlane: (planeId: string) => void;
  clearAllPlanes: () => void;
  setActivePlane: (planeId: string | null) => void;
  movePlane: (planeId: string, distance: number) => void;
  flipPlane: (planeId: string) => void;
  rotatePlane: (planeId: string, axis: 'horizontal' | 'vertical', degrees: number) => void;
}

export function useSectionPlanes({
  components: _components,
  world,
  enabled = true,
}: UseSectionPlanesOptions): UseSectionPlanesReturn {
  const [planes, setPlanes] = useState<SectionPlane[]>([]);
  const [activePlaneId, setActivePlaneId] = useState<string | null>(null);
  const isInitializedRef = useRef(false);
  const clipPlanesRef = useRef<THREE.Plane[]>([]); // Keep ref for immediate access

  // Get Three.js renderer and scene from world
  const renderer = world?.renderer?.three as THREE.WebGLRenderer | undefined;
  const scene = world?.scene?.three as THREE.Scene | undefined;

  // Helper gizmo size
  const GIZMO_SIZE = 3; // Small square indicator
  const ARROW_LENGTH = 4; // Arrow showing normal direction

  // Create a small gizmo indicator for a plane (square + arrow)
  const createHelperMesh = useCallback((color: string, point: THREE.Vector3, normal: THREE.Vector3): THREE.Group => {
    const group = new THREE.Group();
    const colorObj = new THREE.Color(color);

    // Small square outline showing plane orientation
    const squarePoints = [
      new THREE.Vector3(-GIZMO_SIZE/2, -GIZMO_SIZE/2, 0),
      new THREE.Vector3(GIZMO_SIZE/2, -GIZMO_SIZE/2, 0),
      new THREE.Vector3(GIZMO_SIZE/2, GIZMO_SIZE/2, 0),
      new THREE.Vector3(-GIZMO_SIZE/2, GIZMO_SIZE/2, 0),
      new THREE.Vector3(-GIZMO_SIZE/2, -GIZMO_SIZE/2, 0), // Close the loop
    ];
    const squareGeometry = new THREE.BufferGeometry().setFromPoints(squarePoints);
    const squareMaterial = new THREE.LineBasicMaterial({
      color: colorObj,
      linewidth: 2,
      depthTest: false,
    });
    const squareLine = new THREE.Line(squareGeometry, squareMaterial);
    squareLine.renderOrder = 999;
    group.add(squareLine);

    // Small filled square (semi-transparent)
    const fillGeometry = new THREE.PlaneGeometry(GIZMO_SIZE, GIZMO_SIZE);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: colorObj,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
    fillMesh.renderOrder = 998;
    group.add(fillMesh);

    // Arrow showing normal direction (which side is visible)
    const arrowHelper = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1), // Will be oriented by group rotation
      new THREE.Vector3(0, 0, 0),
      ARROW_LENGTH,
      colorObj,
      ARROW_LENGTH * 0.3, // Head length
      ARROW_LENGTH * 0.15  // Head width
    );
    arrowHelper.renderOrder = 999;
    group.add(arrowHelper);

    // Cross lines extending outward to hint at infinite plane
    const crossMaterial = new THREE.LineDashedMaterial({
      color: colorObj,
      dashSize: 0.5,
      gapSize: 0.3,
      depthTest: false,
    });
    const crossSize = GIZMO_SIZE * 3;
    const crossPoints1 = [
      new THREE.Vector3(-crossSize, 0, 0),
      new THREE.Vector3(crossSize, 0, 0),
    ];
    const crossPoints2 = [
      new THREE.Vector3(0, -crossSize, 0),
      new THREE.Vector3(0, crossSize, 0),
    ];
    const crossGeo1 = new THREE.BufferGeometry().setFromPoints(crossPoints1);
    const crossGeo2 = new THREE.BufferGeometry().setFromPoints(crossPoints2);
    const crossLine1 = new THREE.Line(crossGeo1, crossMaterial);
    const crossLine2 = new THREE.Line(crossGeo2, crossMaterial);
    crossLine1.computeLineDistances();
    crossLine2.computeLineDistances();
    crossLine1.renderOrder = 997;
    crossLine2.renderOrder = 997;
    group.add(crossLine1);
    group.add(crossLine2);

    // Position and orient the group
    group.position.copy(point);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    group.quaternion.copy(quaternion);

    return group;
  }, []);

  // Update helper gizmo position and orientation
  const updateHelperMesh = useCallback((group: THREE.Group, point: THREE.Vector3, normal: THREE.Vector3) => {
    group.position.copy(point);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    group.quaternion.copy(quaternion);
  }, []);

  // Apply clipping planes to all materials in scene
  const applyClippingToScene = useCallback(() => {
    if (!scene) return;

    const clipPlanes = clipPlanesRef.current;
    let meshCount = 0;

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((mat) => {
          if (mat instanceof THREE.Material) {
            mat.clippingPlanes = clipPlanes.length > 0 ? clipPlanes : null;
            mat.clipIntersection = false;
            mat.needsUpdate = true;
            meshCount++;
          }
        });
      }
    });

  }, [scene]);

  // Initialize clipping on renderer when ready
  useEffect(() => {
    if (!renderer || !enabled || isInitializedRef.current) return;

    renderer.localClippingEnabled = true;
    isInitializedRef.current = true;

    return () => {
      if (renderer) {
        renderer.localClippingEnabled = false;
      }
      isInitializedRef.current = false;
    };
  }, [renderer, enabled]);

  // Update clipping planes when planes array changes
  useEffect(() => {
    clipPlanesRef.current = planes.map(p => p.threeClipPlane);
    applyClippingToScene();
  }, [planes, applyClippingToScene]);

  // Show/hide helper meshes based on active plane
  useEffect(() => {
    planes.forEach(plane => {
      if (plane.helperGroup) {
        plane.helperGroup.visible = plane.id === activePlaneId;
      }
    });
  }, [planes, activePlaneId]);

  // Re-apply clipping when scene changes (models loaded)
  useEffect(() => {
    if (!scene) return;

    // Apply immediately
    applyClippingToScene();

    // Also set up observer for when children are added
    const originalAdd = scene.add.bind(scene);
    scene.add = function(...objects: THREE.Object3D[]) {
      const result = originalAdd(...objects);
      // Re-apply clipping after objects are added
      setTimeout(() => applyClippingToScene(), 0);
      return result;
    };

    return () => {
      scene.add = originalAdd;
    };
  }, [scene, applyClippingToScene]);

  // Add a new section plane
  const addPlane = useCallback((
    point: THREE.Vector3,
    surfaceNormal: THREE.Vector3,
    orientation: SectionOrientation = 'parallel'
  ): SectionPlane | null => {
    if (!renderer || !scene) {
      return null;
    }
    if (planes.length >= MAX_PLANES) {
      return null;
    }

    try {
      // Compute final normal based on orientation
      let normal: THREE.Vector3;
      switch (orientation) {
        case 'horizontal':
          // Horizontal cut - clips along Y axis (up/down in Three.js)
          // Normal points down, so we keep geometry BELOW the plane
          normal = new THREE.Vector3(0, -1, 0);
          break;
        case 'vertical-x':
          // Vertical cut along X axis (north-south)
          normal = new THREE.Vector3(-1, 0, 0);
          break;
        case 'vertical-z':
          // Vertical cut along Z axis (east-west)
          normal = new THREE.Vector3(0, 0, -1);
          break;
        case 'parallel':
        default:
          // Surface-parallel with axis snapping for reliability
          // If the normal is close to a major axis, snap to it
          const SNAP_THRESHOLD = 0.15; // ~8.5 degrees
          const absX = Math.abs(surfaceNormal.x);
          const absY = Math.abs(surfaceNormal.y);
          const absZ = Math.abs(surfaceNormal.z);

          // Find dominant axis
          if (absY > absX && absY > absZ && absY > (1 - SNAP_THRESHOLD)) {
            // Nearly horizontal surface - snap to Y axis
            normal = new THREE.Vector3(0, Math.sign(surfaceNormal.y), 0);
          } else if (absX > absY && absX > absZ && absX > (1 - SNAP_THRESHOLD)) {
            // Nearly vertical facing X - snap to X axis
            normal = new THREE.Vector3(Math.sign(surfaceNormal.x), 0, 0);
          } else if (absZ > absX && absZ > absY && absZ > (1 - SNAP_THRESHOLD)) {
            // Nearly vertical facing Z - snap to Z axis
            normal = new THREE.Vector3(0, 0, Math.sign(surfaceNormal.z));
          } else {
            // Use the surface normal as-is for angled surfaces
            normal = surfaceNormal.clone().normalize();
          }
          break;
      }

      const planeIndex = planes.length;

      // Create Three.js clipping plane
      const threeClipPlane = new THREE.Plane();
      threeClipPlane.setFromNormalAndCoplanarPoint(normal, point);

      // Show brief flash indicator at creation point
      const color = new THREE.Color(PLANE_COLORS[planeIndex]);
      const flashGeometry = new THREE.PlaneGeometry(100, 100);
      const flashMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const flashMesh = new THREE.Mesh(flashGeometry, flashMaterial);
      flashMesh.position.copy(point);

      // Orient the flash to match the plane
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      flashMesh.quaternion.copy(quaternion);
      flashMesh.renderOrder = 999;
      scene.add(flashMesh);

      // Remove flash after 1 second
      setTimeout(() => {
        scene.remove(flashMesh);
        flashGeometry.dispose();
        flashMaterial.dispose();
      }, 1000);

      // Create persistent helper mesh for this plane
      const helperGroup = createHelperMesh(PLANE_COLORS[planeIndex], point, normal);
      helperGroup.visible = true; // Visible by default since this will be the active plane
      scene.add(helperGroup);

      const newPlane: SectionPlane = {
        id: crypto.randomUUID(),
        color: PLANE_COLORS[planeIndex],
        label: PLANE_LABELS[planeIndex],
        normal: normal.clone(),
        point: point.clone(),
        threeClipPlane,
        helperGroup,
      };

      // Update state - this will trigger the useEffect to apply clipping
      setPlanes(prev => [...prev, newPlane]);
      setActivePlaneId(newPlane.id);

      return newPlane;
    } catch {
      return null;
    }
  }, [renderer, scene, planes.length, createHelperMesh]);

  // Delete a specific plane
  const deletePlane = useCallback((planeId: string) => {
    setPlanes(prev => {
      // Find the plane to delete and remove its helper mesh from scene
      const planeToDelete = prev.find(p => p.id === planeId);
      if (planeToDelete?.helperGroup && scene) {
        scene.remove(planeToDelete.helperGroup);
        // Dispose all children in the group
        planeToDelete.helperGroup.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
            child.geometry?.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
      }

      const updated = prev.filter(p => p.id !== planeId);
      return updated.map((p, i) => ({
        ...p,
        color: PLANE_COLORS[i],
        label: PLANE_LABELS[i],
      }));
    });
    setActivePlaneId(prev => prev === planeId ? null : prev);
  }, [scene]);

  // Clear all planes
  const clearAllPlanes = useCallback(() => {
    // Remove all helper meshes from scene
    setPlanes(prev => {
      prev.forEach(p => {
        if (p.helperGroup && scene) {
          scene.remove(p.helperGroup);
          // Dispose all children in the group
          p.helperGroup.traverse((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
              child.geometry?.dispose();
              if (child.material instanceof THREE.Material) {
                child.material.dispose();
              }
            }
          });
        }
      });
      return [];
    });

    setActivePlaneId(null);
  }, [scene]);

  // Set active plane
  const setActivePlaneHandler = useCallback((planeId: string | null) => {
    setActivePlaneId(planeId);
  }, []);

  // Move plane along its normal
  const movePlane = useCallback((planeId: string, distance: number) => {
    setPlanes(prev => prev.map(p => {
      if (p.id !== planeId) return p;

      const newPoint = p.point.clone().addScaledVector(p.normal, distance);
      p.threeClipPlane.setFromNormalAndCoplanarPoint(p.normal, newPoint);

      // Update helper mesh position
      if (p.helperGroup) {
        updateHelperMesh(p.helperGroup, newPoint, p.normal);
      }

      return { ...p, point: newPoint };
    }));
  }, [updateHelperMesh]);

  // Flip plane direction
  const flipPlane = useCallback((planeId: string) => {
    setPlanes(prev => prev.map(p => {
      if (p.id !== planeId) return p;

      const newNormal = p.normal.clone().negate();
      p.threeClipPlane.setFromNormalAndCoplanarPoint(newNormal, p.point);

      // Update helper mesh orientation
      if (p.helperGroup) {
        updateHelperMesh(p.helperGroup, p.point, newNormal);
      }

      return { ...p, normal: newNormal };
    }));
  }, [updateHelperMesh]);

  // Rotate plane around an axis
  // 'horizontal' = rotate around Y axis (left/right like a compass)
  // 'vertical' = rotate around the horizontal axis perpendicular to current normal (tilt up/down)
  const rotatePlane = useCallback((planeId: string, axis: 'horizontal' | 'vertical', degrees: number) => {
    setPlanes(prev => prev.map(p => {
      if (p.id !== planeId) return p;

      const radians = (degrees * Math.PI) / 180;
      let newNormal: THREE.Vector3;

      if (axis === 'horizontal') {
        // Rotate around Y axis (world up) - like turning left/right
        const rotationMatrix = new THREE.Matrix4().makeRotationY(radians);
        newNormal = p.normal.clone().applyMatrix4(rotationMatrix).normalize();
      } else {
        // Rotate around horizontal axis perpendicular to current normal
        // This tilts the plane up/down
        // Find a horizontal axis perpendicular to the normal's XZ projection
        const horizontalAxis = new THREE.Vector3(-p.normal.z, 0, p.normal.x).normalize();

        // If normal is purely vertical, use X axis
        if (horizontalAxis.length() < 0.001) {
          horizontalAxis.set(1, 0, 0);
        }

        const rotationMatrix = new THREE.Matrix4().makeRotationAxis(horizontalAxis, radians);
        newNormal = p.normal.clone().applyMatrix4(rotationMatrix).normalize();
      }

      p.threeClipPlane.setFromNormalAndCoplanarPoint(newNormal, p.point);

      // Update helper mesh orientation
      if (p.helperGroup) {
        updateHelperMesh(p.helperGroup, p.point, newNormal);
      }

      return { ...p, normal: newNormal };
    }));
  }, [updateHelperMesh]);

  return {
    planes,
    activePlaneId,
    canAddPlane: planes.length < MAX_PLANES,
    addPlane,
    deletePlane,
    clearAllPlanes,
    setActivePlane: setActivePlaneHandler,
    movePlane,
    flipPlane,
    rotatePlane,
  };
}

export { PLANE_COLORS, MAX_PLANES };
