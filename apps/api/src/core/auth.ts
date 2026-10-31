import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PermissionKey } from '@andy/shared';
import { db } from './db.js';
import { AppError } from './errors.js';
import { verifyAccessToken } from './tokens.js';

export interface RequestUser {
  id: bigint;
  email: string;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
  roles: string[];
  permissions: Set<string>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

/** Loads the user with roles and permissions. Permissions are read fresh per request so changes apply at once. */
export async function loadRequestUser(userId: bigint): Promise<RequestUser | null> {
  const user = await db().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      status: true,
      roles: { select: { role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } } } },
    },
  });
  if (!user) return null;
  const permissions = new Set<string>();
  for (const ur of user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.key);
  return { id: user.id, email: user.email, status: user.status, roles: user.roles.map((r) => r.role.key), permissions };
}

/** Requires a valid Bearer access token for an existing, non-suspended user. */
export const requireAuth: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const claims = token ? await verifyAccessToken(token) : null;
  if (!claims) return next(new AppError('UNAUTHENTICATED', 401, 'Please sign in'));
  const user = await loadRequestUser(BigInt(claims.sub));
  if (!user) return next(new AppError('UNAUTHENTICATED', 401, 'Please sign in'));
  if (user.status === 'SUSPENDED') return next(new AppError('ACCOUNT_SUSPENDED', 403, 'This account is suspended'));
  req.user = user;
  next();
};

/** Requires every listed permission. Use after requireAuth. */
export function requirePermission(...keys: PermissionKey[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) return next(new AppError('UNAUTHENTICATED', 401, 'Please sign in'));
    const missing = keys.filter((k) => !user.permissions.has(k));
    if (missing.length) return next(new AppError('FORBIDDEN', 403, 'You do not have permission to do this'));
    next();
  };
}

/** The signed-in user. Only call in handlers behind requireAuth. */
export function currentUser(req: Request): RequestUser {
  if (!req.user) throw new AppError('UNAUTHENTICATED', 401, 'Please sign in');
  return req.user;
}
