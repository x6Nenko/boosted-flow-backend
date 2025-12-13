# User Authentication Feature

## High-Level Purpose
Passport JWT-based authentication with HTTP-only cookie refresh tokens, configurable token lifetimes, conditional refresh token rotation, bcrypt password hashing, and scheduled token cleanup for a NestJS + Drizzle ORM backend.

---

## Architectural Map
```
src/
├── main.ts                     # CORS + cookie-parser middleware
├── config/configuration.ts     # JWT secrets + frontend URL
├── auth/
│   ├── auth.module.ts          # Feature module, configures JwtModule + PassportModule
│   ├── auth.controller.ts      # HTTP endpoints with cookie management
│   ├── auth.service.ts         # Business logic, token generation, password hashing
│   ├── strategies/
│   │   └── jwt.strategy.ts     # Passport JWT strategy for access token validation
│   ├── guards/
│   │   └── jwt-auth.guard.ts   # Global JWT guard (extends AuthGuard('jwt'))
│   ├── decorators/
│   │   ├── public.decorator.ts      # Marks routes as public (bypasses auth)
│   │   └── current-user.decorator.ts # Extracts user from request
│   └── dto/
│       ├── register.dto.ts     # Validation: email, password (8-72 chars)
│       └── login.dto.ts        # Validation: email, password
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
5. `generateTokens()` → creates access token (default 1h) + refresh token (default 30d)
6. Refresh token hashed (SHA-256) and stored in `refresh_tokens` table
7. **Controller sets HTTP-only cookie** with `setRefreshTokenCookie(res, refreshToken)`
8. Response: **Body:** `{ accessToken }`, **Cookie:** `refreshToken=...`

### Login
1. `POST /auth/login` → `LoginDto` validates input
2. Fetch user by email → `bcrypt.compare()` validates password
3. `generateTokens()` → new token pair issued with configured expiration times
4. **Controller sets HTTP-only cookie** with refresh token
5. Response: **Body:** `{ accessToken }`, **Cookie:** `refreshToken=...`

### Token Refresh
1. `POST /auth/refresh` → **Controller extracts** `req.cookies['refreshToken']`
2. Throws `UnauthorizedException` if cookie missing
3. Verify JWT signature with `jwt.refreshSecret`
4. Validate user exists via `UsersService.findById()`
5. Check stored token: hash match, not expired, not revoked
6. **Conditional rotation based on JWT_ROTATION_PERIOD**:
   - If token age > rotation period: revoke old token → issue new pair
   - If token age ≤ rotation period: generate new access token, **reuse** refresh token
7. **Controller sets HTTP-only cookie** (new token if rotated, same token if reused)
8. Response: **Body:** `{ accessToken }`, **Cookie:** `refreshToken=SAME_OR_NEW`

### Logout
1. `POST /auth/logout` → **Controller extracts** `req.cookies['refreshToken']`
2. Marks refresh token as revoked in DB (silently succeeds if missing)
3. **Controller clears cookie** with `clearRefreshTokenCookie(res)`
4. Response: `204 No Content`

### Protected Routes
1. `JwtAuthGuard` (extends `AuthGuard('jwt')`) extracts Bearer token from `Authorization` header
2. `JwtStrategy` validates token with `jwt.secret` → attaches payload to `request.user`
3. Use `@CurrentUser()` decorator to access user in handlers
4. User object contains only `{ userId }` - fetch email/other data from DB when needed

---

## Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Global Guard** | `JwtAuthGuard` registered as `APP_GUARD` in `AppModule` |
| **Passport Strategy** | `JwtStrategy` extends `PassportStrategy(Strategy)` for JWT validation |
| **Public Routes** | `@Public()` decorator + `IS_PUBLIC_KEY` metadata |
| **Custom Param Decorator** | `@CurrentUser()` extracts `request.user` |
| **HTTP-only Cookies** | Refresh tokens via `res.cookie()` with `httpOnly`, `secure`, `sameSite=lax` |
| **Cookie Middleware** | `cookie-parser` in `main.ts` for request cookie parsing |
| **CORS with Credentials** | `credentials: true` + exact `origin` match for cookie support |
| **Rate Limiting** | `@Throttle({ default: { limit: 10, ttl: 60000 } })` per endpoint |
| **Async JWT Config** | `JwtModule.registerAsync()` with `ConfigService` injection |
| **Conditional Token Rotation** | Refresh token rotated only when age exceeds `JWT_ROTATION_PERIOD` |
| **Token Reuse** | Same refresh token returned when rotation period not exceeded |
| **Scheduled Tasks** | `@Cron(EVERY_DAY_AT_MIDNIGHT)` for token cleanup |
| **DTO Validation** | `class-validator` decorators (`@IsEmail`, `@MinLength`, etc.) |
| **Response Passthrough** | `@Res({ passthrough: true })` to set cookies + return JSON |

---

## Public Interface

### AuthController (`/auth`)
```typescript
@Post('register')  register(@Body() dto: RegisterDto, @Res() res): Promise<{ accessToken }>
@Post('login')     login(@Body() dto: LoginDto, @Res() res): Promise<{ accessToken }>
@Post('refresh')   refresh(@Req() req, @Res() res): Promise<{ accessToken }>
@Post('logout')    logout(@Req() req, @Res() res): Promise<void>
// private: setRefreshTokenCookie(), clearRefreshTokenCookie()
```

### AuthService
```typescript
register(email: string, password: string): Promise<TokenPair>
login(email: string, password: string): Promise<TokenPair>
refresh(refreshToken: string): Promise<TokenPair>  // Conditionally rotates based on age
logout(refreshToken: string): Promise<void>
// private: generateTokens(), hashToken(), parseExpiration()
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

