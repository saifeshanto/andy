/**
 * API client. The access token lives only in memory (never localStorage, AGENTS.md section 9).
 * On a 401 it refreshes once using the httpOnly cookie, then retries the request.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let onSessionChange: ((data: SessionData | null) => void) | null = null;
let refreshing: Promise<SessionData | null> | null = null;

export interface SessionData {
  accessToken: string;
  user: import('@andy/shared').AuthUser;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function onSession(cb: (data: SessionData | null) => void) {
  onSessionChange = cb;
}

const APP_HEADER = { 'x-requested-with': 'andy-web' };

async function parse(res: Response) {
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'HTTP_ERROR', err.message ?? 'Something went wrong', err.details);
  }
  return body;
}

/** Single-flight refresh: concurrent 401s share one refresh call. */
export function refreshSession(): Promise<SessionData | null> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: APP_HEADER })
    .then(async (res) => {
      if (!res.ok) return null;
      const body = await res.json();
      return body.data as SessionData;
    })
    .catch(() => null)
    .then((data) => {
      accessToken = data?.accessToken ?? null;
      onSessionChange?.(data);
      return data;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { ...APP_HEADER, ...(init.headers as Record<string, string>) };
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (res.status === 401 && retry && accessToken && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) return api<T>(path, init, false);
  }
  return parse(res) as Promise<T>;
}
