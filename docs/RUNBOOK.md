# Runbook — AarogyamAI operations

## Deploy (single-host, docker-compose.prod.yml)

```bash
cp .env.production.example .env   # fill secrets (JWT_*, MFA_ENCRYPTION_KEY, POSTGRES_PASSWORD, SMTP_*)
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate   # schema first
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec backend curl -sf localhost:3001/readyz
```

Migrations are idempotent; always run `migrate` before app containers on upgrade.

The prod stack runs under compose project `aarogyam-prod` — fully separate
containers/volumes from the dev stack (default project `aarogyamai`). The
names intentionally differ so the two can never stomp each other's postgres
or redis.

## Monitoring

```bash
docker compose -f docker-compose.prod.yml --profile monitoring up -d
```

- `GET /metrics` — Prometheus exposition (request rate/latency by
  method+route+status, db pool gauges, llm circuit, lockouts, rl rejections).
  Route labels are normalized patterns — raw paths never leak into labels.
- Prometheus scrapes `backend:3001/metrics` over the edge network; no host
  port. Check targets: `docker exec aarogyam-prod-prometheus-1
  wget -qO- localhost:9090/api/v1/targets`.
- Grafana on `127.0.0.1:3002` (localhost-only — SSH tunnel in prod),
  `GRAFANA_ADMIN_PASSWORD` in env. Datasource + "AarogyamAI — Backend"
  dashboard auto-provisioned from `./docker/grafana/provisioning/`.
- `SENTRY_DSN` optional — unset = zero-cost no-op; set = errors captured via
  the global error handler with request-id tags. Never blocks startup.

## Health

- `GET /health` — liveness (always 200 when process up)
- `GET /readyz` — readiness: `{ database, redis, llm }`. `llm: "degraded"` =
  provider circuit open; API still serves (AI features return safe fallbacks).

## Rollback

```bash
git checkout <previous-tag>            # e.g. post-production
docker compose -f docker-compose.prod.yml build && up -d
# DB rollback only if the deploy included a migration:
cd packages/backend && npm run migrate down <NNN_name>.sql   # .sql suffix required
```

## Backup / restore

```bash
# Daily pg_dump loop (enable once): writes to ./backups, 14-day retention
docker compose -f docker-compose.prod.yml --profile backup up -d backup

# Restore drill (dump → scratch DB → verify) — run periodically:
./scripts/restore-verify.sh <container> aarogyam aarogyam
```

## Edge (nginx)

- Only 80/443 published; backend/frontend have no host ports.
- Self-signed cert auto-generated on first boot — replace with real certs in
  `./docker/nginx/certs/` (server.crt / server.key) for production.
- Edge limits: api 10r/s, web 30r/s per IP → 429 on excess.

## CSRF posture

- Authentication is `Authorization: Bearer` only — no cookies are set or read
  anywhere in the stack (verified G6). CSRF tokens are therefore not
  applicable: browsers never attach Bearer tokens ambiently, and CORS runs
  with `credentials: false`.
- If cookie-based auth is ever introduced, add CSRF middleware
  (`csurf`-style synchronizer tokens) and set `credentials: true` in the same
  change.
- Refresh-token theft response: replaying a rotated refresh token revokes the
  whole family — all user sessions are invalidated and a per-user iat cutoff
  rejects every refresh token issued before the detection
  (`refresh:cutoff:<userId>` in Redis, cleared on next successful login).

## Incident quick reference

| Symptom | Check | Fix |
|---|---|---|
| 503 on /readyz | `checks` field in response | restart failed dep; verify DATABASE_URL/REDIS_URL |
| 429 storms | `rl:*` keys in redis | confirm limiter buckets; attackers share one IP → WAF |
| Account locked | `lockout:lock:<email>` key TTL | `DEL` the key or wait 15min |
| LLM unavailable | `/readyz` llm=degraded; logs `[LLMService] provider circuit opened` | provider creds/quota; circuit auto-resets in 60s |
| Audit verify fails | `POST /api/audit/verify` response lists tampered ids | investigate DB tampering; restore from backup if needed |
| MFA lockouts | user can't verify TOTP | admin resets `mfa_enabled`/`mfa_secret` (encrypted) |

## Known ops notes

- Backend tests need `TZ=UTC`, Postgres + Redis containers up.
- `npm run migrate` defaults to `up`; `down` needs the `.sql` suffix.
- Dev DB volume init creds are set once — changing POSTGRES_* envs on an
  existing volume has no effect (`docker compose down -v` to re-init).
- Residual audit findings: `qs` (moderate, DoS-only via express — mitigated by
  2m body cap), minimatch/typescript-eslint (dev-toolchain only).
- Dev compose uses non-standard ports (5433/6380/8001) to avoid colliding
  with other projects' containers on this host.
