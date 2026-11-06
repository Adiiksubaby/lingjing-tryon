import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  Angle,
  Category,
  EventType,
  Gender,
  JobStatus,
  Origin,
  Role,
  SessionStatus,
  SkuStatus,
  Slot,
} from '@lingjing/shared';
import { STAGE_LOG } from './reconstruct.ts';

type Bind = string | number | null;

export type UserRow = {
  id: string;
  role: Role;
  name: string;
  token: string;
  created_at: string;
};

export type SkuRow = {
  id: string;
  merchant_id: string;
  name: string;
  category: Category;
  price_cents: number;
  color: string;
  sizes: string;
  description: string;
  params_json: string;
  status: SkuStatus;
  origin: Origin;
  shop_category_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ImageRow = {
  id: string;
  sku_id: string;
  angle: Angle;
  storage_key: string;
  content_type: string;
  created_at: string;
};

export type JobRow = {
  id: string;
  sku_id: string;
  sku_name: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  origin: Origin;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  stage_key: string | null;
  stage_at: string | null;
  logs_json: string | null;
  options_json: string | null;
};

export type AssetRow = {
  id: string;
  sku_id: string;
  job_id: string;
  storage_key: string;
  content_type: string;
  meta_json: string;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  user_id: string;
  nickname: string;
  height_cm: number;
  weight_kg: number;
  shoulder_cm: number;
  chest_cm: number;
  waist_cm: number;
  hip_cm: number;
  inseam_cm: number | null;
  arm_cm: number | null;
  avatar_key: string | null;
  photo_key: string | null;
  birthday: string | null;
  age: number | null;
  gender: Gender;
  phone: string;
  updated_at: string;
};

export type StorefrontRow = {
  id: string;
  shop_name: string;
  announcement: string;
  updated_at: string;
};

export type ShopCategoryRow = {
  id: string;
  name: string;
  slot: Slot;
  sort: number;
  created_at: string;
  updated_at: string;
};

export type FittingRow = {
  id: string;
  user_id: string;
  sku_id: string;
  sku_name: string;
  slot: Slot;
  shop_category_id: string | null;
  shop_category_name: string | null;
  price_cents: number;
  color: string;
  status: SkuStatus;
  created_at: string;
};

export type SessionRow = {
  id: string;
  user_id: string;
  user_name: string;
  profile_id: string;
  nickname: string;
  status: SessionStatus;
  origin: Origin;
  created_at: string;
  updated_at: string;
};

export type OutfitRow = {
  id: string;
  session_id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type OutfitItemRow = {
  id: string;
  outfit_id: string;
  sku_id: string;
  sku_name: string;
  color: string;
  slot: Slot;
  created_at: string;
};

export type Repo = ReturnType<typeof openRepo>;

export function openRepo(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 3000');
  db.exec(SCHEMA);
  ensureColumn(db, 'profiles', 'arm_cm', 'REAL');
  ensureColumn(db, 'profiles', 'avatar_key', 'TEXT');
  ensureColumn(db, 'profiles', 'photo_key', 'TEXT');
  ensureColumn(db, 'profiles', 'birthday', 'TEXT');
  ensureColumn(db, 'profiles', 'age', 'INTEGER');
  ensureColumn(db, 'profiles', 'gender', "TEXT NOT NULL DEFAULT 'unspecified'");
  ensureColumn(db, 'profiles', 'phone', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'skus', 'shop_category_id', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_skus_shop_category ON skus(shop_category_id)');
  ensureColumn(db, 'jobs', 'stage_key', 'TEXT');
  ensureColumn(db, 'jobs', 'stage_at', 'TEXT');
  ensureColumn(db, 'jobs', 'logs_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'jobs', 'options_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureDraftSkuStatus(db);

  const run = (sql: string, ...params: Bind[]) => db.prepare(sql).run(...params);
  const one = <T>(sql: string, ...params: Bind[]) => {
    const row = db.prepare(sql).get(...params) as object | undefined;
    return row ? ({ ...row } as T) : null;
  };
  const many = <T>(sql: string, ...params: Bind[]) =>
    (db.prepare(sql).all(...params) as object[]).map((row) => ({ ...row }) as T);
  const countOf = (sql: string, ...params: Bind[]) => {
    const row = db.prepare(sql).get(...params) as { n?: number | bigint } | undefined;
    return Number(row?.n ?? 0);
  };

  function transaction<T>(fn: () => T): T {
    db.exec('BEGIN');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const jobSelect = `SELECT j.id, j.sku_id, s.name AS sku_name, j.status, j.progress, j.error, j.origin,
      j.created_at, j.started_at, j.finished_at, j.stage_key, j.stage_at, j.logs_json, j.options_json
    FROM jobs j JOIN skus s ON s.id = j.sku_id`;

  function appendJobLog(id: string, entry: { at: string; stage: string; message: string }) {
    const row = one<{ logs_json: string | null }>('SELECT logs_json FROM jobs WHERE id = ?', id);
    const logs = parseJsonArray(row?.logs_json);
    logs.push(entry);
    run('UPDATE jobs SET logs_json = ? WHERE id = ?', JSON.stringify(logs), id);
  }

  return {
    close() {
      db.close();
    },
    transaction,
    upsertUser(user: { id: string; role: Role; name: string; token: string; createdAt: string }) {
      run(
        `INSERT INTO users (id, role, name, token, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET role = excluded.role, name = excluded.name, token = excluded.token`,
        user.id,
        user.role,
        user.name,
        user.token,
        user.createdAt,
      );
    },
    findUserByToken(token: string) {
      return one<UserRow>('SELECT * FROM users WHERE token = ?', token);
    },
    findUserByRole(role: Role) {
      return one<UserRow>('SELECT * FROM users WHERE role = ? ORDER BY created_at ASC LIMIT 1', role);
    },
    countSkus() {
      return countOf('SELECT COUNT(*) AS n FROM skus');
    },
    insertSku(row: SkuRow) {
      run(
        `INSERT INTO skus (id, merchant_id, name, category, price_cents, color, sizes, description, params_json, status, origin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.merchant_id,
        row.name,
        row.category,
        row.price_cents,
        row.color,
        row.sizes,
        row.description,
        row.params_json,
        row.status,
        row.origin,
        row.created_at,
        row.updated_at,
      );
    },
    updateSku(
      id: string,
      patch: {
        name?: string;
        priceCents?: number;
        color?: string;
        sizes?: string;
        description?: string;
        paramsJson?: string;
        status?: SkuStatus;
        shopCategoryId?: string | null;
        updatedAt: string;
      },
    ) {
      const sets: string[] = [];
      const values: Bind[] = [];
      const columns: [string, Bind | undefined][] = [
        ['name', patch.name],
        ['price_cents', patch.priceCents],
        ['color', patch.color],
        ['sizes', patch.sizes],
        ['description', patch.description],
        ['params_json', patch.paramsJson],
        ['status', patch.status],
        ['shop_category_id', patch.shopCategoryId],
      ];
      for (const [column, value] of columns) {
        if (value !== undefined) {
          sets.push(`${column} = ?`);
          values.push(value);
        }
      }
      sets.push('updated_at = ?');
      values.push(patch.updatedAt, id);
      run(`UPDATE skus SET ${sets.join(', ')} WHERE id = ?`, ...values);
    },
    deleteSku(id: string) {
      const result = run('DELETE FROM skus WHERE id = ?', id);
      return Number(result.changes) > 0;
    },
    getSku(id: string) {
      return one<SkuRow>('SELECT * FROM skus WHERE id = ?', id);
    },
    listSkus() {
      return many<SkuRow>('SELECT * FROM skus ORDER BY created_at DESC LIMIT 100');
    },
    insertImage(row: ImageRow) {
      run(
        `INSERT INTO sku_images (id, sku_id, angle, storage_key, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        row.id,
        row.sku_id,
        row.angle,
        row.storage_key,
        row.content_type,
        row.created_at,
      );
    },
    listImages(skuId: string) {
      return many<ImageRow>('SELECT * FROM sku_images WHERE sku_id = ? ORDER BY created_at ASC', skuId);
    },
    getImage(id: string) {
      return one<ImageRow>('SELECT * FROM sku_images WHERE id = ?', id);
    },
    insertJob(row: {
      id: string;
      sku_id: string;
      status: JobStatus;
      progress: number;
      error: string | null;
      origin: Origin;
      created_at: string;
      started_at: string | null;
      finished_at: string | null;
      options?: { simulateFailure?: boolean };
    }) {
      run(
        `INSERT INTO jobs (id, sku_id, status, progress, error, origin, created_at, started_at, finished_at, logs_json, options_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
        row.id,
        row.sku_id,
        row.status,
        row.progress,
        row.error,
        row.origin,
        row.created_at,
        row.started_at,
        row.finished_at,
        JSON.stringify(row.options ?? {}),
      );
    },
    getJob(id: string) {
      return one<JobRow>(`${jobSelect} WHERE j.id = ?`, id);
    },
    listJobs(skuId?: string) {
      if (skuId) return many<JobRow>(`${jobSelect} WHERE j.sku_id = ? ORDER BY j.created_at DESC`, skuId);
      return many<JobRow>(`${jobSelect} ORDER BY j.created_at DESC LIMIT 100`);
    },
    listJobsByStatus(status: JobStatus) {
      return many<JobRow>(`${jobSelect} WHERE j.status = ? ORDER BY j.created_at ASC`, status);
    },
    hasActiveJob(skuId: string) {
      return countOf(`SELECT COUNT(*) AS n FROM jobs WHERE sku_id = ? AND status IN ('queued', 'running')`, skuId) > 0;
    },
    promoteQueued(nowIso: string) {
      const queued = many<{ id: string }>(`SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC`);
      for (const job of queued) {
        run(
          `UPDATE jobs SET status = 'running', progress = 15, started_at = ?, stage_key = 'intake', stage_at = ? WHERE id = ?`,
          nowIso,
          nowIso,
          job.id,
        );
        appendJobLog(job.id, { at: nowIso, stage: 'intake', message: STAGE_LOG.intake });
      }
      return queued.length;
    },
    appendJobLog,
    updateJobStage(id: string, patch: { stageKey: string; stageAt: string; progress: number }) {
      run(
        `UPDATE jobs SET stage_key = ?, stage_at = ?, progress = ?, status = 'running' WHERE id = ?`,
        patch.stageKey,
        patch.stageAt,
        patch.progress,
        id,
      );
    },
    finishJob(input: { jobId: string; assetId: string; storageKey: string; metaJson: string; finishedAt: string }) {
      const job = one<JobRow>(`${jobSelect} WHERE j.id = ?`, input.jobId);
      if (!job) throw new Error('任务不存在');
      transaction(() => {
        run(
          `INSERT INTO assets (id, sku_id, job_id, storage_key, content_type, meta_json, created_at)
           VALUES (?, ?, ?, ?, 'model/gltf-binary', ?, ?)`,
          input.assetId,
          job.sku_id,
          input.jobId,
          input.storageKey,
          input.metaJson,
          input.finishedAt,
        );
        run(
          `UPDATE jobs SET status = 'ready', progress = 100, error = NULL, finished_at = ?, stage_key = 'publish', stage_at = ? WHERE id = ?`,
          input.finishedAt,
          input.finishedAt,
          input.jobId,
        );
        run(`UPDATE skus SET status = 'ready', updated_at = ? WHERE id = ?`, input.finishedAt, job.sku_id);
      });
    },
    failJob(id: string, error: string, finishedAt: string) {
      const job = one<{ sku_id: string }>('SELECT sku_id FROM jobs WHERE id = ?', id);
      const asset = job ? one<{ id: string }>('SELECT id FROM assets WHERE sku_id = ? LIMIT 1', job.sku_id) : null;
      transaction(() => {
        run(
          `UPDATE jobs SET status = 'failed', progress = 100, error = ?, finished_at = ? WHERE id = ?`,
          error,
          finishedAt,
          id,
        );
        if (job) {
          run(
            `UPDATE skus SET status = ?, updated_at = ? WHERE id = ?`,
            asset ? 'ready' : 'failed',
            finishedAt,
            job.sku_id,
          );
        }
      });
    },
    deleteImage(id: string) {
      const result = run('DELETE FROM sku_images WHERE id = ?', id);
      return Number(result.changes) > 0;
    },
    jobStatusCounts() {
      return many<{ origin: Origin; status: JobStatus; n: number | bigint }>(
        'SELECT origin, status, COUNT(*) AS n FROM jobs GROUP BY origin, status',
      ).map((row) => ({ ...row, n: Number(row.n) }));
    },
    getAsset(id: string) {
      return one<AssetRow>('SELECT * FROM assets WHERE id = ?', id);
    },
    latestAsset(skuId: string) {
      return one<AssetRow>('SELECT * FROM assets WHERE sku_id = ? ORDER BY created_at DESC LIMIT 1', skuId);
    },
    listAssets() {
      return many<AssetRow>('SELECT * FROM assets');
    },
    getProfile(id: string) {
      return one<ProfileRow>('SELECT * FROM profiles WHERE id = ?', id);
    },
    listProfiles(userId?: string) {
      if (userId) return many<ProfileRow>('SELECT * FROM profiles WHERE user_id = ? ORDER BY updated_at DESC', userId);
      return many<ProfileRow>('SELECT * FROM profiles ORDER BY updated_at DESC LIMIT 100');
    },
    insertProfile(row: ProfileRow) {
      run(
        `INSERT INTO profiles (
           id, user_id, nickname, height_cm, weight_kg, shoulder_cm, chest_cm, waist_cm, hip_cm, inseam_cm, arm_cm,
           avatar_key, photo_key, birthday, age, gender, phone, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.user_id,
        row.nickname,
        row.height_cm,
        row.weight_kg,
        row.shoulder_cm,
        row.chest_cm,
        row.waist_cm,
        row.hip_cm,
        row.inseam_cm,
        row.arm_cm,
        row.avatar_key,
        row.photo_key,
        row.birthday,
        row.age,
        row.gender,
        row.phone,
        row.updated_at,
      );
    },
    updateProfile(row: ProfileRow) {
      run(
        `UPDATE profiles SET nickname = ?, height_cm = ?, weight_kg = ?, shoulder_cm = ?, chest_cm = ?, waist_cm = ?, hip_cm = ?,
           inseam_cm = ?, arm_cm = ?, avatar_key = ?, photo_key = ?, birthday = ?, age = ?, gender = ?, phone = ?, updated_at = ?
         WHERE id = ?`,
        row.nickname,
        row.height_cm,
        row.weight_kg,
        row.shoulder_cm,
        row.chest_cm,
        row.waist_cm,
        row.hip_cm,
        row.inseam_cm,
        row.arm_cm,
        row.avatar_key,
        row.photo_key,
        row.birthday,
        row.age,
        row.gender,
        row.phone,
        row.updated_at,
        row.id,
      );
    },
    backfillArmLength() {
      db.exec('UPDATE profiles SET arm_cm = ROUND(height_cm * 0.33) WHERE arm_cm IS NULL');
    },
    countProfiles() {
      return countOf('SELECT COUNT(*) AS n FROM profiles');
    },
    getStorefront() {
      return one<StorefrontRow>('SELECT * FROM storefront WHERE id = ?', 'store_main');
    },
    insertStorefront(row: StorefrontRow) {
      run(
        'INSERT INTO storefront (id, shop_name, announcement, updated_at) VALUES (?, ?, ?, ?)',
        row.id,
        row.shop_name,
        row.announcement,
        row.updated_at,
      );
    },
    updateStorefront(row: StorefrontRow) {
      run(
        'UPDATE storefront SET shop_name = ?, announcement = ?, updated_at = ? WHERE id = ?',
        row.shop_name,
        row.announcement,
        row.updated_at,
        row.id,
      );
    },
    listShopCategories() {
      return many<ShopCategoryRow>('SELECT * FROM shop_categories ORDER BY sort ASC, created_at ASC');
    },
    getShopCategory(id: string) {
      return one<ShopCategoryRow>('SELECT * FROM shop_categories WHERE id = ?', id);
    },
    insertShopCategory(row: ShopCategoryRow) {
      run(
        'INSERT INTO shop_categories (id, name, slot, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        row.id,
        row.name,
        row.slot,
        row.sort,
        row.created_at,
        row.updated_at,
      );
    },
    updateShopCategory(row: ShopCategoryRow) {
      run(
        'UPDATE shop_categories SET name = ?, slot = ?, sort = ?, updated_at = ? WHERE id = ?',
        row.name,
        row.slot,
        row.sort,
        row.updated_at,
        row.id,
      );
    },
    deleteShopCategory(id: string) {
      transaction(() => {
        run('UPDATE skus SET shop_category_id = NULL WHERE shop_category_id = ?', id);
        run('DELETE FROM shop_categories WHERE id = ?', id);
      });
    },
    nextCategorySort() {
      return countOf('SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM shop_categories');
    },
    listFitting(userId: string) {
      return many<FittingRow>(
        `SELECT f.id, f.user_id, f.sku_id, f.created_at, s.name AS sku_name, s.category AS slot,
           s.shop_category_id, c.name AS shop_category_name, s.price_cents, s.color, s.status
         FROM fitting_items f
         JOIN skus s ON s.id = f.sku_id
         LEFT JOIN shop_categories c ON c.id = s.shop_category_id
         WHERE f.user_id = ?
         ORDER BY f.created_at ASC`,
        userId,
      );
    },
    findFittingBySku(userId: string, skuId: string) {
      return one<FittingRow>(
        `SELECT f.id, f.user_id, f.sku_id, f.created_at, s.name AS sku_name, s.category AS slot,
           s.shop_category_id, c.name AS shop_category_name, s.price_cents, s.color, s.status
         FROM fitting_items f
         JOIN skus s ON s.id = f.sku_id
         LEFT JOIN shop_categories c ON c.id = s.shop_category_id
         WHERE f.user_id = ? AND f.sku_id = ?`,
        userId,
        skuId,
      );
    },
    getFitting(id: string) {
      return one<FittingRow>(
        `SELECT f.id, f.user_id, f.sku_id, f.created_at, s.name AS sku_name, s.category AS slot,
           s.shop_category_id, c.name AS shop_category_name, s.price_cents, s.color, s.status
         FROM fitting_items f
         JOIN skus s ON s.id = f.sku_id
         LEFT JOIN shop_categories c ON c.id = s.shop_category_id
         WHERE f.id = ?`,
        id,
      );
    },
    countFitting(userId: string) {
      return countOf('SELECT COUNT(*) AS n FROM fitting_items WHERE user_id = ?', userId);
    },
    insertFitting(row: { id: string; userId: string; skuId: string; createdAt: string }) {
      run(
        'INSERT INTO fitting_items (id, user_id, sku_id, created_at) VALUES (?, ?, ?, ?)',
        row.id,
        row.userId,
        row.skuId,
        row.createdAt,
      );
    },
    deleteFitting(id: string, userId: string) {
      const result = run('DELETE FROM fitting_items WHERE id = ? AND user_id = ?', id, userId);
      return Number(result.changes) > 0;
    },
    getSession(id: string) {
      return one<SessionRow>(
        `SELECT s.id, s.user_id, u.name AS user_name, s.profile_id, p.nickname, s.status, s.origin, s.created_at, s.updated_at
         FROM sessions s JOIN users u ON u.id = s.user_id JOIN profiles p ON p.id = s.profile_id WHERE s.id = ?`,
        id,
      );
    },
    listSessions() {
      return many<SessionRow>(
        `SELECT s.id, s.user_id, u.name AS user_name, s.profile_id, p.nickname, s.status, s.origin, s.created_at, s.updated_at
         FROM sessions s JOIN users u ON u.id = s.user_id JOIN profiles p ON p.id = s.profile_id
         ORDER BY s.created_at DESC LIMIT 100`,
      );
    },
    insertSession(row: {
      id: string;
      user_id: string;
      profile_id: string;
      status: SessionStatus;
      origin: Origin;
      created_at: string;
      updated_at: string;
    }) {
      run(
        `INSERT INTO sessions (id, user_id, profile_id, status, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.user_id,
        row.profile_id,
        row.status,
        row.origin,
        row.created_at,
        row.updated_at,
      );
    },
    updateSession(id: string, status: SessionStatus, updatedAt: string) {
      run('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?', status, updatedAt, id);
    },
    touchSession(id: string, updatedAt: string) {
      run('UPDATE sessions SET updated_at = ? WHERE id = ?', updatedAt, id);
    },
    countSessions(origin?: Origin) {
      if (origin) return countOf('SELECT COUNT(*) AS n FROM sessions WHERE origin = ?', origin);
      return countOf('SELECT COUNT(*) AS n FROM sessions');
    },
    getOutfit(id: string) {
      return one<OutfitRow>('SELECT * FROM outfits WHERE id = ?', id);
    },
    listOutfits(userId?: string) {
      if (userId) return many<OutfitRow>('SELECT * FROM outfits WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', userId);
      return many<OutfitRow>('SELECT * FROM outfits ORDER BY created_at DESC LIMIT 100');
    },
    listOutfitItems(outfitId: string) {
      return many<OutfitItemRow>(
        `SELECT i.id, i.outfit_id, i.sku_id, s.name AS sku_name, s.color, i.slot, i.created_at
         FROM outfit_items i JOIN skus s ON s.id = i.sku_id WHERE i.outfit_id = ? ORDER BY i.created_at ASC`,
        outfitId,
      );
    },
    latestOutfitName(sessionId: string) {
      const row = one<{ name: string }>(
        'SELECT name FROM outfits WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
        sessionId,
      );
      return row?.name ?? null;
    },
    insertOutfit(outfit: OutfitRow, items: { id: string; skuId: string; slot: Slot; createdAt: string }[]) {
      transaction(() => {
        run(
          'INSERT INTO outfits (id, session_id, user_id, name, created_at) VALUES (?, ?, ?, ?, ?)',
          outfit.id,
          outfit.session_id,
          outfit.user_id,
          outfit.name,
          outfit.created_at,
        );
        for (const item of items) {
          run(
            'INSERT INTO outfit_items (id, outfit_id, sku_id, slot, created_at) VALUES (?, ?, ?, ?, ?)',
            item.id,
            outfit.id,
            item.skuId,
            item.slot,
            item.createdAt,
          );
        }
      });
    },
    updateOutfit(
      id: string,
      patch: { name?: string },
      items?: { id: string; skuId: string; slot: Slot; createdAt: string }[],
    ) {
      transaction(() => {
        if (patch.name) run('UPDATE outfits SET name = ? WHERE id = ?', patch.name, id);
        if (items) {
          run('DELETE FROM outfit_items WHERE outfit_id = ?', id);
          for (const item of items) {
            run(
              'INSERT INTO outfit_items (id, outfit_id, sku_id, slot, created_at) VALUES (?, ?, ?, ?, ?)',
              item.id,
              id,
              item.skuId,
              item.slot,
              item.createdAt,
            );
          }
        }
      });
    },
    deleteOutfit(id: string) {
      const result = run('DELETE FROM outfits WHERE id = ?', id);
      return Number(result.changes) > 0;
    },
    insertEvent(row: { id: string; userId: string | null; sessionId: string | null; skuId: string | null; type: EventType; createdAt: string }) {
      run(
        'INSERT INTO events (id, user_id, session_id, sku_id, type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        row.id,
        row.userId,
        row.sessionId,
        row.skuId,
        row.type,
        row.createdAt,
      );
    },
    countEvents() {
      const rows = many<{ type: EventType; n: number | bigint }>('SELECT type, COUNT(*) AS n FROM events GROUP BY type');
      const counts: Partial<Record<EventType, number>> = {};
      for (const row of rows) counts[row.type] = Number(row.n);
      return counts;
    },
    ensureBaseline(key: string, value: number) {
      run('INSERT INTO metric_baseline (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING', key, value);
    },
    baselines() {
      const rows = many<{ key: string; value: number | bigint }>('SELECT key, value FROM metric_baseline');
      const map: Record<string, number> = {};
      for (const row of rows) map[row.key] = Number(row.value);
      return map;
    },
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('merchant', 'consumer', 'ops')),
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skus (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('top', 'bottom')),
  price_cents INTEGER NOT NULL,
  color TEXT NOT NULL,
  sizes TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  params_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'processing', 'ready', 'failed')),
  origin TEXT NOT NULL CHECK (origin IN ('seed', 'live')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sku_images (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  angle TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'failed')),
  progress INTEGER NOT NULL,
  error TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('seed', 'live')),
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  stage_key TEXT,
  stage_at TEXT,
  logs_json TEXT NOT NULL DEFAULT '[]',
  options_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  meta_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  nickname TEXT NOT NULL,
  height_cm REAL NOT NULL,
  weight_kg REAL NOT NULL,
  shoulder_cm REAL NOT NULL,
  chest_cm REAL NOT NULL,
  waist_cm REAL NOT NULL,
  hip_cm REAL NOT NULL,
  inseam_cm REAL,
  arm_cm REAL,
  avatar_key TEXT,
  photo_key TEXT,
  birthday TEXT,
  age INTEGER,
  gender TEXT NOT NULL DEFAULT 'unspecified',
  phone TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS storefront (
  id TEXT PRIMARY KEY,
  shop_name TEXT NOT NULL,
  announcement TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shop_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('top', 'bottom')),
  sort INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fitting_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, sku_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  origin TEXT NOT NULL CHECK (origin IN ('seed', 'live')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outfits (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outfit_items (
  id TEXT PRIMARY KEY,
  outfit_id TEXT NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
  sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (slot IN ('top', 'bottom')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT,
  sku_id TEXT,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metric_baseline (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_sku ON jobs(sku_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_images_sku ON sku_images(sku_id);
CREATE INDEX IF NOT EXISTS idx_assets_sku ON assets(sku_id);
CREATE INDEX IF NOT EXISTS idx_fitting_user ON fitting_items(user_id);
`;

function ensureColumn(database: DatabaseSync, table: string, column: string, ddl: string) {
  const names = (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((item) => item.name);
  if (!names.includes(column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

function ensureDraftSkuStatus(database: DatabaseSync) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'skus'").get() as
    | { sql?: string }
    | undefined;
  if (!row?.sql || row.sql.includes("'draft'")) return;
  database.exec('PRAGMA foreign_keys = OFF');
  database.exec('BEGIN');
  try {
    database.exec(`CREATE TABLE skus_new (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('top', 'bottom')),
      price_cents INTEGER NOT NULL,
      color TEXT NOT NULL,
      sizes TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      params_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'processing', 'ready', 'failed')),
      origin TEXT NOT NULL CHECK (origin IN ('seed', 'live')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    database.exec(`INSERT INTO skus_new (id, merchant_id, name, category, price_cents, color, sizes, description, params_json, status, origin, created_at, updated_at)
      SELECT id, merchant_id, name, category, price_cents, color, sizes, description, params_json, status, origin, created_at, updated_at FROM skus`);
    database.exec('DROP TABLE skus');
    database.exec('ALTER TABLE skus_new RENAME TO skus');
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  database.exec('PRAGMA foreign_keys = ON');
}

function parseJsonArray(raw: string | null | undefined): { at: string; stage: string; message: string }[] {
  try {
    const value = JSON.parse(raw || '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is { at: string; stage: string; message: string } => {
      return Boolean(item && typeof item === 'object' && 'message' in item);
    });
  } catch {
    return [];
  }
}
