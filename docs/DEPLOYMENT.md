# Deployment

## High-Level Purpose
Automated CI/CD pipeline for deploying NestJS backend to DigitalOcean using Docker, GitHub Actions, and secure secret injection via SSH.

---

## Architectural Map
```
.github/workflows/deploy.yml    # CI/CD workflow (test → build → deploy)
Dockerfile                      # Multi-stage build (builder → production)
docker-compose.prod.yml         # Production container config

Server: /var/www/boosted-flow-backend/
├── .env                        # Injected by GitHub Actions (chmod 600)
└── docker-compose.prod.yml     # Pulls ghcr.io/x6nenko/boosted-flow-backend:latest
```

---

## Data Flow

### CI/CD Pipeline
1. Push to `main` → triggers GitHub Actions
2. **Test job** → ESLint, unit tests, e2e tests
3. **Build job** → Docker build → push to GHCR (`ghcr.io/x6nenko/boosted-flow-backend:latest`)
4. **Deploy job** → SSH to server → inject secrets to .env → pull image → restart container
5. Health check → `GET /health` returns 200 OK

### Secret Injection (Secure)
```yaml
# GitHub Actions injects secrets via SSH
env:
  TURSO_DATABASE_URL: ${{ secrets.PROD_TURSO_DATABASE_URL }}
  JWT_SECRET: ${{ secrets.PROD_JWT_SECRET }}
  # ... all 17 secrets

# SSH action receives envs parameter
envs: TURSO_DATABASE_URL,JWT_SECRET,...

# On server, creates .env file with injected values
cat > .env << 'EOF'
TURSO_DATABASE_URL=${TURSO_DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
...
EOF
chmod 600 .env
```

---

## Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Secret Management** | GitHub Secrets → SSH injection → .env (never committed) |
| **Docker Multi-stage** | Builder (deps + build) → Production (runtime only) |
| **Non-root Container** | Runs as `nestjs` user (UID 1001) |
| **Health Checks** | Docker monitors `/health` every 30s |
| **Log Rotation** | Max 10MB per file, 3 files retained |

---

## Required GitHub Secrets

**Server Access:**
- `SERVER_HOST` - Droplet IP
- `SERVER_USERNAME` - SSH user (e.g., `sammy`)
- `SERVER_SSH_KEY` - Private SSH key

**Application (prefix PROD_):**
- `PROD_TURSO_DATABASE_URL`, `PROD_TURSO_AUTH_TOKEN`
- `PROD_JWT_SECRET`, `PROD_JWT_REFRESH_SECRET`
- `PROD_JWT_ACCESS_EXPIRATION`, `PROD_JWT_REFRESH_EXPIRATION`
- `PROD_JWT_COOKIE_MAX_AGE`, `PROD_JWT_ROTATION_PERIOD`
- `PROD_FRONTEND_URL`
- `PROD_GOOGLE_CLIENT_ID`, `PROD_GOOGLE_CLIENT_SECRET`, `PROD_GOOGLE_CALLBACK_URL`
- `PROD_SESSION_SECRET`
- `PROD_PLUNK_PUBLIC_KEY`, `PROD_PLUNK_SECRET_KEY`, `PROD_PLUNK_FROM_EMAIL`
- `PROD_PADDLE_API_KEY`

Generate secrets: `openssl rand -base64 48`

---

## docker-compose.prod.yml
```yaml
version: '3.8'

services:
  app:
    image: ghcr.io/x6nenko/boosted-flow-backend:latest
    container_name: boosted-flow-backend
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file: .env
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

---

## Common Operations

### View Logs
```bash
docker logs -f boosted-flow-backend
docker logs boosted-flow-backend --tail 100
```

### Rollback
```bash
# List images
docker images | grep boosted-flow-backend

# Edit docker-compose.prod.yml to use specific SHA
image: ghcr.io/x6nenko/boosted-flow-backend:SHA_HASH

# Restart
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### Database Migrations
```bash
docker exec boosted-flow-backend npm run db:migrate
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Container won't start** | `docker logs boosted-flow-backend` → check env vars |
| **Health check fails** | `curl http://localhost:3000/health` → verify DB connection |
| **502 Bad Gateway** | Check Nginx logs: `sudo tail -f /var/log/nginx/error.log` |
| **Image pull fails** | Verify GHCR permissions: Repo → Settings → Actions → Workflow permissions |
