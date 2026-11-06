import type { GarmentParams, Measurements } from '@lingjing/shared';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildMannequin } from './body.ts';
import { buildGarmentMesh } from './garment.ts';
import { garmentFitScale, layoutBody } from './layout.ts';
import type { MeshData } from './meshtools.ts';

export type TryOnGarmentInput = {
  id: string;
  slot: 'top' | 'bottom';
  url?: string;
  color: string;
  name?: string;
  params: GarmentParams;
};

export type TryOnViewerStatus = 'loading' | 'ready' | 'error';

export type TryOnViewerOptions = {
  measurements: Measurements;
  garments: TryOnGarmentInput[];
  onStatus?: (status: TryOnViewerStatus, detail?: string) => void;
};

export type TryOnViewerHandle = {
  update(next: Partial<Pick<TryOnViewerOptions, 'measurements' | 'garments'>>): void;
  resetCamera(): void;
  dispose(): void;
};

type LoadedGarment = {
  key: string;
  slot: 'top' | 'bottom';
  pivot: THREE.Group;
};

/**
 * SMPL-X 接入点：替换 createBodyObject()。
 * 约定测量字段与 packages/shared 的 measurementsSchema 一致，
 * 映射说明在 layout.ts 的 layoutBody()。
 * 示例：
 *   const response = await fetch(`${SMPL_X_URL}/mesh`, { method: 'POST', body: JSON.stringify(measurements) });
 *   const glb = await response.arrayBuffer();
 *   return await loadGlb(glb);
 * 之后服装应改为按关节蒙皮，而不是 garmentFitScale() 的整件缩放。
 */
function createBodyObject(measurements: Measurements) {
  return meshToObject(buildMannequin(measurements), {
    color: 0xc4b8ae,
    roughness: 0.78,
    metalness: 0,
  });
}

function meshToObject(mesh: MeshData, material: { color: number; roughness: number; metalness: number }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mesh.normals), 3));
  geometry.setIndex(mesh.indices);
  const surface = new THREE.MeshStandardMaterial({
    color: material.color,
    roughness: material.roughness,
    metalness: material.metalness,
    side: THREE.DoubleSide,
  });
  const object = new THREE.Mesh(geometry, surface);
  object.castShadow = false;
  object.receiveShadow = false;
  return object;
}

function frameCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, measurements: Measurements) {
  const layout = layoutBody(measurements);
  controls.target.set(0, layout.totalH * 0.47, 0);
  camera.position.set(layout.totalH * 0.72, layout.totalH * 0.52, layout.totalH * 2.45);
  camera.near = 0.05;
  camera.far = 20;
  camera.updateProjectionMatrix();
  controls.update();
}

export function mountTryOnViewer(container: HTMLElement, options: TryOnViewerOptions): TryOnViewerHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe7e1d8);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', '三维试衣预览');
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xfff7ee, 0xd9cfc3, 0.95));
  const key = new THREE.DirectionalLight(0xfffaf4, 1.35);
  key.position.set(1.4, 2.6, 1.8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd5deea, 0.38);
  fill.position.set(-1.8, 1.4, -0.8);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08, depthWrite: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.001;
  scene.add(ground);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.35;
  controls.maxDistance = 5.4;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.72;
  controls.target.set(0, 0.95, 0);

  let measurements = options.measurements;
  let garments = options.garments;
  let disposed = false;
  let frame = 0;
  let loadToken = 0;
  let chain = Promise.resolve();
  const loaded: LoadedGarment[] = [];
  let body: THREE.Object3D | null = null;

  function resize() {
    const width = container.clientWidth || 320;
    const height = container.clientHeight || 480;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, true);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function replaceBody() {
    if (body) {
      scene.remove(body);
      disposeObject(body);
    }
    body = createBodyObject(measurements);
    scene.add(body);
  }

  function applyFit() {
    for (const item of loaded) {
      const fit = garmentFitScale(item.slot, measurements);
      item.pivot.scale.set(fit.x, fit.y, fit.z);
    }
  }

  function report(status: TryOnViewerStatus, detail?: string) {
    options.onStatus?.(status, detail);
  }

  function garmentKey(item: TryOnGarmentInput) {
    return `${item.slot}:${item.id}:${item.url ?? 'procedural'}`;
  }

  function syncGarments() {
    const token = ++loadToken;
    const snapshot = garments;
    chain = chain
      .then(async () => {
        if (disposed || token !== loadToken) return;
        await applySnapshot(snapshot, token);
      })
      .catch((error: unknown) => {
        if (disposed || token !== loadToken) return;
        report('error', error instanceof Error ? error.message : '样衣加载失败');
      });
  }

  async function applySnapshot(snapshot: TryOnGarmentInput[], token: number) {
    const wanted = new Set(snapshot.map((item) => garmentKey(item)));
    for (let index = loaded.length - 1; index >= 0; index -= 1) {
      const current = loaded[index];
      if (!current || wanted.has(current.key)) continue;
      scene.remove(current.pivot);
      disposeObject(current.pivot);
      loaded.splice(index, 1);
    }
    const pending = snapshot.filter((item) => !loaded.some((entry) => entry.key === garmentKey(item)));
    if (pending.length) report('loading', '正在加载样衣');
    let usedFallback = false;
    for (const item of pending) {
      if (disposed || token !== loadToken) return;
      const loadedObject = await loadOne(item);
      if (disposed || token !== loadToken) {
        disposeObject(loadedObject.object);
        return;
      }
      usedFallback = usedFallback || loadedObject.fallback;
      const pivot = new THREE.Group();
      pivot.name = garmentKey(item);
      pivot.add(loadedObject.object);
      scene.add(pivot);
      loaded.push({ key: garmentKey(item), slot: item.slot, pivot });
    }
    if (disposed || token !== loadToken) return;
    applyFit();
    report('ready', usedFallback ? '部分样衣使用了版型替身' : undefined);
  }

  function render() {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(container);
  replaceBody();
  frameCamera(camera, controls, measurements);
  resize();
  void syncGarments();
  render();

  return {
    update(next) {
      if (next.measurements) measurements = next.measurements;
      if (next.garments) garments = next.garments;
      if (next.measurements) replaceBody();
      void syncGarments();
    },
    resetCamera() {
      frameCamera(camera, controls, measurements);
    },
    dispose() {
      disposed = true;
      loadToken += 1;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      if (body) disposeObject(body);
      for (const item of loaded) disposeObject(item.pivot);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function proceduralGarment(item: TryOnGarmentInput) {
  return meshToObject(
    buildGarmentMesh({
      silhouette: item.params.silhouette,
      fit: item.params.fit,
      easeCm: item.params.easeCm,
      length: item.params.length,
      color: item.color,
    }),
    { color: new THREE.Color(item.color).getHex(), roughness: 0.86, metalness: 0 },
  );
}

async function loadOne(item: TryOnGarmentInput): Promise<{ object: THREE.Object3D; fallback: boolean }> {
  try {
    const object = item.url ? await loadGarmentUrl(item.url) : proceduralGarment(item);
    tintGarment(object, item.color);
    return { object, fallback: !item.url };
  } catch {
    return { object: proceduralGarment(item), fallback: true };
  }
}

async function loadGarmentUrl(url: string) {
  const gltf = await new GLTFLoader().loadAsync(url);
  return gltf.scene;
}

function tintGarment(object: THREE.Object3D, color: string) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.set(color);
        material.side = THREE.DoubleSide;
        material.roughness = Math.max(material.roughness, 0.74);
        material.metalness = 0;
      }
    }
  });
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}
