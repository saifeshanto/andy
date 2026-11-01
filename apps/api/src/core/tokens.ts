import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

const key = () => new TextEncoder().encode(env().JWT_SECRET);
const ISSUER = 'andy-platform';

export interface AccessClaims {
  sub: string; // user id
}

export async function signAccessToken(userId: bigint): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId.toString())
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${env().ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(key());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? { sub: payload.sub } : null;
  } catch {
    return null;
  }
}
