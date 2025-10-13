# Environment Setup Guide

Complete guide for setting up Python (conda) and Node.js (yarn) environments for the BIM Coordinator Platform.

---

## Overview

**Backend**: Python 3.11 via conda (`sprucelab` environment)
**Frontend**: Node.js 18 LTS + yarn
**Approach**: Single conda environment for all Python packages, global Node.js installation

---

## Backend Setup (Python/Django)

### Prerequisites

- **Conda** (Anaconda or Miniconda) installed
- Existing `sprucelab` conda environment with Python 3.11

### Step 1: Activate Environment

```bash
conda activate sprucelab
```

### Step 2: Install Backend Dependencies

**Option A: Using pip** (Recommended)
```bash
cd backend
pip install -r requirements.txt
```

**Option B: Using conda environment file**
```bash
conda env update -f backend/environment.yml --prune
```

### Step 3: Verify Installation

```bash
python -c "import django; import ifcopenshell; import open3d; print('✅ All packages installed!')"
```

### Step 4: Set Up Database

```bash
# Add your Supabase password to .env first!
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
```

### Step 5: Run Server

```bash
python manage.py runserver
```

Visit: http://127.0.0.1:8000/api/

---

## Frontend Setup (React/TypeScript)

### Prerequisites

- **Node.js 18 LTS** (recommended installation via nvm)
- **yarn** package manager

### Step 1: Install Node.js

**Option A: Using nvm (Recommended)**

```bash
# Install nvm (if not installed)
# Windows: https://github.com/coreybutler/nvm-windows
# Mac/Linux: https://github.com/nvm-sh/nvm

# Install Node 18
nvm install 18
nvm use 18

# Verify
node --version  # Should show v18.x.x
```

**Option B: Direct Install**

Download from: https://nodejs.org/ (choose 18 LTS)

### Step 2: Install yarn

```bash
# Using npm (comes with Node.js)
npm install -g yarn

# Verify
yarn --version
```

### Step 3: Install Frontend Dependencies (When Created)

```bash
cd frontend
yarn install
```

### Step 4: Run Dev Server (When Created)

```bash
yarn dev
```

Visit: http://localhost:5173/

---

## Environment Management Commands

### Python (conda)

```bash
# Activate environment
conda activate sprucelab

# Deactivate environment
conda deactivate

# List packages
conda list

# Update packages from environment.yml
conda env update -f backend/environment.yml --prune

# Export current environment
conda env export > backend/environment.yml

# Install new package
conda activate sprucelab
pip install package-name

# Check Python version
python --version
```

### Node.js (nvm)

```bash
# List installed versions
nvm list

# Switch Node version
nvm use 18

# Set default version
nvm alias default 18

# Check Node version
node --version

# Check npm version
npm --version

# Check yarn version
yarn --version
```

### Frontend (yarn)

```bash
# Install dependencies
yarn install

# Add package
yarn add package-name

# Add dev dependency
yarn add -D package-name

# Remove package
yarn remove package-name

# Update packages
yarn upgrade

# Check for outdated packages
yarn outdated

# Clean cache
yarn cache clean
```

---

## Full Project Setup (Fresh Start)

If you're setting up the project from scratch:

```bash
# 1. Clone/navigate to project
cd /path/to/ifc-extract-3d-mesh

# 2. Activate Python environment
conda activate sprucelab

# 3. Install backend dependencies
cd backend
pip install -r requirements.txt

# 4. Set up database (add password to .env first!)
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser

# 5. Start backend
python manage.py runserver

# Open new terminal...

# 6. Install frontend dependencies (when created)
cd frontend
yarn install

# 7. Start frontend (when created)
yarn dev
```

---

## Adding New Dependencies

### Backend (Python)

```bash
# 1. Activate environment
conda activate sprucelab

# 2. Install package
pip install package-name

# 3. Update requirements.txt
pip freeze > backend/requirements.txt

# 4. (Optional) Update environment.yml
conda env export > backend/environment.yml

# 5. Commit both files
git add backend/requirements.txt backend/environment.yml
git commit -m "Add package-name dependency"
```

### Frontend (Node.js)

```bash
# 1. Navigate to frontend
cd frontend

# 2. Add package
yarn add package-name

# 3. package.json and yarn.lock updated automatically

# 4. Commit both files
git add package.json yarn.lock
git commit -m "Add package-name dependency"
```

---

## Environment Variables

### Backend (.env in project root)

