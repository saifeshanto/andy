import { env } from './config/env.js';
import { createApp } from './app.js';
import { disconnectDb } from './core/db.js';
import { logger } from './core/logger.js';

const { PORT, NODE_ENV } = env();
const server = createApp().listen(PORT, () => {
  logger.info({ port: PORT, env: NODE_ENV }, 'Andy API listening');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    void disconnectDb().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
