import { demoAuthSchema } from '@lingjing/shared';
import type { FastifyInstance } from 'fastify';
import type { Repo } from '../db.ts';
import { HttpError, parseBody, requireUser } from '../http.ts';
import { collectMetrics } from '../metrics.ts';
import type { Config } from '../config.ts';

export function registerSystemRoutes(app: FastifyInstance, repo: Repo, config: Config) {
  app.get('/api/health', async () => ({
    ok: true,
    service: 'lingjing-api',
    storage: config.storageDriver,
    database: 'sqlite',
  }));

  app.get('/', async () => ({
    name: '绫境 API',
    health: '/api/health',
    hint: '商户、消费者和运营端的用法见 README。',
  }));

  app.post('/api/auth/demo', async (request) => {
    const body = parseBody(demoAuthSchema, request.body);
    const user = repo.findUserByRole(body.role);
    if (!user) throw new HttpError(500, '演示账号未初始化');
    return { token: user.token, role: user.role, name: user.name, id: user.id };
  });

  app.get('/api/metrics', { preHandler: requireUser(repo, ['ops']) }, async () => collectMetrics(repo));
}
