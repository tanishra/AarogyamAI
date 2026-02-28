# Production Readiness Checklist

## Before Every Clinic Deployment

Run the automated check first:
```bash
DATABASE_URL=... uv run python scripts/observability_check.py
```

---

## Infrastructure

- [ ] PostgreSQL 15 — connection pooling configured (pool_size=10)
- [ ] Redis 7 — persistence enabled (AOF)
- [ ] SQS queue — dead letter queue configured (max 3 retries)
- [ ] AWS Secrets Manager — LLM API key stored, not in env
- [ ] Cognito — patient pool + staff pool both active
- [ ] SSL/TLS — all endpoints HTTPS only
- [ ] VPC — DB and Redis not publicly accessible

## Security

- [ ] DEV_SKIP_COGNITO_VERIFY = false
- [ ] APP_ENV = production
- [ ] CORS origins — only clinic domain whitelisted
- [ ] Input validation middleware active
- [ ] Prompt injection patterns up to date
- [ ] Audit log — hash chain verified clean
- [ ] PII stripper — all patterns tested

## AI Safety

- [ ] Output filter — all blocked patterns tested
- [ ] Fallback path — tested and verified
- [ ] AI label present on all differentials
- [ ] No diagnosis language passing filter
- [ ] Doctor action required before record commit
- [ ] Tier 3 consent enforced on record commit

## Data Privacy (DPDP)

- [ ] Consent version = current (1.1)
- [ ] All four Tier 1 purposes present in grant flow
- [ ] Withdrawal flow tested — cache invalidated
- [ ] Erasure request flow tested
- [ ] Audit chain integrity verified
- [ ] No PHI in audit log entries
- [ ] No PHI in structured logs
- [ ] Session expiry working (20 min)
- [ ] Answer cache TTL set (2 hours)

## Observability

- [ ] Structured JSON logs — all services
- [ ] Request tracing — X-Request-ID propagated
- [ ] Latency logged on every request
- [ ] Fallback events logged with reason
- [ ] PII strip events logged (was_modified flag)
- [ ] Output filter blocks logged with hash

## Performance

- [ ] API latency p95 < 500ms (non-AI routes)
- [ ] AI synthesis p95 < 30s
- [ ] DB connection pool not exhausted under load
- [ ] Redis cache hit rate > 80% for consent checks

## Rollback

- [ ] Previous Docker image tagged and stored
- [ ] DB migration rollback tested (alembic downgrade -1)
- [ ] Rollback runbook documented
- [ ] On-call contact list updated

## Clinic Specific

- [ ] Seed script run — clinic users created
- [ ] Nurse login tested end-to-end
- [ ] Doctor login tested end-to-end
- [ ] Patient OTP flow tested with real phone
- [ ] Consent grant flow tested on clinic device
- [ ] Vitals submission tested with outlier confirmation
- [ ] AI synthesis tested with real case
- [ ] Doctor commit tested with Tier 3 consent
- [ ] SMS receipt delivery tested

---

## Deployment Commands
```bash
# 1. Run migrations
uv run alembic upgrade head

# 2. Seed clinic
DATABASE_URL=... uv run python scripts/seed_clinic.py

# 3. Run observability check
DATABASE_URL=... uv run python scripts/observability_check.py

# 4. Start API
uvicorn api.main:app --host 0.0.0.0 --port 8080

# 5. Start agent worker
python -m agent_worker.main
```

---

## Emergency Procedures

### AI Synthesis Failing
1. Check SQS dead letter queue
2. Verify LLM API key valid
3. Check agent worker logs for fallback reason
4. Fallback path serves doctor — no patient impact

### Consent Cache Stale
1. Redis flush: `redis-cli FLUSHDB` (dev only)
2. Production: invalidate by patient_id key pattern
3. Middleware falls back to DB on cache miss — safe

### Audit Chain Break Detected
1. STOP all writes immediately
2. Run: `uv run python scripts/observability_check.py`
3. Escalate to DPO immediately
4. Do NOT attempt to repair chain — preserve evidence