import { formatIssues, type Role } from '@lingjing/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import type { Repo } from './db.ts';

export class HttpError extends Error {
  readonly issues?: { path: string; message: string }[];

  constructor(readonly statusCode: number, message: string, issues?: { path: string; message: string }[]) {
    super(message);
    this.name = 'HttpError';
    this.issues = issues;
  }
}

export function parseBody<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, '参数不正确', formatIssues(result.error));
  return result.data;
}

export function requireUser(repo: Repo, roles?: Role[]) {
  return async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, '需要登录');
    const user = repo.findUserByToken(header.slice('Bearer '.length).trim());
    if (!user) throw new HttpError(401, '登录已失效');
    if (roles && !roles.includes(user.role)) throw new HttpError(403, '没有权限');
    request.user = { id: user.id, role: user.role, name: user.name };
  };
}

export function currentUser(request: FastifyRequest) {
  if (!request.user) throw new HttpError(401, '需要登录');
  return request.user;
}

export function sendStored(
  reply: FastifyReply,
  file: { body: Uint8Array; contentType: string },
  filename: string,
) {
  return reply
    .header('content-type', file.contentType)
    .header('cache-control', 'private, max-age=30')
    .header('content-disposition', `inline; filename="${filename}"`)
    .send(Buffer.from(file.body));
}

export function errorPayload(error: unknown) {
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, body: { error: error.message, issues: error.issues } };
  }
  const code = readString(error, 'code');
  const statusCode = readNumber(error, 'statusCode') ?? 500;
  if (code === 'FST_ERR_CTP_INVALID_JSON') return { statusCode: 400, body: { error: '请求体不是合法 JSON' } };
  if (statusCode === 413) return { statusCode: 413, body: { error: '图片过大，单张请小于 8MB' } };
  if (statusCode >= 400 && statusCode < 500) {
    return { statusCode, body: { error: error instanceof Error ? error.message : '请求无法处理' } };
  }
  return { statusCode: 500, body: { error: '服务器内部错误' } };
}

function readString(error: unknown, key: string) {
  if (typeof error === 'object' && error && key in error) {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  }
  return '';
}

function readNumber(error: unknown, key: string) {
  if (typeof error === 'object' && error && key in error) {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : undefined;
  }
  return undefined;
}
