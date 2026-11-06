import {
  missingPhotoAngles,
  stageLabel,
  type AssetDto,
  type FittingItemDto,
  type GarmentParams,
  type JobDto,
  type JobLog,
  type OutfitDto,
  type ProfileDto,
  type RebuildState,
  type SessionDto,
  type ShopCategoryDto,
  type SkuDto,
  type StorefrontDto,
} from '@lingjing/shared';
import type { AssetRow, FittingRow, ImageRow, JobRow, OutfitItemRow, OutfitRow, ProfileRow, Repo, SessionRow, ShopCategoryRow, SkuRow, StorefrontRow } from './db.ts';

export function presentSku(sku: SkuRow, images: ImageRow[], asset: AssetRow | null, latestJob: JobDto | null): SkuDto {
  const missingAngles = missingPhotoAngles(images.map((image) => image.angle));
  return {
    id: sku.id,
    name: sku.name,
    category: sku.category,
    priceCents: sku.price_cents,
    color: sku.color,
    sizes: sku.sizes,
    description: sku.description,
    params: JSON.parse(sku.params_json) as GarmentParams,
    status: sku.status,
    origin: sku.origin,
    shopCategoryId: sku.shop_category_id,
    images: images.map((image) => ({
      id: image.id,
      angle: image.angle,
      url: `/api/images/${image.id}/file`,
    })),
    asset: presentAsset(asset),
    missingAngles,
    rebuildState: rebuildState(sku.status, missingAngles.length > 0, latestJob),
    latestJob,
    createdAt: sku.created_at,
    updatedAt: sku.updated_at,
  };
}

export function presentAsset(asset: AssetRow | null): AssetDto | null {
  if (!asset) return null;
  return {
    id: asset.id,
    url: `/api/assets/${asset.id}/file`,
    format: 'glb',
    meta: JSON.parse(asset.meta_json) as Record<string, unknown>,
  };
}

export function presentJob(job: JobRow, assetId: string | null): JobDto {
  return {
    id: job.id,
    skuId: job.sku_id,
    skuName: job.sku_name,
    status: job.status,
    progress: job.progress,
    error: job.error,
    origin: job.origin,
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    assetId,
    stage: job.stage_key,
    stageLabel: stageLabel(job.stage_key),
    logs: parseLogs(job.logs_json),
    simulateFailure: readSimulate(job.options_json),
  };
}

export function presentProfile(row: ProfileRow): ProfileDto {
  return {
    id: row.id,
    userId: row.user_id,
    nickname: row.nickname,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    shoulderCm: row.shoulder_cm,
    chestCm: row.chest_cm,
    waistCm: row.waist_cm,
    hipCm: row.hip_cm,
    inseamCm: row.inseam_cm,
    armLengthCm: row.arm_cm,
    birthday: row.birthday,
    age: row.age,
    gender: row.gender || 'unspecified',
    phone: row.phone || '',
    avatarUrl: row.avatar_key ? `/api/profiles/${row.id}/avatar/file` : null,
    photoUrl: row.photo_key ? `/api/profiles/${row.id}/photo/file` : null,
    updatedAt: row.updated_at,
  };
}

export function presentStorefront(row: StorefrontRow): StorefrontDto {
  return {
    shopName: row.shop_name,
    announcement: row.announcement,
    updatedAt: row.updated_at,
  };
}

export function presentShopCategory(row: ShopCategoryRow): ShopCategoryDto {
  return {
    id: row.id,
    name: row.name,
    slot: row.slot,
    sort: row.sort,
    updatedAt: row.updated_at,
  };
}

export function presentFitting(row: FittingRow, imageUrl: string | null, assetUrl: string | null): FittingItemDto {
  return {
    id: row.id,
    skuId: row.sku_id,
    skuName: row.sku_name,
    slot: row.slot,
    shopCategoryId: row.shop_category_id,
    shopCategoryName: row.shop_category_name,
    priceCents: row.price_cents,
    color: row.color,
    status: row.status,
    imageUrl,
    assetUrl,
    createdAt: row.created_at,
  };
}

export function presentSession(row: SessionRow, outfitName: string | null): SessionDto {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    profileId: row.profile_id,
    nickname: row.nickname,
    status: row.status,
    origin: row.origin,
    outfitName,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function presentOutfit(row: OutfitRow, items: OutfitItemRow[], assetUrl: (skuId: string) => string | null): OutfitDto {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    name: row.name,
    items: items.map((item) => ({
      id: item.id,
      skuId: item.sku_id,
      skuName: item.sku_name,
      slot: item.slot,
      color: item.color,
      assetUrl: assetUrl(item.sku_id),
    })),
    createdAt: row.created_at,
  };
}

export function skuView(repo: Repo, sku: SkuRow) {
  const latest = repo.listJobs(sku.id)[0] ?? null;
  return presentSku(sku, repo.listImages(sku.id), repo.latestAsset(sku.id), latest ? jobView(repo, latest) : null);
}

function rebuildState(status: SkuRow['status'], missing: boolean, latestJob: JobDto | null): RebuildState {
  if (latestJob && (latestJob.status === 'queued' || latestJob.status === 'running')) return latestJob.status;
  if (latestJob?.status === 'failed') return 'failed';
  if (missing && status !== 'ready') return 'incomplete';
  if (status === 'ready') return 'ready';
  if (missing) return 'incomplete';
  return 'ready_to_build';
}

function parseLogs(raw: string | null): JobLog[] {
  try {
    const value = JSON.parse(raw || '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is JobLog => Boolean(item && typeof item === 'object' && 'message' in item));
  } catch {
    return [];
  }
}

function readSimulate(raw: string | null) {
  try {
    const value = JSON.parse(raw || '{}') as { simulateFailure?: boolean };
    return value.simulateFailure === true;
  } catch {
    return false;
  }
}

export function jobView(repo: Repo, job: JobRow) {
  const asset = repo.latestAsset(job.sku_id);
  const assetId = job.status === 'ready' ? (asset?.job_id === job.id ? asset.id : (asset?.id ?? null)) : null;
  return presentJob(job, job.status === 'ready' ? assetId : null);
}