**Note:** Controller returns only `{ accessToken }` in body; refresh token set as HTTP-only cookie

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
  refreshSecret: process.env.JWT_REFRESH_SECRET,  // Refresh token signing
  accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '1h',
  refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '30d',
  rotationPeriod: process.env.JWT_ROTATION_PERIOD || '1h'
},
frontend: {
  url: process.env.FRONTEND_URL || 'http://localhost:5173'  // CORS origin
}
```

**Token Lifetimes** (configurable via env vars):  
- Access token: Default = 1 hour (`JWT_ACCESS_EXPIRATION`)  
- Refresh token: Default = 30 days (`JWT_REFRESH_EXPIRATION`)  
- Rotation period: Default = 1 hour (`JWT_ROTATION_PERIOD`)  

**Expiration Format**: Supports `s` (seconds), `m` (minutes), `h` (hours), `d` (days). Examples: `15m`, `7d`, `1h`  
**Cookie Settings**: `httpOnly`, `secure` (prod), `sameSite=lax`, `path=/auth`, `maxAge` matches refresh expiration

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
12. **Request user shape**: After auth, `request.user` = `{ userId }` (email removed from payload)
13. **Cookie middleware**: `cookie-parser` must be registered in `main.ts` before routes
14. **CORS credentials**: `credentials: true` + exact origin match required for cookie transport
15. **Response decorator**: Use `@Res({ passthrough: true })` to return JSON + set cookies
16. **Cookie extraction**: Access via `req.cookies['refreshToken']`, not request body
17. **Refresh endpoint**: No DTO needed—token extracted from cookie automatically
18. **Cookie scope**: Refresh token cookie scoped to `/auth` path only
19. **Secure flag**: Automatically enabled in production (`NODE_ENV=production`)
20. **Frontend requirement**: Must set `withCredentials: true` in HTTP client (Axios/Fetch)
21. **Rotation logic**: Refresh tokens only rotate when age exceeds `JWT_ROTATION_PERIOD`
22. **Token reuse**: Within rotation period, same refresh token returned with new access token
23. **Expiration parsing**: `parseExpiration()` converts time strings (`1h`, `30d`) to milliseconds
24. **Configuration precedence**: Env vars override defaults in `configuration.ts`

---

## Dependencies
```json
"@nestjs/jwt": "^11.0.1",
"@nestjs/passport": "^10.0.3",
"@nestjs/schedule": "^6.0.1",
"@nestjs/throttler": "^6.5.0",
"passport": "^0.7.0",
"passport-jwt": "^4.0.1",
"bcryptjs": "^3.0.3",
"cookie-parser": "^1.4.7",
"uuid": "^13.0.0"
```
