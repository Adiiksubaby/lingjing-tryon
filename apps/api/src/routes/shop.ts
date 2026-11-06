import { shopCategoryInputSchema, shopCategoryPatchSchema, storefrontPatchSchema, type Slot } from '@lingjing/shared';
import type { FastifyInstance } from 'fastify';
import type { Repo, ShopCategoryRow } from '../db.ts';
import { HttpError, parseBody, requireUser } from '../http.ts';
import { nid, nowIso } from '../ids.ts';
import { presentShopCategory, presentStorefront } from '../present.ts';

export function registerShopRoutes(app: FastifyInstance, repo: Repo) {
  const auth = requireUser(repo);
  const staff = requireUser(repo, ['merchant', 'ops']);

  app.get('/api/storefront', { preHandler: auth }, async () => {
    const row = repo.getStorefront();
    if (!row) throw new HttpError(404, '店铺还没有装修信息');
    return presentStorefront(row);
  });

  app.patch('/api/storefront', { preHandler: staff }, async (request) => {
    const parsed = parseBody(storefrontPatchSchema, request.body);
    const existing = repo.getStorefront();
    const row = {
      id: 'store_main',
      shop_name: parsed.shopName,
      announcement: parsed.announcement,
      updated_at: nowIso(),
    };
    if (existing) repo.updateStorefront(row);
    else repo.insertStorefront(row);
    return presentStorefront(row);
  });

  app.get('/api/shop-categories', { preHandler: auth }, async () => {
    return repo.listShopCategories().map(presentShopCategory);
  });

  app.post('/api/shop-categories', { preHandler: staff }, async (request, reply) => {
    const parsed = parseBody(shopCategoryInputSchema, request.body);
    const timestamp = nowIso();
    const row: ShopCategoryRow = {
      id: nid('cat'),
      name: parsed.name,
      slot: parsed.slot,
      sort: parsed.sort ?? repo.nextCategorySort(),
      created_at: timestamp,
      updated_at: timestamp,
    };
    repo.insertShopCategory(row);
    return reply.code(201).send(presentShopCategory(row));
  });

  app.patch('/api/shop-categories/:id', { preHandler: staff }, async (request) => {
    const existing = mustCategory(repo, (request.params as { id: string }).id);
    const parsed = parseBody(shopCategoryPatchSchema, request.body);
    if (parsed.slot && parsed.slot !== existing.slot) {
      const used = repo.listSkus().some((sku) => sku.shop_category_id === existing.id);
      if (used) throw new HttpError(400, '分类里还有商品，不能改部位');
    }
    const row: ShopCategoryRow = {
      ...existing,
      name: parsed.name ?? existing.name,
      slot: parsed.slot ?? existing.slot,
      sort: parsed.sort ?? existing.sort,
      updated_at: nowIso(),
    };
    repo.updateShopCategory(row);
    return presentShopCategory(row);
  });

  app.delete('/api/shop-categories/:id', { preHandler: staff }, async (request, reply) => {
    const existing = mustCategory(repo, (request.params as { id: string }).id);
    repo.deleteShopCategory(existing.id);
    return reply.code(204).send();
  });
}

export function assertShopCategory(repo: Repo, id: string, slot: Slot) {
  const row = repo.getShopCategory(id);
  if (!row) throw new HttpError(400, '没有这个店铺分类');
  if (row.slot !== slot) throw new HttpError(400, '店铺分类的部位和商品类目不一致');
  return row;
}

function mustCategory(repo: Repo, id: string) {
  const row = repo.getShopCategory(id);
  if (!row) throw new HttpError(404, '没有找到分类');
  return row;
}
