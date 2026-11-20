import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { Request, Response, NextFunction } from 'express';

/**
 * Prometheus metrics — exposition at GET /metrics (unauthenticated, bound to
 * the internal/edge network only; scrape via prometheus profile or gateway).
 */

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 1, 3, 10],
  registers: [registry],
});

export const dbPoolSize = new Gauge({
  name: 'db_pool_total',
  help: 'DB pool configured size',
  registers: [registry],
});
export const dbPoolIdle = new Gauge({
  name: 'db_pool_idle',
  help: 'DB pool idle connections',
  registers: [registry],
});
export const dbPoolWaiting = new Gauge({
  name: 'db_pool_waiting',
  help: 'DB pool queued clients',
  registers: [registry],
});

export const llmCircuitOpen = new Gauge({
  name: 'llm_circuit_open',
  help: '1 while the LLM provider circuit breaker is open',
  registers: [registry],
});
export const llmCallsTotal = new Counter({
  name: 'llm_calls_total',
  help: 'LLM calls by outcome',
  labelNames: ['outcome'],
  registers: [registry],
});

export const lockoutsTotal = new Counter({
  name: 'account_lockouts_total',
  help: 'Accounts locked after failed logins',
  registers: [registry],
});

export const rateLimitRejections = new Counter({
  name: 'rate_limit_rejections_total',
  help: 'Requests rejected by the app rate limiter',
  labelNames: ['bucket'],
  registers: [registry],
});

/** Latency + count instrumentation. Route label is the pattern, not the path. */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // Use the matched route pattern only — never raw req.path, which would
    // leak IDs/tokens into labels and blow up cardinality on 404 scans.
    // baseUrl carries the mount prefix so router-local paths stay unambiguous
    // (/api/auth/sessions, not bare /sessions).
    const route = req.route?.path
      ? `${req.baseUrl || ''}${req.route.path}`
      : 'unmatched';
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  // Refresh gauges that read live subsystem state
  try {
    const { getDatabasePool } = await import('../config/database');
    const pool = getDatabasePool() as unknown as {
      totalCount?: number;
      idleCount?: number;
      waitingCount?: number;
    };
    dbPoolSize.set(pool.totalCount ?? 0);
    dbPoolIdle.set(pool.idleCount ?? 0);
    dbPoolWaiting.set(pool.waitingCount ?? 0);
  } catch {
    /* pool not up yet — leave gauges at last value */
  }
  try {
    const { getContainer } = await import('../composition');
    llmCircuitOpen.set(getContainer().services.llm.isDegraded() ? 1 : 0);
  } catch {
    /* container not ready */
  }
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
}
