import { REBUILD_STAGES, type GarmentParams, type RebuildStageKey } from '@lingjing/shared';
import type { JobRow, Repo } from './db.ts';
import { nid, nowIso } from './ids.ts';
import {
  PUBLISHED_LOG,
  SIMULATED_FAILURE,
  STAGE_LOG,
  createReconstructionAdapter,
  type ReconstructionAdapter,
} from './reconstruct.ts';
import type { ObjectStorage } from './storage.ts';

export type Worker = {
  tick(now?: number): Promise<void>;
  start(): () => Promise<void>;
};

export function createWorker(options: {
  repo: Repo;
  storage: ObjectStorage;
  stageMs: number;
  adapter?: ReconstructionAdapter;
  log?: (message: string) => void;
}): Worker {
  const adapter = options.adapter ?? createReconstructionAdapter();
  let busy = false;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  async function tick(now = Date.now()) {
    if (busy || stopped) return;
    busy = true;
    try {
      options.repo.promoteQueued(new Date(now).toISOString());
      const running = options.repo.listJobsByStatus('running');
      for (const job of running) {
        try {
          await advanceJob(options.repo, options.storage, adapter, job, now, options.stageMs, options.log);
        } catch (error) {
          const message = error instanceof Error ? error.message : '重建失败';
          options.repo.appendJobLog(job.id, { at: new Date(now).toISOString(), stage: job.stage_key ?? 'mesh', message });
          options.repo.failJob(job.id, message, new Date(now).toISOString());
          options.log?.(`重建失败 ${job.sku_name}：${message}`);
        }
      }
    } finally {
      busy = false;
    }
  }

  return {
    tick,
    start() {
      timer = setInterval(() => {
        void tick();
      }, 400);
      return async () => {
        stopped = true;
        if (timer) clearInterval(timer);
        while (busy) await new Promise((resolve) => setTimeout(resolve, 20));
      };
    },
  };
}

async function advanceJob(
  repo: Repo,
  storage: ObjectStorage,
  adapter: ReconstructionAdapter,
  initial: JobRow,
  now: number,
  stageMs: number,
  log?: (message: string) => void,
) {
  let job = initial;
  for (;;) {
    if (job.status !== 'running') return;
    const stageAt = Date.parse(job.stage_at ?? '');
    if (Number.isFinite(stageAt) && now - stageAt < stageMs) return;
    const index = REBUILD_STAGES.findIndex((stage) => stage.key === job.stage_key);
    const stage = REBUILD_STAGES[index] ?? REBUILD_STAGES[0]!;
    if (stage.key === 'mesh' && readSimulateFailure(job.options_json)) {
      repo.appendJobLog(job.id, { at: new Date(now).toISOString(), stage: 'mesh', message: SIMULATED_FAILURE });
      repo.failJob(job.id, SIMULATED_FAILURE, new Date(now).toISOString());
      log?.(`重建失败 ${job.sku_name}：演示失败`);
      return;
    }
    const next = REBUILD_STAGES[index + 1];
    if (!next || next.key === 'publish') {
      enterStage(repo, job.id, 'publish', now);
      await publishReconstruction(repo, storage, adapter, job.id);
      log?.(`样衣已就绪：${job.sku_name}`);
      return;
    }
    enterStage(repo, job.id, next.key, now);
    log?.(`${job.sku_name} · ${next.label}`);
    const reloaded = repo.getJob(job.id);
    if (!reloaded) return;
    job = reloaded;
    if (stageMs > 0) return;
  }
}

function enterStage(repo: Repo, jobId: string, key: RebuildStageKey, now: number) {
  const stage = REBUILD_STAGES.find((item) => item.key === key);
  const at = new Date(now).toISOString();
  repo.updateJobStage(jobId, {
    stageKey: key,
    stageAt: at,
    progress: stage?.key === 'publish' ? 92 : (stage ? progressFor(key) : 10),
  });
  repo.appendJobLog(jobId, { at, stage: key, message: STAGE_LOG[key] });
}

function progressFor(key: RebuildStageKey) {
  const table: Record<RebuildStageKey, number> = {
    intake: 15,
    angles: 32,
    segment: 55,
    mesh: 78,
    publish: 92,
  };
  return table[key];
}

function readSimulateFailure(optionsJson: string | null) {
  try {
    const value = JSON.parse(optionsJson || '{}') as { simulateFailure?: boolean };
    return value.simulateFailure === true;
  } catch {
    return false;
  }
}

export async function publishReconstruction(
  repo: Repo,
  storage: ObjectStorage,
  adapter: ReconstructionAdapter,
  jobId: string,
) {
  const job = repo.getJob(jobId);
  if (!job) throw new Error('任务不存在');
  if (job.status === 'ready') return repo.latestAsset(job.sku_id);
  const sku = repo.getSku(job.sku_id);
  if (!sku) throw new Error('商品不存在');
  const images = [];
  for (const image of repo.listImages(sku.id)) {
    const file = await storage.get(image.storage_key);
    if (!file) throw new Error(`缺少照片文件（${image.angle}）`);
    images.push({ angle: image.angle, bytes: file.body, contentType: file.contentType });
  }
  const result = await adapter.reconstruct({
    skuId: sku.id,
    category: sku.category,
    color: sku.color,
    params: JSON.parse(sku.params_json) as GarmentParams,
    images,
  });
  const assetId = nid('ast');
  const storageKey = `garments/${assetId}.glb`;
  await storage.put(storageKey, result.glb, 'model/gltf-binary');
  repo.appendJobLog(jobId, { at: nowIso(), stage: 'publish', message: PUBLISHED_LOG });
  repo.finishJob({
    jobId,
    assetId,
    storageKey,
    metaJson: JSON.stringify(result.meta),
    finishedAt: nowIso(),
  });
  return repo.getAsset(assetId);
}

/** 种子数据不走等待，直接把五个阶段记进时间线并发布。 */
export async function completeJobNow(repo: Repo, storage: ObjectStorage, jobId: string) {
  const now = nowIso();
  for (const stage of REBUILD_STAGES) {
    repo.appendJobLog(jobId, { at: now, stage: stage.key, message: STAGE_LOG[stage.key] });
  }
  repo.updateJobStage(jobId, { stageKey: 'publish', stageAt: now, progress: 92 });
  await publishReconstruction(repo, storage, createReconstructionAdapter(), jobId);
}
