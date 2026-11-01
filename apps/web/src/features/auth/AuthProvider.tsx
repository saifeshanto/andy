import type { AuthUser, LoginInput, PermissionKey, RegisterInput } from '@andy/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onSession, refreshSession, setAccessToken, type SessionData } from '@/lib/api';

type Status = 'loading' | 'signed-in' | 'signed-out';

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  login(input: LoginInput): Promise<AuthUser>;
  register(input: RegisterInput): Promise<AuthUser>;
  logout(): Promise<void>;
  reload(): Promise<void>;
  can(...perms: PermissionKey[]): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const apply = useCallback((data: SessionData | null) => {
    setAccessToken(data?.accessToken ?? null);
    setUser(data?.user ?? null);
    setStatus(data ? 'signed-in' : 'signed-out');
  }, []);

  useEffect(() => {
    onSession(apply);
    // Restore the session from the refresh cookie on page load.
    void refreshSession();
  }, [apply]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async login(input) {
        const res = await api<{ data: SessionData }>('/auth/login', { method: 'POST', json: input });
        apply(res.data);
        return res.data.user;
      },
      async register(input) {
        const res = await api<{ data: SessionData }>('/auth/register', { method: 'POST', json: input });
        apply(res.data);
        return res.data.user;
      },
      async logout() {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        apply(null);
      },
      async reload() {
        const res = await api<{ data: AuthUser }>('/auth/me');
        setUser(res.data);
      },
      can: (...perms) => !!user && perms.every((p) => user.permissions.includes(p)),
    }),
    [status, user, apply],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
