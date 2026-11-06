import fs from 'node:fs';
import path from 'node:path';

export type Config = {
  port: number;
  host: string;
  dataDir: string;
  storageDriver: 'local' | 's3';
  jobDelayMs: number;
  stageMs: number;
  tokens: { merchant: string; consumer: string; ops: string };
  s3: {
    endpoint?: string;
    region: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle: boolean;
  };
};

function numberFrom(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadEnvFiles() {
  for (const file of [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: numberFrom(env.PORT, 4310),
    host: env.HOST || '0.0.0.0',
    dataDir: path.resolve(process.cwd(), env.DATA_DIR || '../../data'),
    storageDriver: env.STORAGE_DRIVER === 's3' ? 's3' : 'local',
    jobDelayMs: numberFrom(env.JOB_DELAY_MS, 2200),
    stageMs: env.JOB_STAGE_MS !== undefined ? numberFrom(env.JOB_STAGE_MS, 1400) : env.JOB_DELAY_MS === '0' ? 0 : 1400,
    tokens: {
      merchant: env.DEMO_MERCHANT_TOKEN || 'demo-merchant',
      consumer: env.DEMO_CONSUMER_TOKEN || 'demo-consumer',
      ops: env.DEMO_OPS_TOKEN || 'demo-ops',
    },
    s3: {
      endpoint: env.S3_ENDPOINT || undefined,
      region: env.S3_REGION || 'us-east-1',
      bucket: env.S3_BUCKET || undefined,
      accessKeyId: env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
    },
  };
}
