import { BASE_MEASUREMENTS, type Fit, type GarmentLength, type Silhouette } from '@lingjing/shared';
import { layoutBody, radiusAtY, type BodyLayout } from './layout.ts';
import {
  addEllipticTubeY,
  addRod,
  hexToLinearRgba,
  MeshBuilder,
  vec,
  type MeshData,
} from './meshtools.ts';

export type GarmentBuildInput = {
  silhouette: Silhouette;
  fit: Fit;
  easeCm: number;
  length: GarmentLength;
  color: string;
};

function padOf(fit: Fit, easeCm: number) {
  const fitMul = fit === 'slim' ? 0.55 : fit === 'relaxed' ? 1.25 : 0.85;
  return Math.min(0.06, Math.max(0.008, (easeCm / 100) * fitMul));
}

function outward(layout: BodyLayout, y: number, pad: number) {
  const base = radiusAtY(layout, y);
  return { rx: base.rx + pad, rz: base.rz + pad };
}

function buildTop(mesh: MeshBuilder, layout: BodyLayout, input: GarmentBuildInput, pad: number) {
  const hem =
    input.length === 'short'
      ? layout.landmarks.waist + 0.02
      : input.length === 'long'
        ? layout.crotchY - 0.02
        : layout.landmarks.hip + 0.04;
  const shoulderY = layout.landmarks.shoulder - 0.015;
  addEllipticTubeY(
    mesh,
    hem,
    shoulderY,
    (t) => {
      const y = hem + (shoulderY - hem) * t;
      const shell = outward(layout, y, pad + 0.01);
      const flare = t < 0.16 ? 1 + 0.05 * (1 - t / 0.16) : 1;
      const shoulder = t > 0.78 ? 1 + 0.12 * ((t - 0.78) / 0.22) : 1;
      return {
        rx: Math.max(shell.rx * shoulder, layout.shoulderHalf * 0.98) * flare,
        rz: shell.rz * flare,
      };
    },
    28,
    16,
  );

  const shortSleeve = input.silhouette === 'tee' || input.length === 'short';
  const armRoot = layout.shoulderHalf * 0.22;
  const sleeveR0 = 0.098 + pad * 0.2;
  const sleeveR1 = (shortSleeve ? 0.07 : 0.05) + pad * 0.2;
  const cuff = shortSleeve
    ? vec(0, layout.landmarks.chest - 0.02, 0.045)
    : vec(0, input.length === 'long' ? layout.landmarks.waist - 0.04 : layout.landmarks.waist + 0.05, 0.05);
  const cuffX = shortSleeve ? layout.totalH * 0.16 : layout.totalH * (input.length === 'long' ? 0.24 : 0.2);
  for (const side of [1, -1]) {
    addRod(
      mesh,
      vec(side * armRoot, layout.landmarks.shoulder - 0.02, 0.012),
      vec(side * (armRoot + cuffX), cuff.y, cuff.z),
      sleeveR0,
      sleeveR1,
      16,
    );
  }
}

function buildPants(mesh: MeshBuilder, layout: BodyLayout, input: GarmentBuildInput, pad: number) {
  const waist = layout.landmarks.waist + 0.035;
  const hipBottom = layout.crotchY - 0.1;
  const legX = Math.max(0.085, (layout.torsoKeys[1]?.rx ?? 0.15) * 0.4);
  const bodyThigh = Math.max(0.06, (layout.hipM / (2 * Math.PI)) * 0.58);
  const thigh = bodyThigh + pad + 0.03;
  const hem = input.length === 'short' ? layout.crotchY * 0.55 : input.length === 'long' ? 0.02 : 0.04;
  addEllipticTubeY(
    mesh,
    hipBottom,
    waist,
    (t) => {
      const y = hipBottom + (waist - hipBottom) * t;
      const shell = outward(layout, Math.min(waist, Math.max(layout.crotchY, y)), pad + 0.012);
      return {
        rx: Math.max(shell.rx, legX + thigh * 0.95),
        rz: Math.max(shell.rz, thigh * 0.9),
      };
    },
    28,
    10,
  );
  for (const side of [1, -1]) {
    addRod(mesh, vec(side * legX, layout.crotchY + 0.08, 0), vec(side * legX, hem, 0.012), thigh, 0.055 + pad * 0.2, 18);
  }
}

function buildSkirt(mesh: MeshBuilder, layout: BodyLayout, input: GarmentBuildInput, pad: number) {
  const waist = layout.landmarks.waist + 0.012;
  const hem =
    input.length === 'short'
      ? layout.crotchY * 0.72
      : input.length === 'long'
        ? layout.crotchY * 0.28
        : layout.crotchY * 0.5;
  const flare = (input.fit === 'relaxed' ? 0.16 : input.fit === 'slim' ? 0.06 : 0.1) + pad;
  addEllipticTubeY(
    mesh,
    hem,
    waist,
    (t) => {
      const y = hem + (waist - hem) * t;
      const shell = outward(layout, Math.max(layout.crotchY, y), pad * 0.4);
      const spread = flare * (1 - t);
      return { rx: shell.rx + spread, rz: shell.rz * 0.92 + spread * 0.72 };
    },
    28,
    12,
  );
}

export function buildGarmentMesh(input: GarmentBuildInput): MeshData {
  const layout = layoutBody(BASE_MEASUREMENTS);
  const mesh = new MeshBuilder();
  const pad = padOf(input.fit, input.easeCm);
  if (input.silhouette === 'tee' || input.silhouette === 'shirt') buildTop(mesh, layout, input, pad);
  else if (input.silhouette === 'pants') buildPants(mesh, layout, input, pad);
  else buildSkirt(mesh, layout, input, pad);

  return mesh.toMesh(`garment_${input.silhouette}`, hexToLinearRgba(input.color), {
    lingjing: {
      kind: 'placeholder-garment',
      silhouette: input.silhouette,
      fit: input.fit,
      easeCm: input.easeCm,
      length: input.length,
      baseHeightCm: BASE_MEASUREMENTS.heightCm,
    },
  });
}
