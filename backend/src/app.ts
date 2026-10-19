/**
 * Express application (API only). server.ts adds the Vite dev middleware / static hosting.
 * Exported separately so the API tests can run it without a browser build.
 */
import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { queryOne } from './db/pool.js';
import { loadUser } from './middleware/auth.js';
import { errorHandler, noStore, notFound, securityHeaders } from './middleware/errorHandler.js';
import { asyncHandler } from './utils/asyncHandler.js';
import { activityRouter } from './modules/activity/activity.routes.js';
import { announcementsRouter } from './modules/announcements/announcements.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { collectionsRouter } from './modules/collections/collections.routes.js';
import { disposalRouter } from './modules/disposal/disposal.routes.js';
import { endorsementsRouter } from './modules/endorsements/endorsements.routes.js';
import { householdsRouter } from './modules/households/households.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { profileRouter } from './modules/profile/profile.routes.js';
import { publicRouter } from './modules/public/public.routes.js';
import { puroksRouter } from './modules/puroks/puroks.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { schedulesRouter } from './modules/schedules/schedules.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { scanRouter } from './modules/scan/scan.routes.js';
import { mapRouter } from './modules/map/map.routes.js';

export function createApiRouter() {
  const api = express.Router();
  api.use(noStore);
  // 3 MB covers a 2 MB proof image after base64 encoding.
  api.use(express.json({ limit: '3mb' }));
  api.use(loadUser);

  api.get(
    '/health',
    asyncHandler(async (_req, res) => {
      await queryOne('SELECT 1 AS ok');
      res.json({ status: 'ok', database_mode: 'MySQL', timestamp: new Date().toISOString() });
    }),
  );

  api.use('/auth', authRouter);
  api.use('/public', publicRouter);
  api.use('/puroks', puroksRouter);
  api.use('/households', householdsRouter);
  api.use('/users', usersRouter);
  api.use('/profile', profileRouter);
  api.use('/schedules', schedulesRouter);
  api.use('/collections', collectionsRouter);
  api.use('/disposal', disposalRouter);
  api.use('/payments', paymentsRouter);
  api.use('/endorsements', endorsementsRouter);
  api.use('/announcements', announcementsRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/activity-logs', activityRouter);
  api.use('/settings', settingsRouter);
  api.use('/reports', reportsRouter);
  api.use('/scan', scanRouter);
  api.use('/map', mapRouter);

  api.use(notFound);
  api.use(errorHandler);
  return api;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', env.trustProxy);
  app.use(securityHeaders);
  // The frontend runs on a different origin (Vite dev server / Vercel). Auth uses a Bearer token, not cookies.
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition'],
      maxAge: 600,
    }),
  );
  app.get('/', (_req, res) => res.json({ name: 'Barangay Bang-Bang SGMS API', health: '/api/health' }));
  app.use('/api', createApiRouter());
  return app;
}
