# User Authentication Feature

## High-Level Purpose
JWT-based authentication with access/refresh token rotation, bcrypt password hashing, and scheduled token cleanup for a NestJS + Drizzle ORM backend.

---

## Architectural Map
```
src/
├── auth/
│   ├── auth.module.ts          # Feature module, configures JwtModule
│   ├── auth.controller.ts      # HTTP endpoints (register, login, refresh, logout)
│   ├── auth.service.ts         # Business logic, token generation, password hashing
│   ├── guards/
│   │   └── auth.guard.ts       # Global JWT validation guard
│   └── decorators/
│       ├── public.decorator.ts      # Marks routes as public (bypasses auth)
│       └── current-user.decorator.ts # Extracts user from request
│   └── dto/
│       ├── register.dto.ts     # Validation: email, password (8-72 chars)
│       ├── login.dto.ts        # Validation: email, password
│       └── refresh.dto.ts      # Validation: refreshToken
├── users/
│   ├── users.module.ts         # Exports UsersService
│   └── users.service.ts        # User CRUD operations
├── tasks/
│   ├── tasks.module.ts         # Scheduled tasks module
│   └── tasks.service.ts        # Token cleanup cron job
└── database/schema/
    ├── users.ts                # User table definition
    ├── refresh-tokens.ts       # Refresh token table definition
    └── relations.ts            # Drizzle ORM relations
```

---

## Data Flow

### Registration
1. `POST /auth/register` → `RegisterDto` validates email + password (8-72 chars)
2. `AuthService.register()` → checks email uniqueness via `UsersService.findByEmail()`
3. Password hashed with `bcrypt.hash(password, 12)` (cost factor 12)
4. `UsersService.create()` → inserts user with UUID, normalized email, timestamps
5. `generateTokenPair()` → creates access token (15m) + refresh token (7d)
6. Refresh token hashed (SHA-256) and stored in `refresh_tokens` table
7. Response: `{ accessToken, refreshToken }`

### Login
1. `POST /auth/login` → `LoginDto` validates input
2. Fetch user by email → `bcrypt.compare()` validates password
3. `generateTokenPair()` → new token pair issued
4. Response: `{ accessToken, refreshToken }`

### Token Refresh
1. `POST /auth/refresh` → `RefreshDto` provides refresh token
2. Verify JWT signature with `jwt.refreshSecret`
3. Validate user exists via `UsersService.findById()`
4. Check stored token: hash match, not expired, not revoked
5. **Rotate**: revoke old token → issue new pair
6. Response: `{ accessToken, refreshToken }`

### Logout
1. `POST /auth/logout` → marks refresh token as revoked in DB
2. Response: `204 No Content`

### Protected Routes
1. `AuthGuard` extracts Bearer token from `Authorization` header
2. Verifies with `jwt.secret` → attaches payload to `request.user`
3. Use `@CurrentUser()` decorator to access user in handlers

---

## Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Global Guard** | `AuthGuard` registered as `APP_GUARD` in `AppModule` |
| **Public Routes** | `@Public()` decorator + `IS_PUBLIC_KEY` metadata |
| **Custom Param Decorator** | `@CurrentUser()` extracts `request.user` |
| **Rate Limiting** | `@Throttle({ default: { limit: 10, ttl: 60000 } })` per endpoint |
| **Async JWT Config** | `JwtModule.registerAsync()` with `ConfigService` injection |
| **Token Rotation** | Old refresh token revoked on each refresh |
| **Scheduled Tasks** | `@Cron(EVERY_DAY_AT_MIDNIGHT)` for token cleanup |
| **DTO Validation** | `class-validator` decorators (`@IsEmail`, `@MinLength`, etc.) |

---

## Public Interface

### AuthController (`/auth`)
```typescript
@Post('register')  register(@Body() dto: RegisterDto): Promise<TokenPair>
@Post('login')     login(@Body() dto: LoginDto): Promise<TokenPair>
@Post('refresh')   refresh(@Body() dto: RefreshDto): Promise<TokenPair>
@Post('logout')    logout(@Body() dto: RefreshDto): Promise<void>
```

### AuthService
```typescript
register(email: string, password: string): Promise<TokenPair>
login(email: string, password: string): Promise<TokenPair>
refresh(refreshToken: string): Promise<TokenPair>
logout(refreshToken: string): Promise<void>
// private: generateTokenPair(), hashToken()
```

### UsersService
```typescript
create(email: string, hashedPassword: string): Promise<User>
findByEmail(email: string): Promise<User | undefined>
findById(id: string): Promise<User | undefined>
// private: normalizeEmail()
```

### TokenPair Type
```typescript
{ accessToken: string; refreshToken: string }
```

---

## Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| email | TEXT UNIQUE | Normalized (lowercase, trimmed) |
| hashedPassword | TEXT | bcrypt hash |
| createdAt | TEXT | ISO string |
| updatedAt | TEXT | ISO string |

### `refresh_tokens`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID (matches JWT `jti`) |
| userId | TEXT FK | References `users.id` |
| hashedToken | TEXT | SHA-256 hex hash |
| expiresAt | TEXT | ISO string |
| revoked | INTEGER | Boolean (0/1) |
| createdAt | TEXT | ISO string |

---

## Configuration
```typescript
// config/configuration.ts
jwt: {
  secret: process.env.JWT_SECRET,        // Access token signing
  refreshSecret: process.env.JWT_REFRESH_SECRET  // Refresh token signing
}
```

**Token Lifetimes**: Access = 15 minutes, Refresh = 7 days

---

## "Gotchas" & Rules

1. **Password hashing location**: Always in `AuthService`, never in Controller or UsersService
2. **Password limits**: Min 8, Max 72 characters (bcrypt truncates at 72)
3. **Email normalization**: `UsersService.normalizeEmail()` lowercases and trims—always use it
4. **User typing**: Use `typeof users.$inferSelect` for user entity type (Drizzle pattern)
5. **Token storage**: Only SHA-256 hash stored, never raw refresh token
6. **Dual secrets**: Access and refresh tokens use different secrets
7. **Guard bypass**: Use `@Public()` decorator—don't skip guard registration
8. **Rate limiting**: Auth endpoints throttled to 10 req/min—adjust `@Throttle()` per-route if needed
9. **Token cleanup**: Cron runs at midnight—expired/revoked tokens deleted daily
10. **Logout behavior**: Silently succeeds even if token invalid (no error thrown)
11. **Error messages**: Login/register use generic "Invalid credentials" to prevent user enumeration
12. **Request user shape**: After auth, `request.user` = `{ sub: userId, email }`

---

## Dependencies
```json
"@nestjs/jwt": "^11.0.1",
"@nestjs/schedule": "^6.0.1",
"@nestjs/throttler": "^6.5.0",
"bcryptjs": "^3.0.3",
"uuid": "^13.0.0"
```
