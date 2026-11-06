import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_MEASUREMENTS } from '@lingjing/shared';
import { buildMannequin } from '../src/body.ts';
import { buildGarmentMesh } from '../src/garment.ts';
import { encodeGlb } from '../src/glb.ts';
import { ellipseCircumference, ellipseRadii, garmentFitScale, layoutBody, sampleKeys } from '../src/layout.ts';
import type { MeshData } from '../src/meshtools.ts';

function vertexCount(mesh: MeshData) {
  return mesh.positions.length / 3;
}

function assertMesh(mesh: MeshData) {
  const count = vertexCount(mesh);
  assert.ok(count > 50, `${mesh.name} 顶点过少`);
  assert.equal(mesh.normals.length, mesh.positions.length);
  assert.equal(mesh.indices.length % 3, 0);
  for (const index of mesh.indices) {
    assert.ok(index >= 0 && index < count, `${mesh.name} 索引越界 ${index}`);
  }
}

function bbox(mesh: MeshData) {
  const box = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = mesh.positions[i + axis] ?? 0;
      box.min[axis] = Math.min(box.min[axis]!, value);
      box.max[axis] = Math.max(box.max[axis]!, value);
    }
  }
  return box;
}

function normalNear(mesh: MeshData, pick: (x: number, y: number, z: number) => boolean) {
  let best = -Infinity;
  let normal = [0, 0, 0];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] ?? 0;
    const y = mesh.positions[i + 1] ?? 0;
    const z = mesh.positions[i + 2] ?? 0;
    if (!pick(x, y, z)) continue;
    const score = x;
    if (score > best) {
      best = score;
      normal = [mesh.normals[i] ?? 0, mesh.normals[i + 1] ?? 0, mesh.normals[i + 2] ?? 0];
    }
  }
  return normal;
}

test('基准人台高度与胸围接近量体', () => {
  const layout = layoutBody(BASE_MEASUREMENTS);
  assert.ok(Math.abs(layout.totalH - 1.7) < 1e-9);
  assert.ok(layout.landmarks.waist > layout.landmarks.hip);
  assert.ok(layout.landmarks.chest > layout.landmarks.waist);
  assert.ok(layout.landmarks.shoulder > layout.landmarks.chest);
  assert.ok(layout.landmarks.head > layout.landmarks.neck);
  const chest = ellipseRadii(0.88, 1.38);
  const circumference = ellipseCircumference(chest.rx, chest.rz);
  assert.ok(Math.abs(circumference - 0.88) < 0.03, `胸围误差过大 ${circumference}`);
});

function jointDistance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

