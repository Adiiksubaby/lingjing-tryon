import type { MeshData } from './meshtools.ts';

function align4(value: number) {
  return (value + 3) & ~3;
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function bounds(positions: Float32Array) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis] ?? 0;
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  return { min, max };
}

/** 写一个单网格、无贴图的 glTF 2.0 二进制。baseColorFactor 按规范使用线性颜色。 */
export function encodeGlb(mesh: MeshData): Uint8Array {
  const positions = Float32Array.from(mesh.positions);
  const normals = Float32Array.from(mesh.normals);
  const indices = Uint32Array.from(mesh.indices);
  const { min, max } = bounds(positions);

  const posBytes = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength);
  const nrmBytes = new Uint8Array(normals.buffer, normals.byteOffset, normals.byteLength);
  const idxBytes = new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength);
  const nrmOffset = align4(posBytes.length);
  const idxOffset = align4(nrmOffset + nrmBytes.length);
  const binLength = align4(idxOffset + idxBytes.length);
  const bin = new Uint8Array(binLength);
  bin.set(posBytes, 0);
  bin.set(nrmBytes, nrmOffset);
  bin.set(idxBytes, idxOffset);

  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'lingjing-mvp' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: mesh.name }],
    meshes: [
      {
        name: mesh.name,
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0,
            mode: 4,
          },
        ],
        extras: mesh.extras ?? {},
      },
    ],
    materials: [
      {
        name: 'cloth',
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: mesh.color,
          metallicFactor: 0,
          roughnessFactor: 0.86,
        },
      },
    ],
    buffers: [{ byteLength: binLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: nrmOffset, byteLength: nrmBytes.length, target: 34962 },
      { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes.length, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min,
        max,
      },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
  });

  const jsonRaw = new TextEncoder().encode(json);
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunk = concat([jsonRaw, new Uint8Array(jsonPad).fill(0x20)]);
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  return concat([
    u32(0x46546c67),
    u32(2),
    u32(total),
    u32(jsonChunk.length),
    u32(0x4e4f534a),
    jsonChunk,
    u32(bin.length),
    u32(0x004e4942),
    bin,
  ]);
}
