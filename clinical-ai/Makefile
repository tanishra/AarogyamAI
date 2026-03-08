.PHONY: dev stop test lint typecheck migrate shell

# ── Local dev ────────────────────────────────────────────────────────────────
dev:
	docker compose up -d
	@echo "Waiting for services..."
	@sleep 3
	@echo "PostgreSQL, Redis, LocalStack ready."
	@echo "Run: make migrate   then   make run-api"

stop:
	docker compose down

# ── Run services locally ──────────────────────────────────────────────────────
run-api:
	uv run uvicorn api.main:app --host 0.0.0.0 --port 8080 --reload

run-worker:
	uv run python agent_worker/main.py

# ── Database ──────────────────────────────────────────────────────────────────
migrate:
	uv run alembic upgrade head

migrate-create:
	uv run alembic revision --autogenerate -m "$(name)"

# ── Tests ─────────────────────────────────────────────────────────────────────
test:
	uv run pytest tests/ -v --cov=. --cov-report=term-missing

test-unit:
	uv run pytest tests/unit/ -v

test-integration:
	uv run pytest tests/integration/ -v

# ── Code quality ──────────────────────────────────────────────────────────────
lint:
	uv run ruff check . --fix
	uv run ruff format .

typecheck:
	uv run mypy api/ agent_worker/ packages/

# ── Utilities ─────────────────────────────────────────────────────────────────
shell:
	uv run python

.gitignore:
	@echo "Use the .gitignore content provided separately."
```

---

### 2.5 `.gitignore`
```
__pycache__/
*.py[cod]
*.pyo
.venv/
.env
.env.*
!.env.example
*.egg-info/
dist/
build/
.mypy_cache/
.ruff_cache/
.pytest_cache/
htmlcov/
.coverage
*.log
.DS_Store