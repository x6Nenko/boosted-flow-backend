# User Authentication Feature

## High-Level Purpose
Passport JWT-based authentication with HTTP-only cookie refresh tokens, configurable token lifetimes, conditional refresh token rotation, bcrypt password hashing, OAuth support (Google, extensible to GitHub etc.), password reset via email, and scheduled token cleanup for a NestJS + Drizzle ORM backend.

---

## Architectural Map
```
src/
├── main.ts                     # CORS + cookie-parser middleware
├── config/configuration.ts     # JWT secrets + frontend URL + Google OAuth config + Plunk
├── utils/
│   └── parse-expiration.ts     # Shared utility for parsing time strings to milliseconds
├── auth/
│   ├── auth.module.ts          # Feature module, configures JwtModule + PassportModule
│   ├── auth.controller.ts      # HTTP endpoints with cookie management
│   ├── auth.service.ts         # Business logic, token generation, password hashing
│   ├── strategies/
│   │   ├── jwt.strategy.ts     # Passport JWT strategy for access token validation
│   │   └── google.strategy.ts  # Passport Google OAuth strategy
│   ├── guards/
│   │   ├── jwt-auth.guard.ts   # Global JWT guard (extends AuthGuard('jwt'))
│   │   ├── google-auth.guard.ts # Google OAuth guard (extends AuthGuard('google'))
│   │   └── turnstile.guard.ts  # Cloudflare Turnstile CAPTCHA verification
│   ├── decorators/
│   │   ├── public.decorator.ts      # Marks routes as public (bypasses auth)
│   │   └── current-user.decorator.ts # Extracts user from request
│   └── dto/
│       ├── register.dto.ts     # Validation: email, password (8-72 chars)
│       ├── login.dto.ts        # Validation: email, password
│       ├── exchange-code.dto.ts # Validation: code
│       ├── forgot-password.dto.ts # Validation: email
│       └── reset-password.dto.ts  # Validation: token, password
├── email/
│   ├── email.module.ts         # Email service module
│   └── email.service.ts        # Plunk email sending service
├── users/
│   ├── users.module.ts         # Exports UsersService
│   └── users.service.ts        # User CRUD operations
├── tasks/
│   ├── tasks.module.ts         # Scheduled tasks module
│   └── tasks.service.ts        # Token cleanup cron job
└── database/schema/
    ├── users.ts                # User table definition
    ├── oauth-accounts.ts       # OAuth provider accounts table
    ├── auth-codes.ts           # One-time auth codes for OAuth flow
    ├── refresh-tokens.ts       # Refresh token table definition
    ├── password-reset-tokens.ts # Password reset token table definition
    └── relations.ts            # Drizzle ORM relations
```

---

## Data Flow

### Registration
1. `POST /auth/register` → `TurnstileGuard` validates CAPTCHA token → `RegisterDto` validates email + password (8-72 chars)
2. `AuthService.register()` → checks email uniqueness via `UsersService.findByEmail()`
3. Password hashed with `bcrypt.hash(password, 12)` (cost factor 12)
4. `UsersService.create()` → inserts user with UUID, normalized email, timestamps
5. `generateTokens()` → creates access token (default 1h) + refresh token (default 30d)
6. Refresh token hashed (SHA-256) and stored in `refresh_tokens` table
7. **Controller sets HTTP-only cookie** with `setRefreshTokenCookie(res, refreshToken)`
8. Response: **Body:** `{ accessToken }`, **Cookie:** `refreshToken=...`

### Login
1. `POST /auth/login` → `TurnstileGuard` validates CAPTCHA token → `LoginDto` validates input
2. Fetch user by email → `bcrypt.compare()` validates password
3. `generateTokens()` → new token pair issued with configured expiration times
4. **Controller sets HTTP-only cookie** with refresh token
5. Response: **Body:** `{ accessToken }`, **Cookie:** `refreshToken=...`

