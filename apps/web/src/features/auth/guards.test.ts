import { describe, expect, it } from 'vitest';
import { safeNext } from './guards';

describe('safeNext', () => {
  it('allows same-site paths only', () => {
    expect(safeNext('/admin/users')).toBe('/admin/users');
    expect(safeNext('//evil.com')).toBe('/account');
    expect(safeNext('https://evil.com')).toBe('/account');
    expect(safeNext(null)).toBe('/account');
  });
});