```env
# Supabase
SUPABASE_URL=https://mwcjhbvzhnzslnatglcg.supabase.co
SUPABASE_KEY=your-anon-key
DATABASE_URL=postgresql://postgres.mwcjhbvzhnzslnatglcg:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# Django
SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Redis (for Celery)
REDIS_URL=redis://localhost:6379/0
```

### Frontend (.env in frontend/ - when created)

```env
VITE_API_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=https://mwcjhbvzhnzslnatglcg.supabase.co
VITE_SUPABASE_KEY=your-anon-key
```

---

## Running Background Tasks (Celery)

### Step 1: Install and Start Redis

**Windows**: Download from https://github.com/microsoftarchive/redis/releases
**Mac**: `brew install redis && brew services start redis`
**Linux**: `sudo apt-get install redis-server && sudo systemctl start redis`

### Step 2: Start Celery Worker

```bash
# Activate environment
conda activate sprucelab

# Navigate to backend
cd backend

# Start worker
celery -A config worker --loglevel=info

# Windows users may need:
celery -A config worker --loglevel=info --pool=solo
```

---

## Troubleshooting

### Python Issues

**Problem**: `ImportError: No module named 'django'`
```bash
# Solution: Make sure sprucelab is activated
conda activate sprucelab
pip install -r backend/requirements.txt
```

**Problem**: `ModuleNotFoundError: No module named 'ifcopenshell'`
```bash
# Solution: ifcopenshell installation
conda activate sprucelab
pip install ifcopenshell==0.7.0
```

**Problem**: Open3D installation fails
```bash
# Solution: Try conda-forge channel
conda activate sprucelab
conda install -c conda-forge open3d
```

**Problem**: Database connection error
```bash
# Solution: Check .env file has correct password
# Get from: Supabase Dashboard → Settings → Database
```

### Node.js Issues

**Problem**: `command not found: yarn`
```bash
# Solution: Install yarn globally
npm install -g yarn
```

**Problem**: `Node version mismatch`
```bash
# Solution: Use correct Node version
nvm install 18
nvm use 18
```

**Problem**: Port 5173 already in use
```bash
# Solution: Kill process or use different port
# Windows: netstat -ano | findstr :5173
# Mac/Linux: lsof -ti:5173 | xargs kill -9
```

### General Issues

**Problem**: Permission denied errors (Mac/Linux)
```bash
# Solution: Use sudo for global installs
sudo npm install -g yarn
```

**Problem**: SSL certificate errors
```bash
# Solution: Update certificates
pip install --upgrade certifi
```

---

## IDE Setup Recommendations

### VS Code

**Recommended Extensions**:
- Python (Microsoft)
- Pylance
- Django
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- GitLens

**Settings** (`.vscode/settings.json`):
```json
{
  "python.defaultInterpreterPath": "/path/to/conda/envs/sprucelab/bin/python",
  "python.formatting.provider": "black",
  "python.linting.enabled": true,
  "python.linting.ruffEnabled": true,
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports": true
  }
}
```

### PyCharm

1. File → Settings → Project → Python Interpreter
2. Add Interpreter → Conda Environment
3. Select existing environment: `sprucelab`
4. Configure Django support: Enable Django Support → Set Django project root

---

## Quick Reference

### Most Common Commands

```bash
# Backend
conda activate sprucelab              # Activate Python environment
cd backend && python manage.py runserver  # Start Django server

# Frontend (when created)
cd frontend && yarn dev               # Start React dev server

# Database
python manage.py makemigrations       # Create migrations
python manage.py migrate              # Apply migrations
python manage.py shell                # Django shell

# Background tasks
redis-server                          # Start Redis
celery -A config worker -l info       # Start Celery worker
```

### Directory Structure

```
sprucelab (conda env)     → Python 3.11 + all backend packages
Node.js 18 (global)       → JavaScript runtime
yarn (global)             → Package manager

backend/
├── environment.yml       → Conda environment definition
├── requirements.txt      → Pip requirements
└── .python-version       → Python version (3.11)

frontend/ (when created)
├── package.json          → Node.js dependencies
├── yarn.lock             → Locked versions
└── .nvmrc                → Node version (18)
```

---

## Additional Resources

- **Conda**: https://docs.conda.io/
- **nvm**: https://github.com/nvm-sh/nvm
- **yarn**: https://yarnpkg.com/
- **Django**: https://docs.djangoproject.com/
- **React**: https://react.dev/
- **Vite**: https://vitejs.dev/

---

**Need help?** Check `QUICKSTART.md`, `backend/README.md`, or `CLAUDE.md` for more information.
