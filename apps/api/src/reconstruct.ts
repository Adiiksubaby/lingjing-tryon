import { REBUILD_STAGES, type Category, type GarmentParams, type RebuildStageKey } from '@lingjing/shared';
import { buildGarmentMesh, encodeGlb } from '@lingjing/tryon-viewer/mesh';

export type ReconstructImage = {
  angle: string;
  bytes: Uint8Array;
  contentType: string;
};

export type ReconstructInput = {
  skuId: string;
  category: Category;
  color: string;
  params: GarmentParams;
  images: ReconstructImage[];
};

export type ReconstructResult = {
  glb: Uint8Array;
  meta: Record<string, unknown>;
};

export type ReconstructionAdapter = {
  id: string;
  reconstruct(input: ReconstructInput): Promise<ReconstructResult>;
};

const ANGLE_LABEL: Record<string, string> = {
  front: '正面',
  side: '侧面',
  back: '背面',
};

export const STAGE_LOG: Record<RebuildStageKey, string> = {
  intake: '已接收照片，开始检查文件是否可读。',
  angles: '正面、侧面、背面都在，角度检查通过。',
  segment: '演示步骤：按类目估计服装区域，没有跑分割模型。',
  mesh: '按版型、松量和衣长生成占位网格。照片像素未参与几何。',
  publish: '正在把网格写入样衣资产。',
};

export const PUBLISHED_LOG = '样衣已发布。消费者试衣目录现在可以选到这件衣服。';

export const SIMULATED_FAILURE = '生成网格失败：这是演示用的失败。去掉「模拟失败」后重试即可。真实服务失败时，这里会显示对方返回的原因。';

/**
 * 重建适配器。
 * 本地默认是 stub：校验照片后按版型写占位 GLB。
 * 换成真实服务时，实现 ReconstructionAdapter.reconstruct，并在 createReconstructionAdapter 里按环境变量返回它。
 * 阶段推进仍由 worker 调用；真实服务若自己有任务 id，可在 reconstruct 里轮询直到拿到 GLB。
 */
export function createReconstructionAdapter(kind = process.env.RECONSTRUCTION_ADAPTER ?? 'stub'): ReconstructionAdapter {
  if (kind === 'stub' || kind === 'stub-v1') return stubReconstructionAdapter;
  throw new Error(`未知重建适配器「${kind}」。当前只内置 stub，见 README。`);
}

export const stubReconstructionAdapter: ReconstructionAdapter = {
  id: 'stub-v1',
  reconstruct: reconstructGarment,
};

export async function reconstructGarment(input: ReconstructInput): Promise<ReconstructResult> {
  const angles = new Set(input.images.map((image) => image.angle));
  for (const angle of ['front', 'side', 'back']) {
    if (!angles.has(angle)) throw new Error(`缺少${ANGLE_LABEL[angle] ?? angle}照片`);
  }
  for (const image of input.images) {
    if (!image.contentType.startsWith('image/')) throw new Error('照片格式无法识别');
    if (image.bytes.byteLength === 0) throw new Error('照片内容为空');
  }
  const glb = encodeGlb(
    buildGarmentMesh({
      silhouette: input.params.silhouette,
      fit: input.params.fit,
      easeCm: input.params.easeCm,
      length: input.params.length,
      color: input.color,
    }),
  );
  return {
    glb,
    meta: {
      pipeline: 'stub-v1',
      adapter: 'stub-v1',
      stages: REBUILD_STAGES.map((stage) => stage.key),
      category: input.category,
      imageCount: input.images.length,
      angles: input.images.map((image) => image.angle),
      imageBytes: input.images.reduce((sum, image) => sum + image.bytes.byteLength, 0),
      silhouette: input.params.silhouette,
      note: '占位网格，由版型参数生成，未使用照片像素。',
    },
  };
}
