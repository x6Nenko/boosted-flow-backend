# Health Check Feature

## High-Level Purpose
Provides a public health check endpoint for monitoring application status and database connectivity. Essential for deployment platforms like Digital Ocean to verify the app is running correctly.

---

## Architectural Map
```
src/
└── health/
    ├── health.module.ts        # Feature module, imports TerminusModule
    ├── health.controller.ts    # HTTP endpoint (GET /health)
    └── database.health.ts      # Custom health indicator for Drizzle/libsql
```

---

## Data Flow

### Health Check
1. `GET /health` → no body/params required
2. Route is public (no authentication required)
3. `HealthCheckService.check()` runs all health indicators
4. `DatabaseHealthIndicator.isHealthy()` executes `SELECT 1` against database
5. Response: Health check result object

### Successful Response (200)
```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up"
    }
  }
}
```

### Unhealthy Response (503)
```json
{
  "status": "error",
  "info": {},
  "error": {
    "database": {
      "status": "down"
    }
  },
  "details": {
    "database": {
      "status": "down"
    }
  }
}
```

---

## Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Public Route** | `@Public()` decorator bypasses JWT authentication |
| **Custom Health Indicator** | `DatabaseHealthIndicator` for Drizzle/libsql (no built-in support) |
| **Graceful Shutdown** | `app.enableShutdownHooks()` in main.ts for proper Terminus integration |

---

## Digital Ocean Configuration

Configure the health check endpoint in your App Platform settings:

- **HTTP Path**: `/health`
- **Port**: Your app port (default: 3000)
- **Expected Status Code**: 200

---

## Dependencies

- `@nestjs/terminus` - Health check framework
