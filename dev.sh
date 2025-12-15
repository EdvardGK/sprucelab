#!/bin/bash
# Local Development Script
# Run this from the project root: ./dev.sh

echo "🚀 Starting Sprucelab Local Development Environment"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Activate conda environment
source ~/miniconda3/etc/profile.d/conda.sh
conda activate sprucelab

# Check if backend/.env.local exists
if [ ! -f "backend/.env.local" ]; then
    echo "⚠️  backend/.env.local not found!"
    echo "   Copy backend/.env.local.example to backend/.env.local and configure it"
    exit 1
fi

# Check if frontend/.env.local exists
if [ ! -f "frontend/.env.local" ]; then
    echo "⚠️  frontend/.env.local not found!"
    echo "   Creating default frontend/.env.local pointing to localhost:8000"
    cat > frontend/.env.local << 'EOF'
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://rtrgoqpsdmhhcmgietle.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0cmdvcXBzZG1oaGNtZ2lldGxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTkzMzEsImV4cCI6MjA4MTEzNTMzMX0.l3P7lJkDW12uAFq3ZwZ7iUaq7Rfqh4WMytfwockU3_c
EOF
fi

echo -e "${BLUE}Starting Django backend...${NC}"
echo "   URL: http://localhost:8000"
echo "   Admin: http://localhost:8000/admin/"
echo ""

# Start backend in background
cd backend
python manage.py runserver &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

echo -e "${BLUE}Starting Vite frontend...${NC}"
echo "   URL: http://localhost:5173"
echo ""

# Start frontend
cd frontend
yarn dev &
FRONTEND_PID=$!
cd ..

echo ""
echo -e "${GREEN}✅ Local development environment running!${NC}"
echo ""
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8000"
echo "   API:      http://localhost:8000/api/"
echo ""
echo "Press Ctrl+C to stop both servers"

# Trap Ctrl+C to kill both processes
trap "echo ''; echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT

# Wait for processes
wait
