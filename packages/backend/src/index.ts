// Load .env file FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Now import everything else
import express from 'express';
import cors from 'cors';
import routes from './routes';
import { securityHeaders, sanitizeInput, rateLimit } from './middleware/securityMiddleware';
import { requestLogger, responseTimeTracker } from './middleware/requestLogger';
import { metricsMiddleware, metricsHandler } from './lib/metrics';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { config } from './config';
import { logger } from './lib/logger';

const app = express();
const PORT = config.port;

// Optional error tracking — zero-cost no-op unless SENTRY_DSN is set.
if (process.env.SENTRY_DSN) {
  import('@sentry/node')
    .then((Sentry) => {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: config.nodeEnv,
        // No PII in events — audit/user data stays out of error reports.
        sendDefaultPii: false,
      });
      logger.info('Sentry initialized');
    })
    .catch((err) => logger.warn('Sentry init failed (continuing without):', err));
}

// Request ID: honor inbound X-Request-Id, else generate; echo back on response
app.use((req, res, next) => {
  const inbound = req.headers['x-request-id'];
  const requestId = typeof inbound === 'string' && inbound.length <= 128 ? inbound : undefined;
  (req as typeof req & { requestId?: string }).requestId = requestId;
  res.setHeader('X-Request-Id', requestId ?? '');
  next();
});

// Request tracking middleware
app.use(requestLogger);
app.use(responseTimeTracker);
app.use(metricsMiddleware);

// Security middleware
app.use(securityHeaders);
app.use(cors({
  origin: config.frontendUrl,
  // No cookie-based auth anywhere — all calls carry Authorization:
  // Bearer, which browsers never attach ambiently, so credentialed CORS
  // is surface for no benefit and CSRF is not applicable by design.
  credentials: false,
}));
app.use(express.json({ limit: '10mb' }));
app.use(sanitizeInput);

// Rate limiting: 2000 requests per 5 minutes per IP
app.use(rateLimit({ windowMs: 5 * 60 * 1000, maxRequests: 2000 }));

// Prometheus scrape endpoint — bind internal/edge only in production.
app.get('/metrics', metricsHandler);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness: verifies DB + Redis connectivity before traffic is routed here
app.get('/readyz', async (_req, res) => {
  const checks: Record<string, string> = {};
  try {
    const { checkDatabaseHealth } = await import('./config/database');
    checks.database = (await checkDatabaseHealth()) ? 'ok' : 'fail';
  } catch {
    checks.database = 'fail';
  }
  try {
    const { checkRedisHealth } = await import('./config/redis');
    checks.redis = (await checkRedisHealth()) ? 'ok' : 'fail';
  } catch {
    checks.redis = 'fail';
  }
  try {
    const { getContainer } = await import('./composition');
    const llm = getContainer().services.llm;
    checks.llm = llm.isDegraded() ? 'degraded' : 'ok';
  } catch {
    checks.llm = 'unknown';
  }
  const ready = Object.values(checks).every((v) => v === 'ok' || v === 'degraded');
  res.status(ready ? 200 : 503).json({ ready, checks });
});

// Periodic cleanup of expired sessions (every hour)
if (config.nodeEnv !== 'test') {
  const cleanupTimer = setInterval(() => {
    import('./composition')
      .then(({ getContainer }) =>
        getContainer().services.session.cleanupExpiredSessions()
      )
      .then((removed) => {
        if (removed > 0) logger.debug(`Cleaned up ${removed} expired sessions`);
      })
      .catch((error) => logger.warn('Session cleanup failed', { error }));
  }, 60 * 60 * 1000);
  cleanupTimer.unref();
}

// API routes
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Process-level safety nets — never die silently
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception — exiting', { error });
  process.exit(1);
});

// Start server only if not in test mode
let server: ReturnType<typeof app.listen> | undefined;
if (config.nodeEnv !== 'test') {
  server = app.listen(PORT, () => {
    logger.debug(`AarogyamAI backend listening on port ${PORT}`);
    logger.debug(`Environment: ${config.nodeEnv}`);
  });

  // Graceful shutdown: stop accepting, drain, close pool
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} — shutting down gracefully`);
    server?.close(async () => {
      try {
        const { closeDatabasePool } = await import('./config/database');
        const { closeRedisClient } = await import('./config/redis');
        await closeDatabasePool();
        await closeRedisClient();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    });
    // Force-exit if drain takes too long
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

export default app;
