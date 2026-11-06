import { ANGLE_LABEL, DEMO_PROFILE, type Angle, type Category, type GarmentParams } from '@lingjing/shared';
import type { Config } from './config.ts';
import type { Repo, SkuRow } from './db.ts';
import { nowIso } from './ids.ts';
import { placeholderSvg } from './placeholder.ts';
import { buildGarmentMesh, encodeGlb } from '@lingjing/tryon-viewer/mesh';
import type { ObjectStorage } from './storage.ts';
import { completeJobNow } from './worker.ts';

function portraitSvg(name: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" fill="#efe6da"/>
  <circle cx="120" cy="92" r="42" fill="#e7c2a4"/>
  <path d="M48 210c12-48 36-72 72-72s60 24 72 72" fill="#243652"/>
  <text x="120" y="228" text-anchor="middle" font-size="16" fill="#6b6258" font-family="sans-serif">${name}</text>
</svg>`;
}

const ANGLES: Angle[] = ['front', 'side', 'back'];

type SeedSku = {
  id: string;
  name: string;
  category: Category;
  priceCents: number;
  color: string;
  sizes: string;
  description: string;
  params: GarmentParams;
  offsetMs: number;
};

const CATALOG: SeedSku[] = [
  {
    id: 'sku_apricot_skirt',
    name: '米杏 A 字半裙',
    category: 'bottom',
    priceCents: 19900,
    color: '#e4c7a8',
    sizes: 'S / M / L',
    description: '醋酸混纺，腰头松一点，适合和短袖叠穿。',
    params: { silhouette: 'skirt', fit: 'relaxed', easeCm: 6, length: 'regular', fabric: '醋酸混纺' },
    offsetMs: 1000,
  },
  {
    id: 'sku_ink_jeans',
    name: '墨蓝直筒牛仔裤',
    category: 'bottom',
    priceCents: 25900,
    color: '#243652',
    sizes: '26 / 27 / 28 / 29',
    description: '中腰直筒，裤脚盖住鞋面，作为下装样例。',
    params: { silhouette: 'pants', fit: 'regular', easeCm: 3, length: 'regular', fabric: '棉氨牛仔' },
    offsetMs: 2000,
  },
  {
    id: 'sku_cloud_tee',
    name: '云白圆领短袖',
    category: 'top',
    priceCents: 12900,
    color: '#f4f0e8',
    sizes: 'S / M / L',
    description: '厚实精梳棉，圆领短袖，用来压一层内搭。',
    params: {
      silhouette: 'tee',
      fit: 'regular',
      easeCm: 4,
      length: 'short',
      fabric: '精梳棉',
      notes: '领口不加厚罗纹',
    },
    offsetMs: 3000,
  },
  {
    id: 'sku_linen_shirt',
    name: '亚麻宽松衬衫',
    category: 'top',
    priceCents: 23900,
    color: '#d7c4a3',
    sizes: 'S / M / L',
    description: '水洗亚麻，肩线松一点，可以单穿或罩在短袖外面。',
    params: { silhouette: 'shirt', fit: 'relaxed', easeCm: 6, length: 'regular', fabric: '水洗亚麻' },
    offsetMs: 4000,
  },
];

export async function ensureSeed(repo: Repo, storage: ObjectStorage, config: Config) {
  const createdAt = nowIso();
  repo.upsertUser({ id: 'usr_merchant', role: 'merchant', name: '杭州绫境服饰', token: config.tokens.merchant, createdAt });
  repo.upsertUser({ id: 'usr_consumer', role: 'consumer', name: '林夏', token: config.tokens.consumer, createdAt });
  repo.upsertUser({ id: 'usr_ops', role: 'ops', name: '绫境运营', token: config.tokens.ops, createdAt });
  for (const [key, value] of Object.entries({
    upload_ok: 186,
    upload_fail: 7,
    browse: 860,
    try_on: 240,
    add_to_cart: 76,
    sessions: 128,
  })) {
    repo.ensureBaseline(key, value);
  }

  if (repo.countSkus() === 0) {
    const base = Date.now() - 3 * 60 * 60 * 1000;
    for (const item of CATALOG) {
      await insertSeedSku(repo, storage, item, new Date(base + item.offsetMs).toISOString());
    }
  } else {
    await repairSeedFiles(repo, storage);
    const shirt = CATALOG.find((item) => item.id === 'sku_linen_shirt');
    if (shirt && !repo.getSku(shirt.id)) await insertSeedSku(repo, storage, shirt, nowIso());
  }

  ensureShop(repo);
  await ensurePeople(repo, storage);
}

async function insertSeedSku(repo: Repo, storage: ObjectStorage, item: SeedSku, timestamp: string) {
  const merchant = repo.findUserByRole('merchant');
  if (!merchant) throw new Error('缺少演示商户');
  const sku: SkuRow = {
    id: item.id,
    merchant_id: merchant.id,
    name: item.name,
    category: item.category,
    price_cents: item.priceCents,
    color: item.color,
    sizes: item.sizes,
    description: item.description,
    params_json: JSON.stringify(item.params),
    status: 'processing',
    origin: 'seed',
    shop_category_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  repo.insertSku(sku);
  for (const angle of ANGLES) {
    const imageId = `img_${item.id.replace('sku_', '')}_${angle}`;
    const storageKey = `images/${imageId}.svg`;
    await storage.put(
      storageKey,
      Buffer.from(placeholderSvg({ title: item.name, label: ANGLE_LABEL[angle], color: item.color, silhouette: item.params.silhouette, angle })),
      'image/svg+xml',
    );
    repo.insertImage({
      id: imageId,
      sku_id: item.id,
      angle,
      storage_key: storageKey,
      content_type: 'image/svg+xml',
      created_at: timestamp,
    });
  }
  const jobId = `job_${item.id.replace('sku_', '')}`;
  repo.insertJob({
    id: jobId,
    sku_id: item.id,
    status: 'running',
    progress: 40,
    error: null,
    origin: 'seed',
    created_at: timestamp,
    started_at: timestamp,
    finished_at: null,
  });
  await completeJobNow(repo, storage, jobId);
}

async function repairSeedFiles(repo: Repo, storage: ObjectStorage) {
  for (const sku of repo.listSkus()) {
    if (sku.origin !== 'seed') continue;
    const params = JSON.parse(sku.params_json) as GarmentParams;
    for (const image of repo.listImages(sku.id)) {
      if (await storage.exists(image.storage_key)) continue;
      await storage.put(
        image.storage_key,
        Buffer.from(
          placeholderSvg({
            title: sku.name,
            label: ANGLE_LABEL[image.angle],
            color: sku.color,
            silhouette: params.silhouette,
            angle: image.angle,
          }),
        ),
        'image/svg+xml',
      );
    }
    const asset = repo.latestAsset(sku.id);
    if (!asset || (await storage.exists(asset.storage_key))) continue;
    const glb = encodeGlb(
      buildGarmentMesh({
        silhouette: params.silhouette,
        fit: params.fit,
        easeCm: params.easeCm,
        length: params.length,
        color: sku.color,
      }),
    );
    await storage.put(asset.storage_key, glb, 'model/gltf-binary');
  }
}

function ensureShop(repo: Repo) {
  const timestamp = nowIso();
  if (!repo.getStorefront()) {
    repo.insertStorefront({
      id: 'store_main',
      shop_name: '杭州绫境服饰',
      announcement: '今日试穿免排队。亚麻衬衫可以和牛仔裤叠穿。',
      updated_at: timestamp,
    });
  }
  const categories = [
    { id: 'cat_tops', name: '上装', slot: 'top' as const, sort: 0 },
    { id: 'cat_pants', name: '裤装', slot: 'bottom' as const, sort: 1 },
    { id: 'cat_skirts', name: '裙装', slot: 'bottom' as const, sort: 2 },
  ];
  for (const category of categories) {
    if (!repo.getShopCategory(category.id)) {
      repo.insertShopCategory({ ...category, created_at: timestamp, updated_at: timestamp });
    }
  }
  const links: Record<string, string> = {
    sku_cloud_tee: 'cat_tops',
    sku_linen_shirt: 'cat_tops',
    sku_ink_jeans: 'cat_pants',
    sku_apricot_skirt: 'cat_skirts',
  };
  for (const [skuId, categoryId] of Object.entries(links)) {
    const sku = repo.getSku(skuId);
    if (sku && !sku.shop_category_id) repo.updateSku(skuId, { shopCategoryId: categoryId, updatedAt: timestamp });
  }
}

async function ensurePeople(repo: Repo, storage: ObjectStorage) {
  const timestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  if (!repo.getProfile('prf_linxia')) {
    repo.insertProfile({
      id: 'prf_linxia',
      user_id: 'usr_consumer',
      nickname: DEMO_PROFILE.nickname,
      height_cm: DEMO_PROFILE.heightCm,
      weight_kg: DEMO_PROFILE.weightKg,
      shoulder_cm: DEMO_PROFILE.shoulderCm,
      chest_cm: DEMO_PROFILE.chestCm,
      waist_cm: DEMO_PROFILE.waistCm,
      hip_cm: DEMO_PROFILE.hipCm,
      inseam_cm: DEMO_PROFILE.inseamCm,
      arm_cm: DEMO_PROFILE.armLengthCm,
      avatar_key: null,
      photo_key: null,
      birthday: '1998-04-12',
      age: 28,
      gender: 'female',
      phone: '13800001111',
      updated_at: timestamp,
    });
  } else {
    const row = repo.getProfile('prf_linxia');
    if (row && !row.birthday) {
      repo.updateProfile({
        ...row,
        birthday: '1998-04-12',
        age: row.age ?? 28,
        gender: row.gender === 'male' || row.gender === 'female' ? row.gender : 'female',
        phone: row.phone || '13800001111',
      });
    }
  }
  if (!repo.getProfile('prf_zhouyu')) {
    const photoKey = 'profiles/prf_zhouyu/photo.svg';
    await storage.put(photoKey, Buffer.from(portraitSvg('周予')), 'image/svg+xml');
    repo.insertProfile({
      id: 'prf_zhouyu',
      user_id: 'usr_consumer',
      nickname: '周予',
      height_cm: 176,
      weight_kg: 68,
      shoulder_cm: 42,
      chest_cm: 94,
      waist_cm: 78,
      hip_cm: 96,
      inseam_cm: 82,
      arm_cm: 59,
      avatar_key: null,
      photo_key: photoKey,
      birthday: '2001-09-03',
      age: 25,
      gender: 'male',
      phone: '13900002222',
      updated_at: timestamp,
    });
  }
  repo.backfillArmLength();
  if (repo.countFitting('usr_consumer') === 0) {
    for (const skuId of ['sku_cloud_tee', 'sku_linen_shirt', 'sku_ink_jeans', 'sku_apricot_skirt']) {
      if (!repo.getSku(skuId)) continue;
      repo.insertFitting({ id: `fit_${skuId}`, userId: 'usr_consumer', skuId, createdAt: timestamp });
    }
  }
  if (!repo.getSession('ses_demo')) {
    repo.insertSession({
      id: 'ses_demo',
      user_id: 'usr_consumer',
      profile_id: 'prf_linxia',
      status: 'open',
      origin: 'seed',
      created_at: timestamp,
      updated_at: timestamp,
    });
  }
  if (!repo.getOutfit('out_demo') && repo.getSku('sku_cloud_tee') && repo.getSku('sku_ink_jeans')) {
    repo.insertOutfit(
      {
        id: 'out_demo',
        session_id: 'ses_demo',
        user_id: 'usr_consumer',
        name: '云白圆领短袖 + 墨蓝直筒牛仔裤',
        created_at: timestamp,
      },
      [
        { id: 'oit_demo_top', skuId: 'sku_cloud_tee', slot: 'top', createdAt: timestamp },
        { id: 'oit_demo_bottom', skuId: 'sku_ink_jeans', slot: 'bottom', createdAt: timestamp },
      ],
    );
  }
}
