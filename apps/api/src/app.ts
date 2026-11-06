import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig, type Config } from './config.ts';
import { openRepo, type Repo } from './db.ts';
import { errorPayload } from './http.ts';
import path from 'node:path';
import { registerCatalogRoutes } from './routes/catalog.ts';
import { registerConsumerRoutes } from './routes/consumer.ts';
import { registerShopRoutes } from './routes/shop.ts';
import { registerSystemRoutes } from './routes/system.ts';
import { ensureSeed } from './seed.ts';
import { createStorage, type ObjectStorage } from './storage.ts';
import './types.ts';
import { createWorker, type Worker } from './worker.ts';

export type BuiltApp = {
  app: FastifyInstance;
  config: Config;
  repo: Repo;
  storage: ObjectStorage;
  worker: Worker;
};

export async function buildApp(options?: {
  config?: Config;
  logger?: boolean;
  startWorker?: boolean;
}): Promise<BuiltApp> {
  const config = options?.config ?? loadConfig();
  const repo = openRepo(path.join(config.dataDir, 'lingjing.sqlite'));
  const storage = await createStorage(config);
  await ensureSeed(repo, storage, config);
  const app = Fastify({ logger: options?.logger ?? false, bodyLimit: 1_048_576 });
  const worker = createWorker({
    repo,
    storage,
    stageMs: config.stageMs,
    log: (message) => app.log.info(message),
  });

  app.setErrorHandler((error, request, reply) => {
    const payload = errorPayload(error);
    if (payload.statusCode >= 500) request.log.error(error);
    return reply.code(payload.statusCode).send(payload.body);
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 6, fields: 24 },
  });
  registerSystemRoutes(app, repo, config);
  registerCatalogRoutes(app, repo, storage);
  registerShopRoutes(app, repo);
  registerConsumerRoutes(app, repo, storage);

  let stopWorker = async () => {};
  if (options?.startWorker !== false) stopWorker = worker.start();
  app.addHook('onClose', async () => {
    await stopWorker();
    repo.close();
  });

  return { app, config, repo, storage, worker };
}
