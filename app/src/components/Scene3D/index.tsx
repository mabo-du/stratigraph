import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Context, Phase } from '../../models/hmdp';

interface Scene3DProps {
  contexts: Context[];
  phases: Phase[];
  selectedId: string | null;
  onSelectContext: (id: string | null) => void;
}

function getPhaseColor(phaseId: string | undefined, phases: Phase[]): string {
  if (!phaseId) return '#888888';
  const phase = phases.find(p => p.id === phaseId);
  return phase?.color ?? '#888888';
}

export const Scene3D: React.FC<Scene3DProps> = ({
  contexts,
  phases,
  selectedId,
  onSelectContext,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    meshes: Map<string, THREE.Mesh>;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    animId: number;
  } | null>(null);
  const selectedMeshRef = useRef<THREE.Mesh | null>(null);

  // Initialize scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e11);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(20, 15, 20);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    backLight.position.set(-10, 0, -10);
    scene.add(backLight);

    // Grid helper
    const grid = new THREE.GridHelper(40, 20, 0x444444, 0x222222);
    scene.add(grid);

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Animation loop
    let animId = 0;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Click handler
    function onClick(event: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const meshes: THREE.Mesh[] = [];
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) meshes.push(child);
      });
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const ctxId = hit.userData.contextId;
        if (ctxId) onSelectContext(ctxId);
      }
    }
    renderer.domElement.addEventListener('click', onClick);

    // Resize handler
    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    sceneRef.current = {
      scene, camera, renderer, controls,
      meshes: new Map(),
      raycaster, mouse, animId,
    };

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onSelectContext]);

  // Update boxes when contexts change
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;

    const { scene, meshes, camera, controls } = ref;

    // Remove old meshes
    meshes.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    meshes.clear();

    // Find bounds for sizing and auto-centering
    const spatialContexts = contexts.filter(
      (c): c is Context & { spatial: NonNullable<Context['spatial']> & { centroid: NonNullable<NonNullable<Context['spatial']>['centroid']> } } =>
        !!c.spatial?.centroid
    );
    if (spatialContexts.length === 0) return;

    const xs = spatialContexts.map(c => c.spatial.centroid.x);
    const ys = spatialContexts.map(c => c.spatial.centroid.y);
    const zs = spatialContexts.map(c => c.spatial.centroid.z ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const rangeX = Math.max(maxX - minX, 1);
    const rangeY = Math.max(maxY - minY, 1);
    const rangeZ = Math.max(maxZ - minZ, 1);
    const maxRange = Math.max(rangeX, rangeY, rangeZ);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    // Reset camera to sensible default position centered on data
    const scale = 8 / maxRange; // fit data into ~8 unit box
    camera.position.set(10, 8, 10);
    controls.target.set(0, 0, 0);
    controls.update();

    // Add new meshes (normalized to origin-centered coordinates)
    spatialContexts.forEach((ctx) => {
      const { x = 0, y = 0, z = 0 } = ctx.spatial.centroid;
      const nx = (x - centerX) * scale;
      const ny = (y - centerY) * scale;
      const height = Math.max((z - minZ) / rangeZ * 2 + 0.3, 0.3);

      const geo = new THREE.BoxGeometry(1, height, 1);
      const color = new THREE.Color(getPhaseColor(ctx.phase, phases));
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85,
      });
      const mesh = new THREE.Mesh(geo, mat);
      // Normalized x→X, y→Z (horizontal plane), z→Y (elevation)
      mesh.position.set(nx, height / 2 + (z - minZ) / rangeZ * 2 - 1, ny);
      mesh.userData.contextId = ctx.id;
      scene.add(mesh);
      meshes.set(ctx.id, mesh);
    });
  }, [contexts, phases]);

  // Highlight selected context
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;

    // Reset previous selection
    if (selectedMeshRef.current) {
      const mat = selectedMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(0x000000);
      mat.opacity = 0.85;
      selectedMeshRef.current = null;
    }

    if (selectedId && ref.meshes.has(selectedId)) {
      const mesh = ref.meshes.get(selectedId)!;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(0x4488ff);
      mat.emissiveIntensity = 0.3;
      mat.opacity = 1.0;
      selectedMeshRef.current = mesh;
    }
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 400,
        cursor: 'grab',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    />
  );
};
