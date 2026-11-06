import type { DemoSessionDto } from '@lingjing/shared';

const TOKEN_KEY = 'lingjing-merchant-token';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new Error('无法连接商户服务，请确认 API 已在 4310 端口启动');
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as {
    error?: string;
    issues?: { message: string }[];
  } | null;
  if (!response.ok) {
    const detail = data?.issues?.map((issue) => issue.message).filter(Boolean).join('；');
    throw new Error(detail || data?.error || `请求失败（${response.status}）`);
  }
  return data as T;
}

export async function ensureSession() {
  const session = await api<DemoSessionDto>('/api/auth/demo', {
    method: 'POST',
    body: JSON.stringify({ role: 'merchant' }),
  });
  localStorage.setItem(TOKEN_KEY, session.token);
  return session;
}
