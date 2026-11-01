import { afterEach, describe, expect, it } from 'vitest';
import { env, resetEnvForTests, withoutBlanks } from './env.js';

describe('env', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvForTests();
  });

  it('drops blank values', () => {
    expect(withoutBlanks({ A: '', B: '  ', C: 'x' })).toEqual({ C: 'x' });
  });

  it('treats blank optional variables as unset (Hostinger saves empty fields as "")', () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      PAYMENT_PROVIDER: '',
      PUBLIC_API_URL: '',
      BILLPLZ_SANDBOX: '',
      SMTP_PORT: '',
      BOOTSTRAP_ADMIN_EMAIL: '',
    });
    resetEnvForTests();
    const cfg = env();
    expect(cfg.PAYMENT_PROVIDER).toBe('none');
    expect(cfg.PUBLIC_API_URL).toBeUndefined();
    expect(cfg.BILLPLZ_SANDBOX).toBe(true);
    expect(cfg.SMTP_PORT).toBe(465);
  });

  it('still names a missing required variable', () => {
    process.env.JWT_SECRET = '';
    resetEnvForTests();
    expect(() => env()).toThrow(/JWT_SECRET/);
  });
});
