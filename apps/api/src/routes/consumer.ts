import {
  ageFromBirthday,
  eventInputSchema,
  fittingAddSchema,
  outfitCreateSchema,
  outfitPatchSchema,
  profileInputSchema,
  profilePatchSchema,
  sessionCreateSchema,
  sessionPatchSchema,
  type ProfileInput,
  type Slot,
} from '@lingjing/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ProfileRow, Repo } from '../db.ts';
import { currentUser, HttpError, parseBody, requireUser, sendStored } from '../http.ts';
import { nid, nowIso } from '../ids.ts';
import { presentFitting, presentOutfit, presentProfile, presentSession } from '../present.ts';
import type { ObjectStorage } from '../storage.ts';

export function registerConsumerRoutes(app: FastifyInstance, repo: Repo, storage: ObjectStorage) {
  const reader = requireUser(repo, ['consumer', 'ops']);
  const consumer = requireUser(repo, ['consumer']);

  app.get('/api/profiles', { preHandler: reader }, async (request) => {
    const user = currentUser(request);
    const rows = user.role === 'ops' ? repo.listProfiles() : repo.listProfiles(user.id);
    return rows.map(presentProfile);
  });

  app.get('/api/profiles/:id', { preHandler: reader }, async (request) => {
    const user = currentUser(request);
    return presentProfile(mustOwnProfile(repo, (request.params as { id: string }).id, user));
  });

  app.post('/api/profiles', { preHandler: consumer }, async (request, reply) => {
    const user = currentUser(request);
    const parsed = parseBody(profileInputSchema, request.body);
    const identity = identityFrom(parsed, null);
    const row: ProfileRow = {
      id: nid('prf'),
      user_id: user.id,
      nickname: parsed.nickname,
      height_cm: parsed.heightCm,
      weight_kg: parsed.weightKg,
      shoulder_cm: parsed.shoulderCm,
      chest_cm: parsed.chestCm,
      waist_cm: parsed.waistCm,
      hip_cm: parsed.hipCm,
      inseam_cm: parsed.inseamCm ?? null,
      arm_cm: parsed.armLengthCm ?? null,
      avatar_key: null,
      photo_key: null,
      birthday: identity.birthday,
      age: identity.age,
      gender: identity.gender,
      phone: identity.phone,
      updated_at: nowIso(),
    };
    repo.insertProfile(row);
    return reply.code(201).send(presentProfile(row));
  });

  app.patch('/api/profiles/:id', { preHandler: consumer }, async (request) => {
    const user = currentUser(request);
    const existing = mustOwnProfile(repo, (request.params as { id: string }).id, user);
    const parsed = parseBody(profilePatchSchema, request.body);
    const identity = identityFrom(parsed, existing);
    const row: ProfileRow = {
      ...existing,
      nickname: parsed.nickname ?? existing.nickname,
      height_cm: parsed.heightCm ?? existing.height_cm,
      weight_kg: parsed.weightKg ?? existing.weight_kg,
      shoulder_cm: parsed.shoulderCm ?? existing.shoulder_cm,
      chest_cm: parsed.chestCm ?? existing.chest_cm,
      waist_cm: parsed.waistCm ?? existing.waist_cm,
      hip_cm: parsed.hipCm ?? existing.hip_cm,
      inseam_cm: parsed.inseamCm === undefined ? existing.inseam_cm : parsed.inseamCm,
      arm_cm: parsed.armLengthCm === undefined ? existing.arm_cm : parsed.armLengthCm,
      birthday: identity.birthday,
      age: identity.age,
      gender: identity.gender,
      phone: identity.phone,
      updated_at: nowIso(),
    };
    repo.updateProfile(row);
    return presentProfile(row);
  });

  app.post('/api/profiles/:id/avatar', { preHandler: consumer }, async (request) => {
    return savePortrait(request, repo, storage, 'avatar');
  });

  app.post('/api/profiles/:id/photo', { preHandler: consumer }, async (request) => {
    return savePortrait(request, repo, storage, 'photo');
  });

  app.get('/api/profiles/:id/avatar/file', async (request, reply) => {
    return sendPortrait(request, reply, repo, storage, 'avatar');
  });

  app.get('/api/profiles/:id/photo/file', async (request, reply) => {
    return sendPortrait(request, reply, repo, storage, 'photo');
  });

  app.get('/api/fitting-room', { preHandler: consumer }, async (request) => {
    const user = currentUser(request);
    return repo.listFitting(user.id).map((row) => fittingView(repo, row));
  });

  app.post('/api/fitting-room', { preHandler: consumer }, async (request, reply) => {
    const user = currentUser(request);
    const parsed = parseBody(fittingAddSchema, request.body);
    const sku = repo.getSku(parsed.skuId);
    if (!sku) throw new HttpError(400, '没有找到商品');
    if (sku.status !== 'ready') throw new HttpError(400, '样衣还没准备好，不能加入试衣间');
    const existing = repo.findFittingBySku(user.id, sku.id);
    if (existing) return fittingView(repo, existing);
    const id = nid('fit');
    repo.insertFitting({ id, userId: user.id, skuId: sku.id, createdAt: nowIso() });
    const row = repo.getFitting(id);
    if (!row) throw new HttpError(500, '试衣间清单没有保存');
    return reply.code(201).send(fittingView(repo, row));
  });

  app.delete('/api/fitting-room/:id', { preHandler: consumer }, async (request, reply) => {
    const user = currentUser(request);
    const removed = repo.deleteFitting((request.params as { id: string }).id, user.id);
    if (!removed) throw new HttpError(404, '试衣间里没有这件衣服');
    return reply.code(204).send();
  });

  app.get('/api/sessions', { preHandler: reader }, async (request) => {
    const user = currentUser(request);
    return repo
      .listSessions()
      .filter((session) => user.role === 'ops' || session.user_id === user.id)
      .map((session) => presentSession(session, repo.latestOutfitName(session.id)));
  });

  app.get('/api/sessions/:id', { preHandler: reader }, async (request) => {
    const user = currentUser(request);
    const session = mustOwnSession(repo, (request.params as { id: string }).id, user);
    return presentSession(session, repo.latestOutfitName(session.id));
  });

  app.post('/api/sessions', { preHandler: consumer }, async (request, reply) => {
    const user = currentUser(request);
    const parsed = parseBody(sessionCreateSchema, request.body);
    mustOwnProfile(repo, parsed.profileId, user);
    const timestamp = nowIso();
    const id = nid('ses');
    repo.insertSession({
      id,
      user_id: user.id,
      profile_id: parsed.profileId,
      status: 'open',
      origin: 'live',
      created_at: timestamp,
      updated_at: timestamp,
    });
    const session = repo.getSession(id);
    if (!session) throw new HttpError(500, '会话没有保存');
    return reply.code(201).send(presentSession(session, null));
  });

  app.patch('/api/sessions/:id', { preHandler: consumer }, async (request) => {
    const user = currentUser(request);
    const session = mustOwnSession(repo, (request.params as { id: string }).id, user);
    const parsed = parseBody(sessionPatchSchema, request.body);
    const updatedAt = nowIso();
    repo.updateSession(session.id, parsed.status, updatedAt);
    const next = repo.getSession(session.id);
    if (!next) throw new HttpError(404, '没有找到试穿会话');
    return presentSession(next, repo.latestOutfitName(next.id));
  });

  app.get('/api/outfits', { preHandler: reader }, async (request) => {
    const user = currentUser(request);
    const rows = user.role === 'ops' ? repo.listOutfits() : repo.listOutfits(user.id);
    return rows.map((outfit) => outfitView(repo, outfit));
  });

  app.get('/api/outfits/:id', { preHandler: reader }, async (request) => {
    const user = currentUser(request);
    const outfit = mustOwnOutfit(repo, (request.params as { id: string }).id, user);
    return outfitView(repo, outfit);
  });

  app.post('/api/outfits', { preHandler: consumer }, async (request, reply) => {
    const user = currentUser(request);
    const parsed = parseBody(outfitCreateSchema, request.body);
    const session = mustOwnSession(repo, parsed.sessionId, user);
    assertItems(repo, parsed.items);
    const timestamp = nowIso();
    const id = nid('out');
    const name = parsed.name ?? defaultOutfitName(repo, parsed.items);
    repo.insertOutfit(
      { id, session_id: session.id, user_id: user.id, name, created_at: timestamp },
      parsed.items.map((item) => ({ id: nid('oit'), skuId: item.skuId, slot: item.slot, createdAt: timestamp })),
    );
    repo.touchSession(session.id, timestamp);
    const outfit = repo.getOutfit(id);
    if (!outfit) throw new HttpError(500, '搭配没有保存');
    return reply.code(201).send(outfitView(repo, outfit));
  });

  app.patch('/api/outfits/:id', { preHandler: consumer }, async (request) => {
    const user = currentUser(request);
    const outfit = mustOwnOutfit(repo, (request.params as { id: string }).id, user);
    const parsed = parseBody(outfitPatchSchema, request.body);
    if (parsed.items) assertItems(repo, parsed.items);
    const timestamp = nowIso();
    repo.updateOutfit(
      outfit.id,
      { name: parsed.name },
      parsed.items?.map((item) => ({ id: nid('oit'), skuId: item.skuId, slot: item.slot, createdAt: timestamp })),
    );
    repo.touchSession(outfit.session_id, timestamp);
    const next = repo.getOutfit(outfit.id);
    if (!next) throw new HttpError(404, '没有找到搭配');
    return outfitView(repo, next);
  });

  app.delete('/api/outfits/:id', { preHandler: consumer }, async (request, reply) => {
    const user = currentUser(request);
    const outfit = mustOwnOutfit(repo, (request.params as { id: string }).id, user);
    repo.deleteOutfit(outfit.id);
    return reply.code(204).send();
  });

  app.post('/api/events', { preHandler: consumer }, async (request, reply) => {
    const user = currentUser(request);
    const parsed = parseBody(eventInputSchema, request.body);
    if (parsed.sessionId) mustOwnSession(repo, parsed.sessionId, user);
    if (parsed.skuId && !repo.getSku(parsed.skuId)) throw new HttpError(400, '没有找到商品');
    const id = nid('evt');
    repo.insertEvent({
      id,
      userId: user.id,
      sessionId: parsed.sessionId ?? null,
      skuId: parsed.skuId ?? null,
      type: parsed.type,
      createdAt: nowIso(),
    });
    return reply.code(201).send({ id, type: parsed.type });
  });
}

