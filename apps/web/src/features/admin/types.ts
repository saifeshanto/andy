export interface Paged<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: string[];
}

export interface RoleInfo {
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}
