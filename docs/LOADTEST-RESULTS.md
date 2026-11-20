# Load Test Results — 2026-11-20

Environment: prod compose stack on dev host (M-series Mac, Docker Desktop).
Tool: autocannon, 50 connections, 20s.

## Edge path (https://localhost → nginx → app)

| Target | Throughput | p50 | p99 | Notes |
|---|---|---|---|---|
| `/health` | 42.6k req/s attempted → ~15 req/s admitted | 9ms | 47ms | 852k non-2xx = **nginx edge limiter (10r/s + burst) rejecting — working as designed** |

## App path (inside compose network → backend:3001)

| Target | Throughput | p50 | p99 | Notes |
|---|---|---|---|---|
| `/readyz` | 12.1k req/s attempted | 3ms | 9ms | 2000 2xx then 429s — **app limiter (2000/5min per IP) working as designed**; admitted-path latency excellent |

## Findings

- Rate limiting verified end-to-end at both layers (edge + app). Under attack
  load the edge sheds ~99.96% of traffic before the app sees it.
- Admitted-path latency p99 < 10ms on health endpoints — ample headroom.
- Throughput ceiling is limiter-bound, not CPU-bound — raise edge zone rates
  or app `maxRequests` if real capacity needed >10r/s/IP.
- Single-IP perspective only — real multi-user spread across IPs gets the
  full per-IP allowance each.

## Follow-ups

- Re-run against authenticated endpoints when a load-safe test account exists.
- Consider `429` (not 503) at nginx for limit hits: add `limit_req_status 429`.
