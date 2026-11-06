import type { Measurements } from '@lingjing/shared';
import { layoutBody, radiusAtY, type Joint } from './layout.ts';
import { addEllipsoid, addEllipticTubeY, addRod, MeshBuilder, vec, type MeshData, type Vec3 } from './meshtools.ts';

const MANNEQUIN: [number, number, number, number] = [0.62, 0.56, 0.5, 1];

/**
 * 参数化人台，不是 SMPL / SMPL-X。
 * 真实体型服务的替换点在 viewer.ts 的 createBodyObject()。
 */
export function buildMannequin(measurements: Measurements): MeshData {
  const layout = layoutBody(measurements);
  const mesh = new MeshBuilder();
  const { landmarks } = layout;
  const headRy = layout.totalH * 0.064;

  addEllipticTubeY(
    mesh,
    layout.torsoY0,
    layout.torsoY1,
    (t) => {
      const y = layout.torsoY0 + (layout.torsoY1 - layout.torsoY0) * t;
      return radiusAtY(layout, y);
    },
    28,
    16,
  );

  addEllipticTubeY(
    mesh,
    landmarks.shoulder,
    landmarks.neck,
    () => ({ rx: 0.05 * (0.94 + 0.06 * layout.bulk), rz: 0.046 * (0.94 + 0.06 * layout.bulk) }),
    16,
    3,
  );

  addEllipsoid(
    mesh,
    vec(0, landmarks.head, 0.008),
    headRy * 0.86,
    headRy,
    headRy * 0.92,
    18,
    12,
  );

  const armBulk = (0.9 + 0.1 * layout.bulk) * clampShoulder(layout.shoulderHalf);
  const r0 = 0.056 * armBulk;
  const r1 = 0.045 * armBulk;
  const r2 = 0.034 * armBulk;
  const { limbs } = layout;
  for (const side of [1, -1]) {
    const shoulder = mirror(limbs.shoulder, side);
    const elbow = mirror(limbs.elbow, side);
    const wrist = mirror(limbs.wrist, side);
    addRod(mesh, shoulder, elbow, r0, r1);
    addRod(mesh, elbow, wrist, r1, r2);
    addEllipsoid(mesh, wrist, r2 * 1.35, r2 * 1.05, r2 * 1.15, 10, 8);
  }

  const thigh = Math.max(0.05, (layout.hipM / (2 * Math.PI)) * 0.56);
  const ankleR = 0.04 * (0.92 + 0.08 * layout.bulk);
  for (const side of [1, -1]) {
    const hip = mirror(limbs.hip, side);
    const knee = mirror(limbs.knee, side);
    const ankle = mirror(limbs.ankle, side);
    addRod(mesh, hip, knee, thigh, thigh * 0.72, 16);
    addRod(mesh, knee, ankle, thigh * 0.72, ankleR, 14);
    addEllipsoid(mesh, vec(ankle.x, 0.028, ankle.z + 0.03), 0.042, 0.026, 0.078, 10, 8);
  }

  return mesh.toMesh('mannequin', MANNEQUIN, {
    lingjing: { kind: 'parametric-mannequin', heightCm: measurements.heightCm },
  });
}

function mirror(joint: Joint, side: number): Vec3 {
  return vec(joint.x * side, joint.y, joint.z);
}

function clampShoulder(shoulderHalf: number) {
  const ratio = (shoulderHalf * 2) / 0.4;
  return Math.min(1.16, Math.max(0.88, ratio));
}
