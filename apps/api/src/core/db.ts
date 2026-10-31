import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';

let client: PrismaClient | undefined;

/**
 * Shared Prisma client using the pure-JS MariaDB driver adapter (no native query engine),
 * which is what makes Prisma workable on Hostinger shared hosting.
 * Keep the pool small: shared hosting limits concurrent DB connections.
 */
export function db(): PrismaClient {
  if (!client) {
    const url = new URL(env().DATABASE_URL);
    const adapter = new PrismaMariaDb({
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
      connectionLimit: Number(url.searchParams.get('connection_limit') ?? 5),
    });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