function identityFrom(parsed: Partial<ProfileInput>, existing: ProfileRow | null) {
  const birthday = parsed.birthday === undefined ? (existing?.birthday ?? null) : parsed.birthday || null;
  let age = parsed.age === undefined ? (existing?.age ?? null) : parsed.age;
  if (parsed.age === undefined && parsed.birthday !== undefined) age = birthday ? ageFromBirthday(birthday) : null;
  const gender = parsed.gender ?? (existing?.gender === 'female' || existing?.gender === 'male' ? existing.gender : 'unspecified');
  const phone = parsed.phone === undefined ? (existing?.phone ?? '') : parsed.phone;
  return { birthday, age, gender, phone };
}

function fittingView(repo: Repo, row: NonNullable<ReturnType<Repo['getFitting']>>) {
  const images = repo.listImages(row.sku_id);
  const front = images.find((image) => image.angle === 'front') ?? images[0];
  const asset = repo.latestAsset(row.sku_id);
  return presentFitting(
    row,
    front ? `/api/images/${front.id}/file` : null,
    asset ? `/api/assets/${asset.id}/file` : null,
  );
}

async function savePortrait(
  request: FastifyRequest,
  repo: Repo,
  storage: ObjectStorage,
  kind: 'avatar' | 'photo',
) {
  const user = currentUser(request);
  const profile = mustOwnProfile(repo, (request.params as { id: string }).id, user);
  const file = await readPortrait(request);
  const key = `profiles/${profile.id}/${kind}`;
  await storage.put(key, file.bytes, file.contentType);
  const row: ProfileRow = {
    ...profile,
    avatar_key: kind === 'avatar' ? key : profile.avatar_key,
    photo_key: kind === 'photo' ? key : profile.photo_key,
    updated_at: nowIso(),
  };
  repo.updateProfile(row);
  return presentProfile(row);
}

