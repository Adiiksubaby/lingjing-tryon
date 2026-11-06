import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ageFromBirthday, type MetricsDto, type SkuDto } from '@lingjing/shared';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function multipart(
  fields: Record<string, string>,
  files: Record<string, { filename: string; content: Buffer; type: string }>,
) {
  const boundary = '----lingjingtest';
  const chunks: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  }
  for (const [key, file] of Object.entries(files)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
    );
    chunks.push(file.content);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function boot() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-'));
  const config = loadConfig({
    DATA_DIR: dataDir,
    JOB_DELAY_MS: '0',
    PORT: '0',
    STORAGE_DRIVER: 'local',
    DEMO_MERCHANT_TOKEN: 'demo-merchant',
    DEMO_CONSUMER_TOKEN: 'demo-consumer',
    DEMO_OPS_TOKEN: 'demo-ops',
  });
  const built = await buildApp({ config, logger: false, startWorker: false });
  return {
    ...built,
    async close() {
      await built.app.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

test('健康检查、鉴权和种子商品', async () => {
  const { app, close } = await boot();
  try {
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().database, 'sqlite');

    const denied = await app.inject({ method: 'GET', url: '/api/skus' });
    assert.equal(denied.statusCode, 401);

    const auth = await app.inject({
      method: 'POST',
      url: '/api/auth/demo',
      payload: { role: 'merchant' },
    });
    assert.equal(auth.statusCode, 200);
    assert.equal(auth.json().token, 'demo-merchant');

    const list = await app.inject({
      method: 'GET',
      url: '/api/skus',
      headers: { authorization: 'Bearer demo-consumer' },
    });
    assert.equal(list.statusCode, 200);
    const skus = list.json() as SkuDto[];
    assert.equal(skus.length, 4);
    const tee = skus.find((sku) => sku.id === 'sku_cloud_tee');
    assert.ok(tee?.asset);
    assert.equal(tee?.status, 'ready');
    assert.equal(tee?.shopCategoryId, 'cat_tops');
    assert.ok(skus.some((sku) => sku.id === 'sku_linen_shirt'));

    const file = await app.inject({ method: 'GET', url: tee!.asset!.url });
    assert.equal(file.statusCode, 200);
    assert.equal(file.headers['content-type'], 'model/gltf-binary');
    assert.equal(file.rawPayload.subarray(0, 4).toString('utf8'), 'glTF');

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/metrics',
      headers: { authorization: 'Bearer demo-merchant' },
    });
    assert.equal(forbidden.statusCode, 403);
    const metrics = await app.inject({
      method: 'GET',
      url: '/api/metrics',
      headers: { authorization: 'Bearer demo-ops' },
    });
    assert.equal(metrics.statusCode, 200);
    const body = metrics.json() as MetricsDto;
    assert.ok(body.uploadSuccessRate > 0.9);
    assert.equal(body.funnel[0]?.label, '浏览商品');
    assert.equal(body.rebuildQueueDepth, 0);
    assert.equal(body.profiles, 2);
  } finally {
    await close();
  }
});

