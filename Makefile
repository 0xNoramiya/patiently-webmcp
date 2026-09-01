.PHONY: dev up down seed logs api-shell db-shell build clean

# === Local dev (Docker Compose) ===

up: ## Bring up the full stack (build first time)
	docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build

down: ## Stop and remove containers
	docker compose -f infra/docker-compose.yml --env-file infra/.env down

logs: ## Tail logs from all services
	docker compose -f infra/docker-compose.yml --env-file infra/.env logs -f --tail=80

# === Demo seeding ===

seed: ## Reset DB and load demo scenarios
	docker compose -f infra/docker-compose.yml --env-file infra/.env exec api python -m seed.demo_scenarios

# === Shells ===

api-shell: ## Open a Python shell inside the API container
	docker compose -f infra/docker-compose.yml --env-file infra/.env exec api python

db-shell: ## Open psql against the demo DB
	docker compose -f infra/docker-compose.yml --env-file infra/.env exec db psql -U antricare -d antricare

# === Builds ===

build-web: ## Build Next.js standalone
	cd apps/web && npm install --legacy-peer-deps && npm run build

build-api: ## Verify FastAPI imports (no run)
	cd apps/api && python3 -c "from app.main import app; print('ok')"

clean:
	docker compose -f infra/docker-compose.yml --env-file infra/.env down -v