### OAuth Login (Google)
1. `GET /auth/google` → `GoogleAuthGuard` redirects to Google consent screen with CSRF state token
2. User authenticates with Google and grants permission
3. `GET /auth/google/callback` → Google redirects back with auth code and state
4. `GoogleStrategy.validate()` validates:
   - Email exists in profile
   - Email is verified by Google (`email_verified: true`)
   - Extracts `profile.id` (provider user ID) and verified email
5. `AuthService.oauthLogin()` → `UsersService.findOrCreateOAuthUser()`:
   - Looks up `oauth_accounts` by provider + providerUserId
   - If found: returns linked user
   - If not found: checks if verified email exists, links OAuth account or creates new user
6. `createAuthCode()` → generates short-lived one-time code (5 min expiry), stores in `auth_codes`
7. Redirect to frontend: `${FRONTEND_URL}/auth/callback?code=...`
8. Frontend calls `POST /auth/exchange` with code
9. `exchangeAuthCode()` validates code, deletes it, returns tokens
10. Response: **Body:** `{ accessToken }`, **Cookie:** `refreshToken=...`

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

### Forgot Password
1. `POST /auth/forgot-password` → `TurnstileGuard` validates CAPTCHA token → `ForgotPasswordDto` validates email
2. `AuthService.createPasswordResetToken()` → looks up user by email
3. Returns `null` if user not found or is OAuth-only (no password)
4. Generates UUID token, hashes with SHA-256, stores in `password_reset_tokens` table
5. Invalidates any existing reset tokens for the user
6. `EmailService.sendPasswordResetEmail()` → sends email via Plunk API
7. Response: **Always** `{ message: "If an account exists..." }` (prevents enumeration)

### Reset Password
1. `POST /auth/reset-password` → `TurnstileGuard` validates CAPTCHA token → `ResetPasswordDto` validates token (UUID) + password (8-72 chars)
2. `AuthService.resetPassword()` → hashes token, looks up in DB
3. Validates token exists, not used, not expired (1 hour TTL)
4. Marks token as used (one-time use)
5. Hashes new password with bcrypt → `UsersService.updatePassword()`
6. **Revokes all refresh tokens** for security (forces re-login on all devices)
7. Response: `{ message: "Password has been reset successfully" }`

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
| **Google OAuth Strategy** | `GoogleStrategy` extends `PassportStrategy(Strategy, 'google')` with CSRF protection (`state: true`) |
| **Email Verification** | Google OAuth validates `email_verified` before account creation/linking |
| **Public Routes** | `@Public()` decorator + `IS_PUBLIC_KEY` metadata |
| **Custom Param Decorator** | `@CurrentUser()` extracts `request.user` |
| **HTTP-only Cookies** | Refresh tokens via `res.cookie()` with `httpOnly`, `secure`, `sameSite=lax` |
| **Cookie Middleware** | `cookie-parser` in `main.ts` for request cookie parsing |
| **Session Middleware** | `express-session` in `main.ts` for OAuth state storage |
| **CORS with Credentials** | `credentials: true` + exact `origin` match for cookie support |
| **Rate Limiting** | `@Throttle({ default: { limit: 10, ttl: 60000 } })` per endpoint |
| **Turnstile CAPTCHA** | `TurnstileGuard` on register, login, forgot-password, reset-password; validates via Cloudflare API |
| **Async JWT Config** | `JwtModule.registerAsync()` with `ConfigService` injection |
| **Conditional Token Rotation** | Refresh token rotated only when age exceeds `JWT_ROTATION_PERIOD` |
| **Token Reuse** | Same refresh token returned when rotation period not exceeded |
| **Scheduled Tasks** | `@Cron(EVERY_DAY_AT_MIDNIGHT)` for token cleanup |
| **DTO Validation** | `class-validator` decorators (`@IsEmail`, `@MinLength`, etc.) |
| **Response Passthrough** | `@Res({ passthrough: true })` to set cookies + return JSON |
| **OAuth Account Linking** | `oauth_accounts` table links provider IDs to users |
| **Auth Code Exchange** | One-time codes prevent token exposure in URLs |
| **Email Service** | Plunk API for transactional emails (password reset) |
| **Anti-Enumeration** | Forgot password always returns success, regardless of user existence |
| **Session Invalidation** | Password reset revokes all refresh tokens |

