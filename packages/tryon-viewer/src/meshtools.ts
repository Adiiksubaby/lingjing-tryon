export type Vec3 = { x: number; y: number; z: number };

export type MeshData = {
  name: string;
  positions: number[];
  indices: number[];
  normals: number[];
  color: [number, number, number, number];
  extras?: Record<string, unknown>;
};

export function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(a: Vec3) {
  return Math.hypot(a.x, a.y, a.z);
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a) || 1;
  return scale(a, 1 / len);
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(a, scale(sub(b, a), t));
}

export class MeshBuilder {
  positions: number[] = [];
  indices: number[] = [];

  get vertexCount() {
    return this.positions.length / 3;
  }

  toMesh(name: string, color: [number, number, number, number], extras?: Record<string, unknown>): MeshData {
    return {
      name,
      positions: this.positions,
      indices: this.indices,
      normals: computeNormals(this.positions, this.indices),
      color,
      extras,
    };
  }
}

export function computeNormals(positions: number[], indices: number[]) {
  const normals = new Array<number>(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]! * 3;
    const ib = indices[i + 1]! * 3;
    const ic = indices[i + 2]! * 3;
    const ax = positions[ia] ?? 0;
    const ay = positions[ia + 1] ?? 0;
    const az = positions[ia + 2] ?? 0;
    const bx = positions[ib] ?? 0;
    const by = positions[ib + 1] ?? 0;
    const bz = positions[ib + 2] ?? 0;
    const cx = positions[ic] ?? 0;
    const cy = positions[ic + 1] ?? 0;
    const cz = positions[ic + 2] ?? 0;
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const index of [ia, ib, ic]) {
      normals[index] = (normals[index] ?? 0) + nx;
      normals[index + 1] = (normals[index + 1] ?? 0) + ny;
      normals[index + 2] = (normals[index + 2] ?? 0) + nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i] ?? 0, normals[i + 1] ?? 0, normals[i + 2] ?? 0) || 1;
    normals[i] = (normals[i] ?? 0) / len;
    normals[i + 1] = (normals[i + 1] ?? 0) / len;
    normals[i + 2] = (normals[i + 2] ?? 0) / len;
  }
  return normals;
}

export function addEllipticTubeY(
  mesh: MeshBuilder,
  y0: number,
  y1: number,
  radiusAt: (t: number) => { rx: number; rz: number },
  segments = 24,
  slices = 10,
) {
  const rings: number[] = [];
  const sliceCount = Math.max(1, slices);
  for (let s = 0; s <= sliceCount; s += 1) {
    const t = s / sliceCount;
    const y = y0 + (y1 - y0) * t;
    const { rx, rz } = radiusAt(t);
    const start = mesh.vertexCount;
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      mesh.positions.push(Math.cos(angle) * rx, y, Math.sin(angle) * rz);
    }
    rings.push(start);
  }
  for (let s = 0; s < sliceCount; s += 1) {
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      const a = rings[s]! + i;
      const b = rings[s]! + next;
      const c = rings[s + 1]! + i;
      const d = rings[s + 1]! + next;
      mesh.indices.push(a, b, c, b, d, c);
    }
  }
}

export function addRod(mesh: MeshBuilder, from: Vec3, to: Vec3, r0: number, r1: number, segments = 14) {
  const direction = sub(to, from);
  const w = normalize(direction);
  const hint = Math.abs(w.y) < 0.9 ? vec(0, 1, 0) : vec(1, 0, 0);
  const u = normalize(cross(hint, w));
  const v = cross(w, u);
  const slices = 5;
  const rings: number[] = [];
  for (let s = 0; s <= slices; s += 1) {
    const t = s / slices;
    const center = lerp(from, to, t);
    const radius = r0 + (r1 - r0) * t;
    const start = mesh.vertexCount;
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const point = add(center, add(scale(u, Math.cos(angle) * radius), scale(v, Math.sin(angle) * radius)));
      mesh.positions.push(point.x, point.y, point.z);
    }
    rings.push(start);
  }
  for (let s = 0; s < slices; s += 1) {
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      const a = rings[s]! + i;
      const b = rings[s]! + next;
      const c = rings[s + 1]! + i;
      const d = rings[s + 1]! + next;
      mesh.indices.push(a, b, c, b, d, c);
    }
  }
}

export function addEllipsoid(mesh: MeshBuilder, center: Vec3, rx: number, ry: number, rz: number, seg = 16, rings = 10) {
  const base = mesh.vertexCount;
  const cols = seg + 1;
  for (let y = 0; y <= rings; y += 1) {
    const phi = (y / rings) * Math.PI;
    const sy = Math.cos(phi);
    const sr = Math.sin(phi);
    for (let x = 0; x <= seg; x += 1) {
      const theta = (x / seg) * Math.PI * 2;
      mesh.positions.push(
        center.x + Math.cos(theta) * sr * rx,
        center.y + sy * ry,
        center.z + Math.sin(theta) * sr * rz,
      );
    }
  }
  for (let y = 0; y < rings; y += 1) {
    for (let x = 0; x < seg; x += 1) {
      const a = base + y * cols + x;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      mesh.indices.push(a, b, c, b, d, c);
    }
  }
}

export function hexToLinearRgba(hex: string): [number, number, number, number] {
  const raw = hex.replace('#', '');
  const value = Number.parseInt(raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw, 16);
  const channels = [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
  return [...channels.map(srgbToLinear), 1] as [number, number, number, number];
}

function srgbToLinear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