async function sendPortrait(
  request: FastifyRequest,
  reply: FastifyReply,
  repo: Repo,
  storage: ObjectStorage,
  kind: 'avatar' | 'photo',
) {
  const profile = repo.getProfile((request.params as { id: string }).id);
  const key = kind === 'avatar' ? profile?.avatar_key : profile?.photo_key;
  if (!profile || !key) throw new HttpError(404, kind === 'avatar' ? '还没有头像' : '还没有照片');
  const file = await storage.get(key);
  if (!file) throw new HttpError(404, '照片文件不存在');
  return sendStored(reply, file, `${profile.id}-${kind}`);
}

async function readPortrait(request: FastifyRequest) {
  let file: { bytes: Buffer; contentType: string } | null = null;
  for await (const part of request.parts()) {
    if (part.type !== 'file') continue;
    const bytes = await part.toBuffer();
    const contentType = part.mimetype === 'image/jpg' ? 'image/jpeg' : part.mimetype;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      throw new HttpError(400, '请上传 JPG、PNG 或 WEBP');
    }
    if (bytes.byteLength === 0) throw new HttpError(400, '图片内容为空');
    file = { bytes, contentType };
  }
  if (!file) throw new HttpError(400, '请选择图片');
  return file;
}

function outfitView(repo: Repo, outfit: { id: string }) {
  const row = repo.getOutfit(outfit.id);
  if (!row) throw new HttpError(404, '没有找到搭配');
  return presentOutfit(row, repo.listOutfitItems(row.id), (skuId) => {
    const asset = repo.latestAsset(skuId);
    return asset ? `/api/assets/${asset.id}/file` : null;
  });
}

