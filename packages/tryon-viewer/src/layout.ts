import { BASE_MEASUREMENTS, type Measurements } from '@lingjing/shared';

export type Keyframe = { t: number; rx: number; rz: number };

export type Joint = { x: number; y: number; z: number };

export type BodyLayout = {
  totalH: number;
  crotchY: number;
  bulk: number;
  chestM: number;
  waistM: number;
  hipM: number;
  shoulderHalf: number;
  armLength: number;
  torsoY0: number;
  torsoY1: number;
  landmarks: {
    hip: number;
    waist: number;
    chest: number;
    shoulder: number;
    neck: number;
    head: number;
  };
  /** 右侧关节。左侧是 x 取反。 */
  limbs: {
    shoulder: Joint;
    elbow: Joint;
    wrist: Joint;
    hip: Joint;
    knee: Joint;
    ankle: Joint;
  };
  torsoKeys: Keyframe[];
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 由目标周长反推椭圆半径，使围度滑杆能直接改变人台截面。 */
export function ellipseRadii(circumferenceM: number, widthOverDepth: number) {
  const ratio = Math.max(1, widthOverDepth);
  const k = Math.sqrt((ratio * ratio + 1) / 2);
  const scale = circumferenceM / (2 * Math.PI * k);
  return { rx: ratio * scale, rz: scale };
}

export function ellipseCircumference(rx: number, rz: number) {
  const a = Math.max(rx, rz);
  const b = Math.min(rx, rz);
  const h = ((a - b) ** 2) / ((a + b) ** 2 || 1);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(Math.max(0, 4 - 3 * h))));
}

export function sampleKeys(keys: Keyframe[], t: number) {
  const x = clamp(t, 0, 1);
  const first = keys[0];
  if (!first) return { rx: 0.1, rz: 0.08 };
  if (x <= first.t) return { rx: first.rx, rz: first.rz };
  for (let i = 0; i < keys.length - 1; i += 1) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (x <= b.t) {
      const u = (x - a.t) / (b.t - a.t || 1);
      const s = u * u * (3 - 2 * u);
      return { rx: a.rx + (b.rx - a.rx) * s, rz: a.rz + (b.rz - a.rz) * s };
    }
  }
  const last = keys[keys.length - 1]!;
  return { rx: last.rx, rz: last.rz };
}

function bmi(weightKg: number, heightCm: number) {
  const meters = heightCm / 100;
  return weightKg / (meters * meters);
}

/**
 * 量体到人台的映射（单位米，Y 向上，原点在脚底中心）。
 *
 * - 身高 → 头顶高度，头和颈跟着身高走。
 * - 裤内长 → 裆高。腿长跟着变，躯干用剩下的高度。
 * - 胸围 / 腰围 / 臀围 → 对应高度上的椭圆截面周长。
 * - 肩宽 → 肩峰间距，并参与肩部截面；手臂从肩峰伸出。
 * - 臂长 → 肩峰到手腕的直线距离，A 字姿态。
 * - 体重 → 在围度之外再乘一层厚度，不单独改身高或四肢长度。
 *
 * 这是参数化几何，不是扫描，也不是 SMPL-X。
 */