---

## Public Interface

### AuthController (`/auth`)
```typescript
@Post('register')  register(@Body() dto: RegisterDto, @Res() res): Promise<{ accessToken }>
@Post('login')     login(@Body() dto: LoginDto, @Res() res): Promise<{ accessToken }>
@Post('refresh')   refresh(@Req() req, @Res() res): Promise<{ accessToken }>
@Post('logout')    logout(@Req() req, @Res() res): Promise<void>
@Get('google')     googleAuth(): void  // Redirects to Google
@Get('google/callback')  googleCallback(@Req() req, @Res() res): void  // Redirects to frontend with code
@Post('exchange')  exchangeCode(@Body() dto: ExchangeCodeDto, @Res() res): Promise<{ accessToken }>
@Post('forgot-password')  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message }>
@Post('reset-password')   resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message }>
// private: setRefreshTokenCookie(), clearRefreshTokenCookie()
```

### AuthService
```typescript
register(email: string, password: string): Promise<TokenPair>
login(email: string, password: string): Promise<TokenPair>
oauthLogin(provider: string, providerUserId: string, email: string): Promise<string>  // Returns auth code
exchangeAuthCode(code: string): Promise<TokenPair>
refresh(refreshToken: string): Promise<TokenPair>  // Conditionally rotates based on age
logout(refreshToken: string): Promise<void>
createPasswordResetToken(email: string): Promise<string | null>  // Returns null if user not found
resetPassword(token: string, newPassword: string): Promise<void>
// private: generateTokens(), createAuthCode(), hashToken()
```

### UsersService
```typescript
create(email: string, hashedPassword: string): Promise<User>
findOrCreateOAuthUser(provider: string, providerUserId: string, email: string): Promise<User>
findByEmail(email: string): Promise<User | undefined>
findById(id: string): Promise<User | undefined>
updatePassword(userId: string, hashedPassword: string): Promise<void>
// private: normalizeEmail()
```

### EmailService
```typescript
sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>
// private: send()
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
| hashedPassword | TEXT | bcrypt hash (nullable for OAuth users) |
| createdAt | TEXT | ISO string |
| updatedAt | TEXT | ISO string |

### `oauth_accounts`
| Column | Type | Notes |
|--------|------|-------|
| provider | TEXT PK | 'google', 'github', etc. |
| providerUserId | TEXT PK | Provider's user ID |
| userId | TEXT FK | References `users.id` |
| createdAt | TEXT | ISO string |

### `auth_codes`
| Column | Type | Notes |
|--------|------|-------|
| code | TEXT PK | UUID, one-time use |
| userId | TEXT FK | References `users.id` |
| expiresAt | TEXT | ISO string (5 min TTL) |
| createdAt | TEXT | ISO string |

### `refresh_tokens`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID (matches JWT `jti`) |
| userId | TEXT FK | References `users.id` |
| hashedToken | TEXT | SHA-256 hex hash |
| expiresAt | TEXT | ISO string |
| revoked | INTEGER | Boolean (0/1) |
| createdAt | TEXT | ISO string |

### `password_reset_tokens`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| userId | TEXT FK | References `users.id` |
| hashedToken | TEXT | SHA-256 hex hash |
| expiresAt | TEXT | ISO string (1 hour TTL) |
| used | INTEGER | Boolean (0/1) |
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
  rotationPeriod: process.env.JWT_ROTATION_PERIOD || '1h',
  cookieMaxAge: process.env.JWT_COOKIE_MAX_AGE || '30d'  // Parsed to ms via parseExpiration()
},
frontend: {
  url: process.env.FRONTEND_URL || 'http://localhost:5173'  // CORS origin + OAuth redirect
},
  session: {
    secret: process.env.SESSION_SECRET
  },
google: {
  clientId: process.env.GOOGLE_CLIENT_ID,      // Google OAuth client ID
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,  // Google OAuth client secret
  callbackUrl: process.env.GOOGLE_CALLBACK_URL  // e.g., http://localhost:3000/auth/google/callback
},
plunk: {
  secretKey: process.env.PLUNK_SECRET_KEY  // Plunk API secret key for transactional emails
},
turnstile: {
  secretKey: process.env.TURNSTILE_SECRET_KEY  // Cloudflare Turnstile CAPTCHA secret key
}
```