test('上传商品后工人写出可加载的 GLB', async () => {
  const { app, worker, close } = await boot();
  try {
    const form = multipart(
      {
        name: '测试衬衫',
        category: 'top',
        priceYuan: '189',
        color: '#8d3b2f',
        sizes: 'M',
        description: '接口测试',
        silhouette: 'shirt',
        fit: 'relaxed',
        easeCm: '5',
        length: 'regular',
        fabric: '府绸',
      },
      {
        image_front: { filename: 'front.png', content: PNG, type: 'image/png' },
        image_side: { filename: 'side.png', content: PNG, type: 'image/png' },
        image_back: { filename: 'back.png', content: PNG, type: 'image/png' },
      },
    );
    const created = await app.inject({
      method: 'POST',
      url: '/api/skus',
      headers: { authorization: 'Bearer demo-merchant', 'content-type': form.contentType },
      payload: form.body,
    });
    assert.equal(created.statusCode, 200, created.body);
    assert.equal(created.json().sku.rebuildState, 'ready_to_build');
    const queued = await app.inject({
      method: 'POST',
      url: `/api/skus/${created.json().sku.id}/jobs`,
      headers: { authorization: 'Bearer demo-merchant', 'content-type': 'application/json' },
      payload: {},
    });
    assert.equal(queued.statusCode, 200, queued.body);
    assert.equal(queued.json().status, 'queued');
    await worker.tick();
    const sku = await app.inject({
      method: 'GET',
      url: `/api/skus/${created.json().sku.id}`,
      headers: { authorization: 'Bearer demo-merchant' },
    });
    const ready = sku.json() as SkuDto;
    assert.equal(ready.status, 'ready');
    assert.equal(ready.asset?.meta.pipeline, 'stub-v1');
    assert.ok((ready.latestJob?.logs.length ?? 0) >= 5);
    const glb = await app.inject({ method: 'GET', url: ready.asset!.url });
    assert.equal(glb.rawPayload.subarray(0, 4).toString('utf8'), 'glTF');

    const simulated = await app.inject({
      method: 'POST',
      url: `/api/skus/${ready.id}/jobs`,
      headers: { authorization: 'Bearer demo-merchant', 'content-type': 'application/json' },
      payload: { simulateFailure: true },
    });
    assert.equal(simulated.statusCode, 200, simulated.body);
    await worker.tick();
    const failed = await app.inject({
      method: 'GET',
      url: `/api/skus/${ready.id}`,
      headers: { authorization: 'Bearer demo-merchant' },
    });
    assert.equal(failed.json().rebuildState, 'failed');
    assert.match(failed.json().latestJob.error as string, /演示/);
    assert.equal(failed.json().status, 'ready');

    const side = ready.images.find((image) => image.angle === 'side');
    assert.ok(side);
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/skus/${ready.id}/images/${side.id}`,
      headers: { authorization: 'Bearer demo-merchant' },
    });
    assert.equal(removed.statusCode, 204);
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/skus/${ready.id}/jobs`,
      headers: { authorization: 'Bearer demo-merchant', 'content-type': 'application/json' },
      payload: {},
    });
    assert.equal(blocked.statusCode, 400);
    const restored = multipart({}, { image_side: { filename: 'side.png', content: PNG, type: 'image/png' } });
    const added = await app.inject({
      method: 'POST',
      url: `/api/skus/${ready.id}/images`,
      headers: { authorization: 'Bearer demo-merchant', 'content-type': restored.contentType },
      payload: restored.body,
    });
    assert.equal(added.statusCode, 200, added.body);
    assert.equal(added.json().missingAngles.length, 0);

    const mismatch = multipart(
      {
        name: '坏搭配',
        category: 'top',
        priceYuan: '10',
        color: '#112233',
        sizes: 'M',
        silhouette: 'pants',
        fit: 'regular',
        easeCm: '2',
        length: 'regular',
        fabric: '棉',
      },
      {
        image_front: { filename: 'a.png', content: PNG, type: 'image/png' },
        image_side: { filename: 'b.png', content: PNG, type: 'image/png' },
        image_back: { filename: 'c.png', content: PNG, type: 'image/png' },
      },
    );
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/skus',
      headers: { authorization: 'Bearer demo-merchant', 'content-type': mismatch.contentType },
      payload: mismatch.body,
    });
    assert.equal(rejected.statusCode, 400);
  } finally {
    await close();
  }
});

