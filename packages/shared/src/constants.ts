import type { Measurements } from './schemas.ts';

/** 占位服装网格与标准码人台使用的基准尺寸。试穿时相对这套尺寸缩放。 */
export const BASE_MEASUREMENTS: Measurements = {
  heightCm: 170,
  weightKg: 62,
  shoulderCm: 40,
  chestCm: 88,
  waistCm: 72,
  hipCm: 94,
  inseamCm: 78,
  armLengthCm: 56,
};

/**
 * 人脸检测和贴到人模都还没做。照片只存档。
 * 后续实现：识别这张照片里的脸，再贴到参数化人模头部。本期不要接识别服务。
 */
export const FACE_APPLY_LATER = '已上传，后续将识别并贴到人模';

export const DEMO_PROFILE = {
  nickname: '林夏',
  heightCm: 168,
  weightKg: 56,
  shoulderCm: 38,
  chestCm: 84,
  waistCm: 66,
  hipCm: 90,
  inseamCm: 76,
  armLengthCm: 55,
} as const;
