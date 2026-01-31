# Deployment

## High-Level Purpose
Automated CI/CD pipeline for deploying NestJS backend to DigitalOcean App Platform using GitHub Actions.

---

## Architectural Map
```
.github/workflows/deploy.yml    # CI/CD workflow (test → deploy)
.do/app.yaml                    # App Platform specification
Dockerfile                      # Multi-stage build (builder → production)

DigitalOcean App Platform:
├── Builds from Dockerfile      # App Platform handles build
├── Environment Variables       # Configured in DO Dashboard
└── Health Checks              # Configured in app.yaml
```

---

## Data Flow

### CI/CD Pipeline
1. Push to `main` → triggers GitHub Actions
2. **Test job** → unit tests, e2e tests
3. **Deploy job** → `digitalocean/app_action/deploy@v2` triggers deployment
4. App Platform → builds Docker image → deploys container
5. Health check → `GET /health` returns 200 OK

### Environment Variables (Secure)
Environment variables are managed directly in DigitalOcean Dashboard:
- **DO Dashboard** → App → Settings → Environment Variables
- Secrets are encrypted and never exposed in repository
- No SSH or secret injection needed

---

## Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Secret Management** | DO Dashboard Environment Variables (encrypted) |
| **Docker Multi-stage** | Builder (deps + build) → Production (runtime only) |
| **Non-root Container** | Runs as `nestjs` user (UID 1001) |
| **Health Checks** | App Platform monitors `/health` endpoint |
| **Auto-deploy** | Deploys on push to `main` branch |

---

## Required Secrets

### GitHub Repository Secrets
Only one secret needed:
- `DIGITALOCEAN_ACCESS_TOKEN` - DO API token with App Platform read/write permissions

### DigitalOcean App Environment Variables
Configure in **DO Dashboard → App → Settings → Environment Variables**:

| Variable | Description |
|----------|-------------|
| `TURSO_DATABASE_URL` | Turso database connection URL |
| `TURSO_AUTH_TOKEN` | Turso authentication token |
| `JWT_SECRET` | JWT signing secret |
| `JWT_REFRESH_SECRET` | JWT refresh token secret |
| `JWT_ACCESS_EXPIRATION` | Access token expiration (e.g., `15m`) |
| `JWT_REFRESH_EXPIRATION` | Refresh token expiration (e.g., `7d`) |
| `JWT_COOKIE_MAX_AGE` | Cookie max age in milliseconds |
| `JWT_ROTATION_PERIOD` | Token rotation period |
| `FRONTEND_URL` | Frontend application URL |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | Google OAuth callback URL |
| `SESSION_SECRET` | Express session secret |
| `PLUNK_PUBLIC_KEY` | Plunk email public key |
| `PLUNK_SECRET_KEY` | Plunk email secret key |
| `PLUNK_FROM_EMAIL` | Sender email address |
| `PADDLE_API_KEY` | Paddle payments API key |

> **Tip**: Mark sensitive values as "Encrypted" in DO Dashboard for additional security.

Generate secrets: `openssl rand -base64 48`

---

## App Specification (`.do/app.yaml`)

The app spec defines how App Platform builds and runs the application:
- Uses Dockerfile for builds
- Configures health checks
- Sets instance size and count
- Enables auto-deploy on push

---

## Common Operations

### View Logs
In DO Dashboard → App → Runtime Logs

Or via CLI:
```bash
doctl apps logs <app-id> --type=run
```

### Rollback
In DO Dashboard → App → Deployments → select previous deployment → Rollback

### Database Migrations
Access via DO Dashboard → App → Console:
```bash
npm run db:migrate
```

### Force Rebuild
DO Dashboard → App → Actions → Force Rebuild

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Build fails** | Check build logs in DO Dashboard → App → Deployments |
| **Health check fails** | Verify `/health` endpoint and env vars are configured |
| **Deployment stuck** | Check runtime logs, verify environment variables |
| **502 errors** | Check if app started correctly, verify PORT=3000 |

---

## Migration from Droplet

If migrating from a Droplet deployment:

1. **Remove old GitHub Secrets** (no longer needed):
   - `SERVER_HOST`, `SERVER_USERNAME`, `SERVER_SSH_KEY`
   - All `PROD_*` prefixed secrets

2. **Add new GitHub Secret**:
   - `DIGITALOCEAN_ACCESS_TOKEN`

3. **Configure DO App Environment Variables**:
   - Add all application secrets in DO Dashboard (without `PROD_` prefix)

4. **Create App in DO**:
   - First deployment: Create app via DO Dashboard connecting to GitHub repo
   - This authenticates GitHub and creates the app
   - Subsequent deploys: Automatic via GitHub Actions