test('身材、会话、搭配和漏斗事件', async () => {
  const { app, close } = await boot();
  try {
    const consumer = { authorization: 'Bearer demo-consumer' };
    const bad = await app.inject({
      method: 'PATCH',
      url: '/api/profiles/prf_linxia',
      headers: { ...consumer, 'content-type': 'application/json' },
      payload: { nickname: '林夏', heightCm: 10, weightKg: 56, shoulderCm: 38, chestCm: 84, waistCm: 66, hipCm: 90 },
    });
    assert.equal(bad.statusCode, 400);

    const saved = await app.inject({
      method: 'PATCH',
      url: '/api/profiles/prf_linxia',
      headers: { ...consumer, 'content-type': 'application/json' },
      payload: {
        nickname: '林夏',
        heightCm: 172,
        weightKg: 60,
        shoulderCm: 41,
        chestCm: 90,
        waistCm: 70,
        hipCm: 96,
        inseamCm: 80,
        armLengthCm: 58,
      },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().armLengthCm, 58);
    assert.equal(saved.json().inseamCm, 80);
    assert.equal(saved.json().heightCm, 172);
    assert.equal(saved.json().phone, '13800001111');
    assert.equal(saved.json().birthday, '1998-04-12');

    const session = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { ...consumer, 'content-type': 'application/json' },
      payload: { profileId: 'prf_linxia' },
    });
    assert.equal(session.statusCode, 201);
    const outfit = await app.inject({
      method: 'POST',
      url: '/api/outfits',
      headers: { ...consumer, 'content-type': 'application/json' },
      payload: {
        sessionId: session.json().id,
        items: [
          { skuId: 'sku_cloud_tee', slot: 'top' },
          { skuId: 'sku_ink_jeans', slot: 'bottom' },
        ],
      },
    });
    assert.equal(outfit.statusCode, 201, outfit.body);
    assert.equal(outfit.json().items.length, 2);

    const before = await app.inject({
      method: 'GET',
      url: '/api/metrics',
      headers: { authorization: 'Bearer demo-ops' },
    });
    const cartBefore = (before.json() as MetricsDto).funnel.find((item) => item.key === 'add_to_cart')?.count ?? 0;
    const event = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { ...consumer, 'content-type': 'application/json' },
      payload: { type: 'add_to_cart', sessionId: session.json().id, skuId: 'sku_cloud_tee' },
    });
    assert.equal(event.statusCode, 201);
    const after = await app.inject({
      method: 'GET',
      url: '/api/metrics',
      headers: { authorization: 'Bearer demo-ops' },
    });
    const cartAfter = (after.json() as MetricsDto).funnel.find((item) => item.key === 'add_to_cart')?.count ?? 0;
    assert.equal(cartAfter, cartBefore + 1);

    const denied = await app.inject({
      method: 'POST',
      url: '/api/skus/sku_cloud_tee/jobs',
      headers: consumer,
    });
    assert.equal(denied.statusCode, 403);
  } finally {
    await close();
  }
});

test('店铺装修、分类、试衣间清单和人员档案', async () => {
  const { app, close } = await boot();
  try {
    const consumer = { authorization: 'Bearer demo-consumer' };
    const merchant = { authorization: 'Bearer demo-merchant', 'content-type': 'application/json' };
    const store = await app.inject({ method: 'GET', url: '/api/storefront', headers: consumer });
    assert.equal(store.statusCode, 200);
    assert.match(store.json().shopName, /绫境/);

    const renamed = await app.inject({
      method: 'PATCH',
      url: '/api/storefront',
      headers: merchant,
      payload: { shopName: '绫境旗舰店', announcement: '今晚八点上新' },
    });
    assert.equal(renamed.statusCode, 200);
    assert.equal(renamed.json().announcement, '今晚八点上新');

    const categories = await app.inject({ method: 'GET', url: '/api/shop-categories', headers: consumer });
    assert.equal(categories.statusCode, 200);
    const rows = categories.json() as { id: string; name: string; slot: string }[];
    assert.ok(rows.some((row) => row.name === '上装' && row.slot === 'top'));
    const created = await app.inject({
      method: 'POST',
      url: '/api/shop-categories',
      headers: merchant,
      payload: { name: '外套', slot: 'top' },
    });
    assert.equal(created.statusCode, 201, created.body);

    const fitting = await app.inject({ method: 'GET', url: '/api/fitting-room', headers: consumer });
    assert.equal(fitting.statusCode, 200);
    const items = fitting.json() as { skuId: string; slot: string; shopCategoryName: string | null }[];
    assert.ok(items.some((item) => item.skuId === 'sku_cloud_tee' && item.slot === 'top'));
    assert.ok(items.some((item) => item.skuId === 'sku_linen_shirt' && item.shopCategoryName === '上装'));
    const again = await app.inject({
      method: 'POST',
      url: '/api/fitting-room',
      headers: { ...consumer, 'content-type': 'application/json' },
      payload: { skuId: 'sku_cloud_tee' },
    });
    assert.equal(again.statusCode, 200);

    const people = await app.inject({ method: 'GET', url: '/api/profiles', headers: consumer });
    const profiles = people.json() as { nickname: string; photoUrl: string | null; gender: string }[];
    assert.ok(profiles.some((profile) => profile.nickname === '周予' && profile.photoUrl && profile.gender === 'male'));

    const born = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      headers: { ...consumer, 'content-type': 'application/json' },
      payload: {
        nickname: '陈麦',
        heightCm: 160,
        weightKg: 50,
        shoulderCm: 36,
        chestCm: 80,
        waistCm: 64,
        hipCm: 88,
        birthday: '2000-01-02',
        gender: 'female',
        phone: '13700003333',
      },
    });
    assert.equal(born.statusCode, 201, born.body);
    assert.equal(born.json().age, ageFromBirthday('2000-01-02'));
    assert.equal(born.json().phone, '13700003333');
  } finally {
    await close();
  }
});
