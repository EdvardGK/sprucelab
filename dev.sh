#!/bin/bash
# Sprucelab Local Development Environment
#
# Usage:
#   ./dev.sh          Start all services (PostgreSQL, Redis, Django, FastAPI, Frontend)
#   ./dev.sh --seed   Start + seed test data
#   ./dev.sh --stop   Stop all services including Docker containers
#
# Requires: Docker, conda env "sprucelab", yarn

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

PIDS=()

cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping services...${NC}"
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    echo -e "${GREEN}Services stopped.${NC} Docker containers still running."
    echo "  Run './dev.sh --stop' to also stop PostgreSQL and Redis."
    exit 0
}

trap cleanup INT TERM

# --stop: tear down everything
if [ "$1" = "--stop" ]; then
    echo -e "${YELLOW}Stopping Docker containers...${NC}"
    docker compose -f "$PROJECT_ROOT/docker-compose.dev.yml" down
    echo -e "${GREEN}Done.${NC}"
    exit 0
fi

echo -e "${BLUE}Starting Sprucelab Local Dev Environment${NC}"
echo ""

# 1. Start infrastructure (PostgreSQL + Redis)
echo -e "${BLUE}[1/6] Starting PostgreSQL + Redis...${NC}"
docker compose -f "$PROJECT_ROOT/docker-compose.dev.yml" up -d

# Wait for PostgreSQL
echo -n "  Waiting for PostgreSQL..."
for i in $(seq 1 30); do
    if docker exec sprucelab-dev-db pg_isready -U postgres > /dev/null 2>&1; then
        echo -e " ${GREEN}ready${NC}"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo -e " ${RED}timeout${NC}"
        echo "PostgreSQL failed to start. Check: docker logs sprucelab-dev-db"
        exit 1
    fi
    echo -n "."
    sleep 1
done

# 2. Activate conda
echo -e "${BLUE}[2/6] Activating conda environment...${NC}"
source ~/miniconda3/etc/profile.d/conda.sh
conda activate sprucelab

# Ensure FastAPI deps are installed (ifc-service has its own requirements.txt)
if ! python -c "import fastapi" 2>/dev/null; then
    echo -e "${YELLOW}  Installing FastAPI service dependencies...${NC}"
    pip install -q -r "$PROJECT_ROOT/backend/ifc-service/requirements.txt"
fi

# 3. Run migrations
echo -e "${BLUE}[3/6] Running Django migrations...${NC}"
python "$PROJECT_ROOT/backend/manage.py" migrate --run-syncdb 2>&1 | tail -3

# Seed data if requested
if [ "$1" = "--seed" ]; then
    echo -e "${BLUE}  Seeding test data...${NC}"
    python "$PROJECT_ROOT/backend/manage.py" seed_dev_data
fi

# 4. Create frontend .env.local if missing
if [ ! -f "$PROJECT_ROOT/frontend/.env.local" ]; then
    echo -e "${YELLOW}  Creating frontend/.env.local${NC}"
    cat > "$PROJECT_ROOT/frontend/.env.local" << 'EOF'
VITE_API_URL=http://localhost:8000
VITE_IFC_SERVICE_URL=http://localhost:8001/api/v1
EOF
fi

# 5. Start Django (port 8000)
echo -e "${BLUE}[4/6] Starting Django (port 8000)...${NC}"
python "$PROJECT_ROOT/backend/manage.py" runserver 0.0.0.0:8000 &
PIDS+=($!)

# 6. Start FastAPI IFC Service (port 8001, with hot reload)
echo -e "${BLUE}[5/6] Starting FastAPI IFC Service (port 8001)...${NC}"
cd "$PROJECT_ROOT/backend/ifc-service"
PORT=8001 python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload &
PIDS+=($!)
cd "$PROJECT_ROOT"

# 7. Start Frontend (port 5173)
echo -e "${BLUE}[6/6] Starting Vite frontend (port 5173)...${NC}"
cd "$PROJECT_ROOT/frontend"
yarn dev &
PIDS+=($!)
cd "$PROJECT_ROOT"

sleep 2
echo ""
echo -e "${GREEN}Local dev environment running:${NC}"
echo ""
echo "  Frontend:     http://localhost:5173"
echo "  Django API:   http://localhost:8000/api/"
echo "  FastAPI IFC:  http://localhost:8001/docs"
echo "  PostgreSQL:   localhost:5432 (sprucelab_dev)"
echo "  Redis:        localhost:6379"
echo ""
echo "Press Ctrl+C to stop code services (Docker keeps running)"
echo ""

wait
