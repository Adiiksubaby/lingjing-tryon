import {
  ANGLE_LABEL,
  jobCreateSchema,
  missingPhotoAngles,
  silhouetteMatches,
  skuCreateSchema,
  skuPatchSchema,
  type Angle,
} from '@lingjing/shared';
import type { FastifyInstance } from 'fastify';
import type { Repo } from '../db.ts';
import { currentUser, HttpError, parseBody, requireUser, sendStored } from '../http.ts';
import { nid, nowIso } from '../ids.ts';
import { jobView, presentAsset, skuView } from '../present.ts';
import { assertShopCategory } from './shop.ts';
import type { ObjectStorage } from '../storage.ts';

const ANGLES = ['front', 'side', 'back', 'detail'] as const;

export function registerCatalogRoutes(app: FastifyInstance, repo: Repo, storage: ObjectStorage) {
  const auth = requireUser(repo);
  const merchant = requireUser(repo, ['merchant']);
  const staff = requireUser(repo, ['merchant', 'ops']);

  app.get('/api/skus', { preHandler: auth }, async (request) => {
    const readyOnly = (request.query as { ready?: string }).ready === '1';
    const skus = repo.listSkus().map((sku) => skuView(repo, sku));
    return readyOnly ? skus.filter((sku) => sku.status === 'ready' && sku.asset) : skus;
  });

  app.get('/api/skus/:id', { preHandler: auth }, async (request) => {
    const sku = mustSku(repo, (request.params as { id: string }).id);
    return skuView(repo, sku);
  });

  app.post('/api/skus', { preHandler: merchant }, async (request) => {
    const user = currentUser(request);
    const { fields, files } = await readMultipart(request);
    const parsed = parseBody(skuCreateSchema, {
      name: fields.name,
      category: fields.category,
      shopCategoryId: blankToUndefined(fields.shopCategoryId),
      priceYuan: numberOrNan(fields.priceYuan),
      color: fields.color,
      sizes: fields.sizes,
      description: blankToUndefined(fields.description),
      params: {
        silhouette: fields.silhouette,
        fit: fields.fit,
        easeCm: numberOrNan(fields.easeCm),
        length: fields.length,
        fabric: fields.fabric,
        notes: blankToUndefined(fields.notes),
      },
    });
    const timestamp = nowIso();
    const skuId = nid('sku');
    const written: string[] = [];
    repo.insertSku({
      id: skuId,
      merchant_id: user.id,
      name: parsed.name,
      category: parsed.category,
      price_cents: Math.round(parsed.priceYuan * 100),
      color: parsed.color,
      sizes: parsed.sizes,
      description: parsed.description ?? '',
      params_json: JSON.stringify(parsed.params),
      status: 'draft',
      origin: 'live',
      shop_category_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
    if (parsed.shopCategoryId) {
      assertShopCategory(repo, parsed.shopCategoryId, parsed.category);
      repo.updateSku(skuId, { shopCategoryId: parsed.shopCategoryId, updatedAt: timestamp });
    }
    try {
      for (const [angle, file] of files) {
        const imageId = nid('img');
        const storageKey = `images/${imageId}`;
        await storage.put(storageKey, file.bytes, file.contentType);
        written.push(storageKey);
        repo.insertImage({
          id: imageId,
          sku_id: skuId,
          angle,
          storage_key: storageKey,
          content_type: file.contentType,
          created_at: timestamp,
        });
      }
      return { sku: skuView(repo, mustSku(repo, skuId)) };
    } catch (error) {
      repo.deleteSku(skuId);
      await Promise.all(written.map((key) => storage.remove(key)));
      throw error;
    }
  });

  app.post('/api/skus/:id/images', { preHandler: merchant }, async (request) => {
    const user = currentUser(request);
    const sku = mustSku(repo, (request.params as { id: string }).id);
    if (sku.merchant_id !== user.id) throw new HttpError(403, '只能修改自己的商品');
    if (repo.hasActiveJob(sku.id)) throw new HttpError(409, '重建进行中，暂时不能改照片');
    const { files } = await readMultipart(request);
    if (files.size === 0) throw new HttpError(400, '请选择要上传的照片');
    const existing = repo.listImages(sku.id);
    const detailCount = existing.filter((image) => image.angle === 'detail').length;
    if (files.has('detail') && detailCount >= 3) throw new HttpError(400, '细节图最多 3 张');
    const replaced = existing.filter((image) => image.angle !== 'detail' && files.has(image.angle)).length;
    if (existing.length - replaced + files.size > 6) throw new HttpError(400, '每个商品最多 6 张照片');
    for (const [angle, file] of files) {
      if (angle !== 'detail') {
        for (const image of existing.filter((item) => item.angle === angle)) {
          await storage.remove(image.storage_key);
          repo.deleteImage(image.id);
        }
      }
      const imageId = nid('img');
      const storageKey = `images/${imageId}`;
      await storage.put(storageKey, file.bytes, file.contentType);
      repo.insertImage({
        id: imageId,
        sku_id: sku.id,
        angle,
        storage_key: storageKey,
        content_type: file.contentType,
        created_at: nowIso(),
      });
    }
    return skuView(repo, mustSku(repo, sku.id));
  });

  app.delete('/api/skus/:id/images/:imageId', { preHandler: merchant }, async (request, reply) => {
    const user = currentUser(request);
    const params = request.params as { id: string; imageId: string };
    const sku = mustSku(repo, params.id);
    if (sku.merchant_id !== user.id) throw new HttpError(403, '只能修改自己的商品');
    if (repo.hasActiveJob(sku.id)) throw new HttpError(409, '重建进行中，暂时不能改照片');
    const image = repo.getImage(params.imageId);
    if (!image || image.sku_id !== sku.id) throw new HttpError(404, '没有找到照片');
    await storage.remove(image.storage_key);
    repo.deleteImage(image.id);
    return reply.code(204).send();
  });

  app.patch('/api/skus/:id', { preHandler: merchant }, async (request) => {
    const user = currentUser(request);
    const sku = mustSku(repo, (request.params as { id: string }).id);
    if (sku.merchant_id !== user.id) throw new HttpError(403, '只能修改自己的商品');
    const parsed = parseBody(skuPatchSchema, request.body);
    if (parsed.params && !silhouetteMatches(sku.category, parsed.params.silhouette)) {
      throw new HttpError(400, '版型与类目不匹配', [{ path: 'params.silhouette', message: '版型与类目不匹配' }]);
    }
    if (parsed.shopCategoryId) assertShopCategory(repo, parsed.shopCategoryId, sku.category);
    repo.updateSku(sku.id, {
      name: parsed.name,
      shopCategoryId: parsed.shopCategoryId,
      priceCents: parsed.priceYuan === undefined ? undefined : Math.round(parsed.priceYuan * 100),
      color: parsed.color,
      sizes: parsed.sizes,
      description: parsed.description,
      paramsJson: parsed.params ? JSON.stringify(parsed.params) : undefined,
      updatedAt: nowIso(),
    });
    return skuView(repo, mustSku(repo, sku.id));
  });

  app.delete('/api/skus/:id', { preHandler: merchant }, async (request, reply) => {
    const user = currentUser(request);
    const sku = mustSku(repo, (request.params as { id: string }).id);
    if (sku.merchant_id !== user.id) throw new HttpError(403, '只能删除自己的商品');
    const images = repo.listImages(sku.id);
    const assets = repo.listAssets().filter((asset) => asset.sku_id === sku.id);
    repo.deleteSku(sku.id);
    await Promise.all([
      ...images.map((image) => storage.remove(image.storage_key)),
      ...assets.map((asset) => storage.remove(asset.storage_key)),
    ]);
    return reply.code(204).send();
  });

  app.post('/api/skus/:id/jobs', { preHandler: merchant }, async (request) => {
    const user = currentUser(request);
    const sku = mustSku(repo, (request.params as { id: string }).id);
    if (sku.merchant_id !== user.id) throw new HttpError(403, '只能重建自己的商品');
    const images = repo.listImages(sku.id);
    const missing = missingPhotoAngles(images.map((image) => image.angle));
    if (missing.length > 0) {
      throw new HttpError(400, `还不能重建：缺少${missing.map((angle) => ANGLE_LABEL[angle]).join('、')}。请补齐后再试。`);
    }
    if (repo.hasActiveJob(sku.id)) throw new HttpError(409, '已有进行中的重建任务');
    const options = parseBody(jobCreateSchema, request.body ?? {});
    const timestamp = nowIso();
    const jobId = nid('job');
    repo.insertJob({
      id: jobId,
      sku_id: sku.id,
      status: 'queued',
      progress: 0,
      error: null,
      origin: 'live',
      created_at: timestamp,
      started_at: null,
      finished_at: null,
      options: { simulateFailure: options.simulateFailure === true },
    });
    repo.updateSku(sku.id, { status: 'processing', updatedAt: timestamp });
    const job = repo.getJob(jobId);
    if (!job) throw new HttpError(500, '任务没有写进队列');
    return jobView(repo, job);
  });

  app.get('/api/jobs', { preHandler: staff }, async (request) => {
    const skuId = (request.query as { skuId?: string }).skuId;
    return repo.listJobs(skuId).map((job) => jobView(repo, job));
  });

  app.get('/api/jobs/:id', { preHandler: staff }, async (request) => {
    const job = repo.getJob((request.params as { id: string }).id);
    if (!job) throw new HttpError(404, '没有找到重建任务');
    return jobView(repo, job);
  });

  app.get('/api/assets/:id', { preHandler: auth }, async (request) => {
    const asset = repo.getAsset((request.params as { id: string }).id);
    if (!asset) throw new HttpError(404, '没有找到样衣文件');
    return presentAsset(asset);
  });

  app.get('/api/assets/:id/file', async (request, reply) => {
    const asset = repo.getAsset((request.params as { id: string }).id);
    if (!asset) throw new HttpError(404, '没有找到样衣文件');
    const file = await storage.get(asset.storage_key);
    if (!file) throw new HttpError(404, '样衣文件还没有写入存储');
    return sendStored(reply, file, `${asset.id}.glb`);
  });

  app.get('/api/images/:id/file', async (request, reply) => {
    const image = repo.getImage((request.params as { id: string }).id);
    if (!image) throw new HttpError(404, '没有找到照片');
    const file = await storage.get(image.storage_key);
    if (!file) throw new HttpError(404, '照片文件不存在');
    return sendStored(reply, file, `${image.angle}`);
  });
}

function mustSku(repo: Repo, id: string) {
  const sku = repo.getSku(id);
  if (!sku) throw new HttpError(404, '没有找到商品');
  return sku;
}

function numberOrNan(value: string | undefined) {
  if (value === undefined || value.trim() === '') return Number.NaN;
  return Number(value);
}

function blankToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function readMultipart(request: { parts: () => AsyncIterable<MultipartPart> }) {
  const fields: Record<string, string> = {};
  const files = new Map<Angle, { filename: string; contentType: string; bytes: Buffer }>();
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      const angle = part.fieldname.replace(/^image_/, '');
      if (!ANGLES.includes(angle as (typeof ANGLES)[number])) throw new HttpError(400, `无法识别的照片字段 ${part.fieldname}`);
      if (files.has(angle as Angle)) throw new HttpError(400, '同一角度请只上传一张');
      const bytes = await part.toBuffer();
      const contentType = normalizeImageType(part.mimetype);
      if (!contentType) throw new HttpError(400, `「${part.filename || angle}」不是支持的图片。请上传 JPG、PNG 或 WEBP。`);
      if (bytes.byteLength === 0) throw new HttpError(400, '照片内容为空');
      files.set(angle as Angle, { filename: part.filename, contentType, bytes });
    } else {
      fields[part.fieldname] = String(part.value ?? '');
    }
  }
  return { fields, files };
}

function normalizeImageType(type: string) {
  const value = type === 'image/jpg' ? 'image/jpeg' : type;
  if (['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'].includes(value)) return value;
  return null;
}

type MultipartPart =
  | {
      type: 'file';
      fieldname: string;
      filename: string;
      mimetype: string;
      toBuffer: () => Promise<Buffer>;
    }
  | { type: 'field'; fieldname: string; value: unknown };
