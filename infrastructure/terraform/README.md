# Terraform (AWS) — DEPRECATED for current deployment target

This Terraform is retained for reference only. The current production
target is **Docker Compose on a single host** — see the repo-root
`docker-compose.yml` and `docs/ARCHITECTURE.md`.

Do not apply this Terraform without an explicit architecture decision
to move to AWS (ECS/RDS/ElastiCache). Secrets here are managed via
AWS Secrets Manager + sensitive variables; no credentials are committed.