function mustOwnProfile(repo: Repo, id: string, user: { id: string; role: string }) {
  const profile = repo.getProfile(id);
  if (!profile || (user.role !== 'ops' && profile.user_id !== user.id)) throw new HttpError(404, '没有找到身材档案');
  return profile;
}

function mustOwnSession(repo: Repo, id: string, user: { id: string; role: string }) {
  const session = repo.getSession(id);
  if (!session || (user.role !== 'ops' && session.user_id !== user.id)) throw new HttpError(404, '没有找到试穿会话');
  return session;
}

function mustOwnOutfit(repo: Repo, id: string, user: { id: string; role: string }) {
  const outfit = repo.getOutfit(id);
  if (!outfit || (user.role !== 'ops' && outfit.user_id !== user.id)) throw new HttpError(404, '没有找到搭配');
  return outfit;
}

function assertItems(repo: Repo, items: { skuId: string; slot: Slot }[]) {
  const slots = new Set<Slot>();
  for (const item of items) {
    if (slots.has(item.slot)) throw new HttpError(400, '同一位置只能放一件');
    slots.add(item.slot);
    const sku = repo.getSku(item.skuId);
    if (!sku) throw new HttpError(400, '搭配里有不存在的商品');
    if (sku.category !== item.slot) throw new HttpError(400, '商品类目和穿戴位置不一致');
    if (sku.status !== 'ready') throw new HttpError(400, '样衣还没准备好');
  }
}

function defaultOutfitName(repo: Repo, items: { skuId: string; slot: Slot }[]) {
  return items
    .map((item) => repo.getSku(item.skuId)?.name ?? item.slot)
    .join(' + ');
}