**Token Lifetimes** (configurable via env vars):  
- Access token: Default = 1 hour (`JWT_ACCESS_EXPIRATION`)  
- Refresh token: Default = 30 days (`JWT_REFRESH_EXPIRATION`)  
- Rotation period: Default = 1 hour (`JWT_ROTATION_PERIOD`)  
- Cookie max age: Default = 30 days (`JWT_COOKIE_MAX_AGE`) - parsed to milliseconds  
- Password reset token: Fixed 1 hour TTL (hardcoded)

**Expiration Format**: Supports `s` (seconds), `m` (minutes), `h` (hours), `d` (days). Examples: `15m`, `7d`, `1h`  
**Cookie Settings**: `httpOnly`, `secure` (prod), `sameSite=lax`, `path=/auth`, `maxAge` parsed from time string

**Google OAuth Setup**:  
1. Create project in [Google Cloud Console](https://console.cloud.google.com/)  
2. Enable Google+ API and create OAuth 2.0 credentials  
3. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`  
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` in `.env`
5. Set `SESSION_SECRET` in `.env` (used by `express-session` for OAuth state storage)

**Plunk Email Setup**:
1. Create account at [Plunk](https://useplunk.com/)
2. Get secret key from dashboard (starts with `sk_`)
3. Set `PLUNK_SECRET_KEY` in `.env`

**Cloudflare Turnstile Setup**:
1. Add site in [Cloudflare Turnstile dashboard](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Get secret key from dashboard
3. Set `TURNSTILE_SECRET_KEY` in `.env`
4. For local development, use always-pass secret key `1x0000000000000000000000000000000AA`

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
25. **OAuth users**: Have `hashedPassword = null`, cannot use password login
26. **OAuth identification**: Use `profile.id` (provider's user ID), not email, to identify returning users
27. **OAuth account linking**: Same email links to existing user; `oauth_accounts` tracks providers
28. **Auth code exchange**: OAuth redirects use one-time codes (5 min TTL), not tokens in URL
29. **Adding OAuth providers**: Create strategy + guard, reuse `oauthLogin()` with provider name
30. **OAuth CSRF protection**: `state: true` in strategy options prevents login CSRF attacks
31. **Email verification requirement**: Only link accounts if provider confirms email is verified
32. **Forgot password anti-enumeration**: Always returns success message, even if user doesn't exist
33. **Password reset invalidation**: All refresh tokens revoked after password reset (security)
34. **OAuth users cannot reset password**: `createPasswordResetToken()` returns `null` for OAuth-only users
35. **Password reset token one-time use**: Token marked as `used` after successful reset
36. **Email failures silent**: Forgot password doesn't fail if email sending fails (logged only)
37. **Turnstile CAPTCHA**: Guard runs before validation pipe; reads `turnstileToken` from raw `request.body`
38. **Turnstile protected endpoints**: register, login, forgot-password, reset-password
39. **Turnstile dev testing**: Use Cloudflare's always-pass site key `1x00000000000000000000AA` with secret `1x0000000000000000000000000000000AA`

---

## Dependencies
```json
"@nestjs/jwt": "^11.0.1",
"@nestjs/passport": "^10.0.3",
"@nestjs/schedule": "^6.0.1",
"@nestjs/throttler": "^6.5.0",
"passport": "^0.7.0",
"passport-jwt": "^4.0.1",
"passport-google-oauth20": "^2.0.0",
"bcryptjs": "^3.0.3",
"cookie-parser": "^1.4.7",
"uuid": "^13.0.0"
```
