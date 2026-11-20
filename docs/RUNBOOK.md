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
- `npm run migrate` requires subcommand (`up`); bare call exits 1.
- Dev DB volume init creds are set once — changing POSTGRES_* envs on an
  existing volume has no effect (`docker compose down -v` to re-init).
- Residual audit findings: `qs` (moderate, DoS-only via express — mitigated by
  2m body cap), minimatch/typescript-eslint (dev-toolchain only).
- Dev compose uses non-standard ports (5433/6380/8001) to avoid colliding
  with other projects' containers on this host.