export function layoutBody(measurements: Measurements): BodyLayout {
  const totalH = measurements.heightCm / 100;
  const baseInseam = BASE_MEASUREMENTS.inseamCm ?? 78;
  const inseamCm = measurements.inseamCm ?? baseInseam * (measurements.heightCm / BASE_MEASUREMENTS.heightCm);
  const crotchY = clamp(inseamCm / 100, totalH * 0.36, totalH * 0.62);
  const bulk = clamp(
    bmi(measurements.weightKg, measurements.heightCm) /
      bmi(BASE_MEASUREMENTS.weightKg, BASE_MEASUREMENTS.heightCm),
    0.72,
    1.45,
  );
  const thicken = 0.62 + 0.38 * bulk;
  const chestM = (measurements.chestCm / 100) * thicken;
  const waistM = (measurements.waistCm / 100) * thicken;
  const hipM = (measurements.hipCm / 100) * thicken;
  const shoulderHalf = (measurements.shoulderCm / 100 / 2) * (0.9 + 0.1 * bulk);
  const armCm = measurements.armLengthCm ?? Math.round(measurements.heightCm * 0.33);
  const armLength = clamp(armCm / 100, totalH * 0.26, totalH * 0.5);

  const headRy = totalH * 0.064;
  const headCenter = totalH - headRy;
  const neckTop = headCenter - headRy * 0.72;
  const shoulderY = neckTop - totalH * 0.03;
  const span = Math.max(0.2, shoulderY - crotchY);
  const hipY = crotchY + span * 0.14;
  const waistY = crotchY + span * 0.36;
  const chestY = crotchY + span * 0.7;
  const y0 = crotchY * 0.98;
  const y1 = shoulderY;
  const tOf = (y: number) => clamp((y - y0) / (y1 - y0 || 1), 0, 1);
  const chest = ellipseRadii(chestM, 1.38);
  const waist = ellipseRadii(waistM, 1.28);
  const hip = ellipseRadii(hipM, 1.36);
  const shoulderRx = shoulderHalf * 0.95;

  const torsoKeys: Keyframe[] = [
    { t: 0, rx: hip.rx * 0.9, rz: hip.rz * 0.94 },
    { t: tOf(hipY), rx: hip.rx, rz: hip.rz },
    { t: tOf(waistY), rx: waist.rx, rz: waist.rz },
    { t: tOf(chestY), rx: chest.rx, rz: chest.rz },
    {
      t: 1,
      rx: chest.rx * 0.42 + shoulderRx * 0.58,
      rz: chest.rz * 0.9,
    },
  ].sort((a, b) => a.t - b.t);

  const shoulderJoint = { x: shoulderHalf * 0.9, y: shoulderY - 0.012, z: 0.02 };
  const armOut = armLength * 0.32;
  const armDrop = Math.sqrt(Math.max(armLength * armLength - armOut * armOut, (armLength * 0.8) ** 2));
  const wrist = {
    x: shoulderJoint.x + armOut,
    y: Math.max(0.18, shoulderJoint.y - armDrop),
    z: shoulderJoint.z + 0.035,
  };
  const elbow = {
    x: shoulderJoint.x + (wrist.x - shoulderJoint.x) * 0.48 + 0.012,
    y: shoulderJoint.y + (wrist.y - shoulderJoint.y) * 0.52,
    z: shoulderJoint.z + 0.012,
  };
  const hipRx = sampleKeys(torsoKeys, tOf(hipY)).rx;
  const legX = Math.max(0.065, hipRx * 0.46);
  const hipJoint = { x: legX, y: crotchY + 0.02, z: 0 };
  const ankle = { x: legX, y: 0.055, z: 0.012 };
  const knee = {
    x: legX,
    y: ankle.y + (hipJoint.y - ankle.y) * 0.46,
    z: 0.012,
  };

  return {
    totalH,
    crotchY,
    bulk,
    chestM,
    waistM,
    hipM,
    shoulderHalf,
    armLength,
    torsoY0: y0,
    torsoY1: y1,
    landmarks: {
      hip: hipY,
      waist: waistY,
      chest: chestY,
      shoulder: shoulderY,
      neck: neckTop,
      head: headCenter,
    },
    limbs: { shoulder: shoulderJoint, elbow, wrist, hip: hipJoint, knee, ankle },
    torsoKeys,
  };
}

export function radiusAtY(layout: BodyLayout, y: number) {
  const t = (y - layout.torsoY0) / (layout.torsoY1 - layout.torsoY0 || 1);
  return sampleKeys(layout.torsoKeys, t);
}

/**
 * 把基准码 GLB 贴到当前人台。
 * 上装跟肩高、胸围和肩宽；下装跟裆高和臀围。
 * 臂长不会单独拉袖子，裤长也不是按版片重裁。
 */
export function garmentFitScale(slot: 'top' | 'bottom', measurements: Measurements) {
  const current = layoutBody(measurements);
  const base = layoutBody(BASE_MEASUREMENTS);
  if (slot === 'top') {
    const shoulder = current.shoulderHalf * 2;
    const baseShoulder = base.shoulderHalf * 2;
    const x = (current.chestM * 0.62 + shoulder * 0.38) / (base.chestM * 0.62 + baseShoulder * 0.38);
    const z = (current.chestM * 0.7 + current.waistM * 0.3) / (base.chestM * 0.7 + base.waistM * 0.3);
    const y = current.landmarks.shoulder / base.landmarks.shoulder;
    return { x, y, z };
  }
  const x = (current.hipM * 0.8 + current.waistM * 0.2) / (base.hipM * 0.8 + base.waistM * 0.2);
  const z = (current.hipM * 0.75 + current.waistM * 0.25) / (base.hipM * 0.75 + base.waistM * 0.25);
  const y = current.crotchY / base.crotchY;
  return { x, y, z };
}
