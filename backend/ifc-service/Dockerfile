# Sprucelab IFC Service Dockerfile
# Multi-stage build for smaller production image

# ============================================================================
# Build stage - install dependencies
# ============================================================================
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ============================================================================
# Production stage
# ============================================================================
FROM python:3.11-slim

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Node.js for ThatOpen fragment conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash appuser && \
    mkdir -p /tmp/ifc-service && \
    chown -R appuser:appuser /tmp/ifc-service

# Copy application code
COPY --chown=appuser:appuser . .

# Install ThatOpen dependencies for fragment conversion (if scripts dir exists)
RUN if [ -f /app/scripts/package.json ]; then \
    cd /app/scripts && npm install --production; \
    fi

# Switch to non-root user
USER appuser

# Expose port (Railway sets $PORT dynamically, typically 8080)
EXPOSE 8080

# Run the application (use $PORT for Railway, fallback to 8080)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
