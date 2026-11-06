import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from './config.ts';

export type StoredObject = {
  body: Buffer;
  contentType: string;
};

export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

const SAFE_KEY = /^[a-zA-Z0-9/_\-.]+$/;

export function assertStorageKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes('..')) throw new Error(`非法存储路径：${key}`);
  return key;
}

export class LocalDiskStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private full(key: string) {
    const safe = assertStorageKey(key);
    const resolvedRoot = path.resolve(this.root);
    const resolved = path.resolve(resolvedRoot, safe);
    if (!resolved.startsWith(resolvedRoot + path.sep)) throw new Error('非法存储路径');
    return resolved;
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    const file = this.full(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    await fs.writeFile(`${file}.content-type`, contentType);
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const file = this.full(key);
      const body = await fs.readFile(file);
      let contentType = 'application/octet-stream';
      try {
        contentType = (await fs.readFile(`${file}.content-type`, 'utf8')).trim() || contentType;
      } catch {
        contentType = contentTypeFromKey(key);
      }
      return { body, contentType };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async exists(key: string) {
    try {
      await fs.access(this.full(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string) {
    await fs.rm(this.full(key), { force: true });
    await fs.rm(`${this.full(key)}.content-type`, { force: true });
  }
}

export class S3CompatibleStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: Config['s3']) {
    if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
      throw new Error('使用 S3 存储时需要设置 S3_BUCKET、S3_ACCESS_KEY_ID、S3_SECRET_ACCESS_KEY');
    }
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: assertStorageKey(key),
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const output = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: assertStorageKey(key) }),
      );
      const bytes = await output.Body?.transformToByteArray();
      if (!bytes) return null;
      return { body: Buffer.from(bytes), contentType: output.ContentType ?? contentTypeFromKey(key) };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: assertStorageKey(key) }));
      return true;
    } catch (error) {
      if (isMissingObject(error)) return false;
      throw error;
    }
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: assertStorageKey(key) }));
  }
}

export async function createStorage(config: Config): Promise<ObjectStorage> {
  if (config.storageDriver === 's3') return new S3CompatibleStorage(config.s3);
  const root = path.join(config.dataDir, 'storage');
  await fs.mkdir(root, { recursive: true });
  return new LocalDiskStorage(root);
}

function contentTypeFromKey(key: string) {
  if (key.endsWith('.glb')) return 'model/gltf-binary';
  if (key.endsWith('.svg')) return 'image/svg+xml';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function isNotFound(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isMissingObject(error: unknown) {
  if (typeof error !== 'object' || error === null) return false;
  const name = 'name' in error ? String(error.name) : '';
  const status =
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata &&
    'httpStatusCode' in error.$metadata
      ? error.$metadata.httpStatusCode
      : undefined;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}
