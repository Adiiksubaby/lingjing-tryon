import { buildApp } from './app.ts';
import { loadConfig, loadEnvFiles } from './config.ts';

loadEnvFiles();
const config = loadConfig();
const { app } = await buildApp({ config, logger: true, startWorker: true });

await app.listen({ port: config.port, host: config.host });
app.log.info(`绫境 API 已启动 http://127.0.0.1:${config.port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
