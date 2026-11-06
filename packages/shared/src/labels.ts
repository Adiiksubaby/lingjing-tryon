import type {
  Angle,
  Category,
  EventType,
  Fit,
  GarmentLength,
  JobStatus,
  Silhouette,
  SkuStatus,
  Slot,
} from './schemas.ts';

export const CATEGORY_LABEL: Record<Category, string> = {
  top: '上装',
  bottom: '下装',
};

export const SILHOUETTE_LABEL: Record<Silhouette, string> = {
  tee: '短袖 T 恤',
  shirt: '衬衫',
  pants: '长裤',
  skirt: '半裙',
};

export const FIT_LABEL: Record<Fit, string> = {
  slim: '修身',
  regular: '标准',
  relaxed: '宽松',
};

export const LENGTH_LABEL: Record<GarmentLength, string> = {
  short: '短',
  regular: '常规',
  long: '长',
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  queued: '排队中',
  running: '重建中',
  ready: '已完成',
  failed: '失败',
};

export const SKU_STATUS_LABEL: Record<SkuStatus, string> = {
  draft: '待重建',
  processing: '生成中',
  ready: '可试穿',
  failed: '生成失败',
};

export const REBUILD_STAGES = [
  { key: 'intake', label: '接收素材' },
  { key: 'angles', label: '核对角度' },
  { key: 'segment', label: '估计轮廓' },
  { key: 'mesh', label: '生成网格' },
  { key: 'publish', label: '发布到试穿目录' },
] as const;

export type RebuildStageKey = (typeof REBUILD_STAGES)[number]['key'];

export const REQUIRED_PHOTO_ANGLES = ['front', 'side', 'back'] as const;

export type RebuildState = 'incomplete' | 'ready_to_build' | JobStatus;

export const REBUILD_STATE_LABEL: Record<RebuildState, string> = {
  incomplete: '照片未齐',
  ready_to_build: '待重建',
  queued: '排队中',
  running: '重建中',
  ready: '可试穿',
  failed: '重建失败',
};

export function missingPhotoAngles(angles: readonly string[]) {
  return REQUIRED_PHOTO_ANGLES.filter((angle) => !angles.includes(angle));
}

export function stageLabel(key: string | null | undefined) {
  return REBUILD_STAGES.find((stage) => stage.key === key)?.label ?? null;
}

export const ANGLE_LABEL: Record<Angle, string> = {
  front: '正面',
  side: '侧面',
  back: '背面',
  detail: '细节',
};

export const EVENT_LABEL: Record<EventType, string> = {
  browse: '浏览商品',
  try_on: '进入试穿',
  add_to_cart: '加入购物车',
};

export const SLOT_LABEL: Record<Slot, string> = {
  top: '上装',
  bottom: '下装',
};

export const GENDER_LABEL = {
  female: '女',
  male: '男',
  unspecified: '未填',
} as const;
