import type {
  Angle,
  Category,
  EventType,
  GarmentParams,
  Gender,
  JobStatus,
  Origin,
  Role,
  SessionStatus,
  SkuStatus,
  Slot,
} from './schemas.ts';
import type { RebuildState } from './labels.ts';

export type JobLog = {
  at: string;
  stage: string;
  message: string;
};

export type ImageDto = {
  id: string;
  angle: Angle;
  url: string;
};

export type AssetDto = {
  id: string;
  url: string;
  format: 'glb';
  meta: Record<string, unknown>;
};

export type SkuDto = {
  id: string;
  name: string;
  category: Category;
  priceCents: number;
  color: string;
  sizes: string;
  description: string;
  params: GarmentParams;
  status: SkuStatus;
  origin: Origin;
  shopCategoryId: string | null;
  images: ImageDto[];
  asset: AssetDto | null;
  missingAngles: Angle[];
  rebuildState: RebuildState;
  latestJob: JobDto | null;
  createdAt: string;
  updatedAt: string;
};

export type JobDto = {
  id: string;
  skuId: string;
  skuName: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  origin: Origin;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  assetId: string | null;
  stage: string | null;
  stageLabel: string | null;
  logs: JobLog[];
  simulateFailure: boolean;
};

export type ProfileDto = {
  id: string;
  userId: string;
  nickname: string;
  heightCm: number;
  weightKg: number;
  shoulderCm: number;
  chestCm: number;
  waistCm: number;
  hipCm: number;
  inseamCm: number | null;
  armLengthCm: number | null;
  birthday: string | null;
  age: number | null;
  gender: Gender;
  phone: string;
  avatarUrl: string | null;
  photoUrl: string | null;
  updatedAt: string;
};

export type StorefrontDto = {
  shopName: string;
  announcement: string;
  updatedAt: string;
};

export type ShopCategoryDto = {
  id: string;
  name: string;
  slot: Slot;
  sort: number;
  updatedAt: string;
};

export type FittingItemDto = {
  id: string;
  skuId: string;
  skuName: string;
  slot: Slot;
  shopCategoryId: string | null;
  shopCategoryName: string | null;
  priceCents: number;
  color: string;
  status: SkuStatus;
  imageUrl: string | null;
  assetUrl: string | null;
  createdAt: string;
};

export type SessionDto = {
  id: string;
  userId: string;
  userName: string;
  profileId: string;
  nickname: string;
  status: SessionStatus;
  origin: Origin;
  outfitName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OutfitItemDto = {
  id: string;
  skuId: string;
  skuName: string;
  slot: Slot;
  color: string;
  assetUrl: string | null;
};

export type OutfitDto = {
  id: string;
  sessionId: string;
  userId: string;
  name: string;
  items: OutfitItemDto[];
  createdAt: string;
};

export type MetricsDto = {
  uploadSuccessRate: number;
  uploadSucceeded: number;
  uploadFailed: number;
  rebuildQueueDepth: number;
  rebuildRunning: number;
  tryOnSessions: number;
  profiles: number;
  funnel: { key: EventType; label: string; count: number }[];
  recentJobs: JobDto[];
  recentSessions: SessionDto[];
  updatedAt: string;
};

export type DemoSessionDto = {
  token: string;
  role: Role;
  name: string;
  id: string;
};
