import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` does not connect, so a build without DATABASE_URL still works.
  // Commands that do connect (migrate) fail clearly on the placeholder.
  datasource: { url: process.env.DATABASE_URL ?? 'mysql://missing-DATABASE_URL@localhost:3306/missing' },
});