test('围度、肩宽、裤内长和臂长会各自改人台', () => {
  const base = layoutBody(BASE_MEASUREMENTS);
  const wideHip = layoutBody({ ...BASE_MEASUREMENTS, hipCm: 120 });
  const narrowHip = layoutBody({ ...BASE_MEASUREMENTS, hipCm: 80 });
  const hipT = (layout: ReturnType<typeof layoutBody>) =>
    (layout.landmarks.hip - layout.torsoY0) / (layout.torsoY1 - layout.torsoY0);
  const wide = sampleKeys(wideHip.torsoKeys, hipT(wideHip)).rx;
  const narrow = sampleKeys(narrowHip.torsoKeys, hipT(narrowHip)).rx;
  assert.ok(wide > narrow * 1.2, `臀围截面没有拉开 ${narrow} -> ${wide}`);

  const wideShoulder = layoutBody({ ...BASE_MEASUREMENTS, shoulderCm: 54 });
  const narrowShoulder = layoutBody({ ...BASE_MEASUREMENTS, shoulderCm: 32 });
  assert.ok(wideShoulder.limbs.shoulder.x > narrowShoulder.limbs.shoulder.x + 0.06);
  assert.ok(wideShoulder.torsoKeys.at(-1)!.rx > narrowShoulder.torsoKeys.at(-1)!.rx);

  const shortArm = layoutBody({ ...BASE_MEASUREMENTS, armLengthCm: 48 });
  const longArm = layoutBody({ ...BASE_MEASUREMENTS, armLengthCm: 72 });
  const shortReach = jointDistance(shortArm.limbs.shoulder, shortArm.limbs.wrist);
  const longReach = jointDistance(longArm.limbs.shoulder, longArm.limbs.wrist);
  assert.ok(longReach > shortReach + 0.18);
  assert.ok(Math.abs(longReach - 0.72) < 0.05, `臂长没有落到手腕 ${longReach}`);

  const shortLeg = layoutBody({ ...BASE_MEASUREMENTS, inseamCm: 68 });
  const longLeg = layoutBody({ ...BASE_MEASUREMENTS, inseamCm: 92 });
  assert.ok(longLeg.crotchY > shortLeg.crotchY + 0.18);
  assert.ok(longLeg.landmarks.shoulder - longLeg.crotchY < shortLeg.landmarks.shoulder - shortLeg.crotchY);

  const light = layoutBody({ ...BASE_MEASUREMENTS, weightKg: 48 });
  const heavy = layoutBody({ ...BASE_MEASUREMENTS, weightKg: 98 });
  assert.ok(heavy.chestM > light.chestM * 1.08);

  const shortPerson = buildMannequin({ ...BASE_MEASUREMENTS, heightCm: 155 });
  const tallPerson = buildMannequin({ ...BASE_MEASUREMENTS, heightCm: 190 });
  assert.ok(bbox(tallPerson).max[1]! > bbox(shortPerson).max[1]! + 0.25);

  const top = garmentFitScale('top', { ...BASE_MEASUREMENTS, shoulderCm: 52, chestCm: 104 });
  const bottom = garmentFitScale('bottom', { ...BASE_MEASUREMENTS, inseamCm: 90, hipCm: 108 });
  assert.ok(Math.abs(garmentFitScale('top', BASE_MEASUREMENTS).x - 1) < 0.02);
  assert.ok(top.x > 1.08);
  assert.ok(bottom.y > 1.08);
  assert.ok(base.totalH > 0);
});

test('人台法线朝外，左右大致对称', () => {
  const mesh = buildMannequin(BASE_MEASUREMENTS);
  assertMesh(mesh);
  const box = bbox(mesh);
  assert.ok(box.max[1]! > 1.6 && box.max[1]! < 1.75, `头顶 ${box.max[1]}`);
  assert.ok(box.min[1]! > -0.02 && box.min[1]! < 0.05);
  const outward = normalNear(mesh, (x, y) => x > 0.05 && y > 1 && y < 1.35);
  assert.ok(outward[0]! > 0.2, `躯干法线未朝外 ${outward.join(',')}`);
  let sumX = 0;
  const count = vertexCount(mesh);
  for (let i = 0; i < mesh.positions.length; i += 3) sumX += mesh.positions[i] ?? 0;
  assert.ok(Math.abs(sumX / count) < 0.02);
});

test('上装和下装占位网格分层，GLB 可被解析', async () => {
  const tee = buildGarmentMesh({
    silhouette: 'tee',
    fit: 'regular',
    easeCm: 4,
    length: 'short',
    color: '#f7f4ef',
  });
  const pants = buildGarmentMesh({
    silhouette: 'pants',
    fit: 'regular',
    easeCm: 3,
    length: 'regular',
    color: '#243652',
  });
  assertMesh(tee);
  assertMesh(pants);
  const teeBox = bbox(tee);
  const pantsBox = bbox(pants);
  assert.ok(teeBox.min[1]! > 0.7, `上衣过低 ${teeBox.min[1]}`);
  assert.ok(pantsBox.min[1]! < 0.12, `裤脚过高 ${pantsBox.min[1]}`);
  assert.ok(pantsBox.max[1]! > 0.95);

  const glb = Buffer.from(encodeGlb(pants));
  assert.equal(glb.readUInt32LE(0), 0x46546c67);
  assert.equal(glb.readUInt32LE(4), 2);
  const jsonLength = glb.readUInt32LE(12);
  assert.equal(glb.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) as {
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    materials: { doubleSided: boolean }[];
  };
  assert.equal(json.meshes[0]?.primitives[0]?.attributes.POSITION, 0);
  assert.equal(json.materials[0]?.doubleSided, true);

  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const parsed = await new Promise<unknown>((resolve, reject) => {
    loader.parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '', resolve, reject);
  });
  assert.ok(parsed);
});
