.PHONY: help up down restart logs setup clean test

# UPDATE the help command to include new options:
help:
	@echo "Available commands:"
	@echo "  make setup    - Initial setup of the project"
	@echo "  make up       - Start all services"
	@echo "  make down     - Stop all services"
	@echo "  make restart  - Restart all services"
	@echo "  make logs     - View logs from all services"
	@echo "  make clean    - Clean up volumes and containers"
	@echo "  make test     - Run all tests"
	@echo ""
	@echo "Python Simulator commands:"
	@echo "  make simulator-logs     - View simulator logs"
	@echo "  make simulator-shell    - Access simulator shell"
	@echo "  make simulator-restart  - Restart simulator"
	@echo "  make simulator-health   - Check simulator health"
	@echo "  make simulator-metrics  - View simulator metrics"

setup:
	@echo "Setting up development environment..."
	@cp backend/.env.example backend/.env
	@cp frontend/.env.example frontend/.env
	@docker compose build
	@echo "Setup complete! Run 'make up' to start services."

up:
	@docker compose up -d
	@echo "Services started! Access the app at http://localhost:3000"

down:
	@docker compose down

restart:
	@docker compose restart

logs:
	@docker compose logs -f

clean:
	@docker compose down -v
	@rm -rf backend/node_modules frontend/node_modules
	@rm -rf backend/dist frontend/.next

test:
	@docker compose exec backend npm test
	@docker compose exec frontend npm test

# Database specific commands
db-migrate:
	@docker compose exec backend npm run migrate up

db-seed:
	@docker compose exec backend npm run seed

# Development helpers
backend-shell:
	@docker compose exec backend sh

frontend-shell:
	@docker compose exec frontend sh

redis-cli:
	@docker compose exec redis redis-cli -a grid_redis_password

# Python Simulator specific commands
simulator-logs:
	@docker compose logs -f telemetry-simulator

simulator-shell:
	@docker compose exec telemetry-simulator sh

simulator-restart:
	@docker compose restart telemetry-simulator

simulator-health:
	@curl -s http://localhost:8080/health | jq .

simulator-metrics:
	@curl -s http://localhost:8080/metrics

simulator-stop:
	@docker compose stop telemetry-simulator

simulator-start:
	@docker compose start telemetry-simulator