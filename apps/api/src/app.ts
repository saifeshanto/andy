import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFound } from './core/errors.js';
import { adminUsersRouter } from './modules/admin-users/index.js';
import { auditRouter } from './modules/audit/index.js';
import { authRouter } from './modules/auth/index.js';
import { emailAdminRouter } from './modules/notifications/index.js';
import { rbacRouter } from './modules/rbac/index.js';
import { settingsRouter } from './modules/settings/index.js';
import { internalRouter, systemRouter } from './modules/system/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Finds the built React app: WEB_DIST, then the bundle layout (./public), then the dev layout. */
function resolveWebDist(): string | undefined {
  const candidates = [env().WEB_DIST, path.join(here, 'public'), path.resolve(here, '../../web/dist')];
  return candidates.find((p): p is string => !!p && existsSync(path.join(p, 'index.html')));
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(systemRouter);
  api.use(internalRouter);
  api.use(authRouter);
  api.use(settingsRouter);
  api.use(adminUsersRouter);
  api.use(rbacRouter);
  api.use(auditRouter);
  api.use(emailAdminRouter);
  api.use(notFound);
  app.use('/api/v1', api);

  const webDist = resolveWebDist();
  if (webDist) {
    app.use(express.static(webDist, { index: false, maxAge: '7d', immutable: true }));
    // SPA fallback: any non-API GET returns index.html so React Router can handle it.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
