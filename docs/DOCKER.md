# Docker Configuration

## High-Level Purpose
Docker configuration for containerizing the NestJS backend application. Provides consistent deployment across environments with security best practices and health monitoring.

---

## Architectural Map
```
project-root/
├── Dockerfile              # Multi-stage build configuration
├── .dockerignore           # Files excluded from build context
├── docker-compose.yml      # Local development/testing
└── docker-compose.prod.yml # Production deployment (pulls from GHCR)
```

---

## Build Process

### Multi-Stage Build
The Dockerfile uses a two-stage build for optimal image size:

1. **Builder Stage** - Compiles TypeScript to JavaScript
   - Installs all dependencies (including devDependencies)
   - Runs `npm run build` to generate `dist/` folder

2. **Production Stage** - Runs the application
   - Installs only production dependencies
   - Copies compiled `dist/` from builder
   - Runs as non-root user for security

### Build Flow
```
Source Code → npm ci → npm run build → dist/main.js
                ↓
Production Image → npm ci --only=production → node dist/main.js
```

---

## Security Features

| Feature | Implementation |
|---------|----------------|
| **Non-root User** | Container runs as `nestjs` user (UID 1001), not root |
| **Minimal Image** | Alpine Linux base, production deps only |
| **No Source Code** | Only compiled `dist/` included in production image |
| **Health Check** | Built-in Docker health monitoring |

### Note on Users
The Docker `nestjs` user is different from the server user (e.g., `sammy`):
- **Server user**: Manages the host OS, SSH access, Docker commands
- **Container user**: Runs the app inside the container for isolation

---

## Health Check

Docker monitors container health via the `/health` endpoint:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
```

| Parameter | Value | Description |
|-----------|-------|-------------|
| `interval` | 30s | Time between health checks |
| `timeout` | 10s | Max time for health check response |
| `start-period` | 40s | Grace period before first check |
| `retries` | 3 | Failed checks before marking unhealthy |

---

## Docker Compose Files

### Local Development (`docker-compose.yml`)
Builds from local Dockerfile for testing:
```bash
docker compose up --build
```

### Production (`docker-compose.prod.yml`)
Pulls pre-built image from GitHub Container Registry:
```bash
docker compose -f docker-compose.prod.yml up -d
```

---

## Common Commands

### Build & Run Locally
```bash
# Build image
docker build -t boosted-flow-backend .

# Run with env file
docker run -p 3000:3000 --env-file .env boosted-flow-backend

# Using docker-compose
docker compose up --build
```

### Production
```bash
# Pull and start
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# View logs
docker logs -f boosted-flow-backend

# Restart
docker compose -f docker-compose.prod.yml restart

# Stop
docker compose -f docker-compose.prod.yml down
```

### Debugging
```bash
# Enter container shell
docker exec -it boosted-flow-backend sh

# Check health status
docker inspect --format='{{.State.Health.Status}}' boosted-flow-backend

# View resource usage
docker stats boosted-flow-backend
```

---

## Environment Variables

Required environment variables (via `.env` file):
- `NODE_ENV=production`
- `PORT=3000` (optional, defaults to 3000)
- Database connection string
- JWT secrets
- Other app-specific config

**Note**: Never commit `.env` files to version control.

---

## Dependencies

- Docker Engine 20.10+
- Docker Compose v2
- Node.js 20 (Alpine image)
