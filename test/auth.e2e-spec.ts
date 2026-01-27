import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { TestDatabaseService } from './setup/test-database.service';
import { EmailService } from './../src/email/email.service';
import { users, passwordResetTokens } from '../src/database/schema';

// Load test env vars before anything else
process.env.NODE_ENV = 'test'; // turns rate limiting offf
process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-e2e-testing-only';
process.env.JWT_ACCESS_EXPIRATION = '1h';
process.env.JWT_REFRESH_EXPIRATION = '30d';
process.env.JWT_ROTATION_PERIOD = '1h';
process.env.JWT_COOKIE_MAX_AGE = '30d';

// Helper function to extract cookies from supertest response headers
function getCookies(headers: any): string[] {
  const cookies = headers['set-cookie'];
  if (!cookies) return [];
  return Array.isArray(cookies) ? cookies : [cookies];
}

// Helper function to find refresh token cookie
function getRefreshTokenCookie(headers: any): string | undefined {
  const cookies = getCookies(headers);
  return cookies.find((c: string) => c.startsWith('refreshToken='));
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let testDbService: TestDatabaseService;
  let mockEmailService: { sendPasswordResetEmail: jest.Mock };

  beforeAll(async () => {
    testDbService = new TestDatabaseService();
    await testDbService.setupSchema();

    mockEmailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(testDbService)
      .overrideProvider(EmailService)
      .useValue(mockEmailService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    testDbService.close();
  });

  beforeEach(async () => {
    await testDbService.clearDatabase();
    mockEmailService.sendPasswordResetEmail.mockClear();
  });

  describe('Auth Guard', () => {
    it('should return 401 for protected routes without token', () => {
      return request(app.getHttpServer()).get('/').expect(401);
    });

    it('should return 200 for protected routes with valid token', async () => {
      const user = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const authResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user);

      return request(app.getHttpServer())
        .get('/')
        .set('Authorization', `Bearer ${authResponse.body.accessToken}`)
        .expect(200)
        .expect('Hello World!');
    });
  });

  describe('Register', () => {
    it('should create a new user and return access token with refresh token cookie', async () => {
      const user = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
      expect(response.headers['set-cookie']).toBeDefined();

      // Verify refresh token cookie is set with correct properties
      const refreshCookie = getRefreshTokenCookie(response.headers);
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('Path=/auth');
      expect(refreshCookie).toContain('SameSite=Lax');
    });

    it('should return 409 when email already exists', async () => {
      const user = {
        email: 'existing@example.com',
        password: 'Password123!',
      };

      // First registration succeeds
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      // Second registration with same email fails
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(409);
    });

    it('should return 400 for invalid input', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'not-an-email',
          password: 'short',
        })
        .expect(400);
    });
  });

  describe('Login', () => {
    it('should login existing user and return access token with refresh token cookie', async () => {
      const user = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      // Register first
      await request(app.getHttpServer()).post('/auth/register').send(user);

      // Then login
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(user)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
      expect(response.headers['set-cookie']).toBeDefined();

      const refreshCookie = getRefreshTokenCookie(response.headers);
      expect(refreshCookie).toBeDefined();
    });

    it('should return 401 for wrong password', async () => {
      // Register user
      await request(app.getHttpServer()).post('/auth/register').send({
        email: 'user@example.com',
        password: 'Password123!',
      });

      // Try to login with wrong password
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'WrongPassword!',
        })
        .expect(401);
    });

    it('should return 401 for non-existent email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        })
        .expect(401);
    });

    it('should return 401 for OAuth user attempting password login', async () => {
      // Manually insert OAuth user (no password)
      const now = new Date().toISOString();
      await testDbService.db.insert(users).values({
        id: crypto.randomUUID(),
        email: 'oauth@example.com',
        hashedPassword: null,
        createdAt: now,
        updatedAt: now,
      });

      // Try to login with password - should fail
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'oauth@example.com',
          password: 'Password123!',
        })
        .expect(401);
    });
  });

  describe('Golden Path Flow', () => {
    it('should complete full auth flow: register → login → access → refresh → access → logout', async () => {
      const user = {
        email: 'user@example.com',
        password: 'SecurePass123!',
      };

      // Step 1: Register a new user
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      expect(registerRes.body.accessToken).toBeDefined();
      expect(registerRes.body).not.toHaveProperty('refreshToken');

      // Step 2: Login with the same credentials
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send(user)
        .expect(200);

      expect(loginRes.body.accessToken).toBeDefined();
      expect(loginRes.body).not.toHaveProperty('refreshToken');

      const loginAccessToken = loginRes.body.accessToken;
      const loginRefreshCookie = getRefreshTokenCookie(loginRes.headers);
      expect(loginRefreshCookie).toBeDefined();

      // Step 3: Access a protected route with the login token
      await request(app.getHttpServer())
        .get('/')
        .set('Authorization', `Bearer ${loginAccessToken}`)
        .expect(200);

      // Step 4: Refresh the token (simulating token expiration scenario)
      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', loginRefreshCookie!)
        .expect(200);

      expect(refreshRes.body.accessToken).toBeDefined();
      expect(refreshRes.body).not.toHaveProperty('refreshToken');

      const newAccessToken = refreshRes.body.accessToken;
      const newRefreshCookie = getRefreshTokenCookie(refreshRes.headers);
      expect(newRefreshCookie).toBeDefined();

      // Verify refresh token is reused (rotation period not exceeded)
      expect(newRefreshCookie).toBe(loginRefreshCookie);

      // Step 5: Access protected route with the refreshed token
      await request(app.getHttpServer())
        .get('/')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);

      // Step 6: Old refresh token should still work (not rotated yet)
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', loginRefreshCookie!)
        .expect(200);

      // Step 7: Logout with the current refresh token
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .set('Cookie', loginRefreshCookie!)
        .expect(204);

      // Step 8: After logout, the refresh token should no longer work
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', loginRefreshCookie!)
        .expect(401);
    });
  });

  describe('Refresh', () => {
    it('should return 401 when refreshing with invalid token format', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', 'refreshToken=not-a-valid-jwt-token')
        .expect(401);
    });

    it('should return 401 when no refresh token cookie is provided', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .expect(401);
    });

    it('should return 401 when user no longer exists', async () => {
      // Register and get tokens
      const user = {
        email: 'deleteme@example.com',
        password: 'Password123!',
      };

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      const refreshCookie = getRefreshTokenCookie(registerRes.headers);
      expect(refreshCookie).toBeDefined();

      // Manually delete user from database using SQL
      await testDbService.clearDatabase();

      // Try to refresh - should fail because user no longer exists
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshCookie!)
        .expect(401);
    });

    it('should support multiple refresh tokens per user (multi-device)', async () => {
      const user = {
        email: 'multidevice@example.com',
        password: 'Password123!',
      };

      await request(app.getHttpServer()).post('/auth/register').send(user);

      // Login from two devices
      const device1 = await request(app.getHttpServer())
        .post('/auth/login')
        .send(user)
        .expect(200);

      const device2 = await request(app.getHttpServer())
        .post('/auth/login')
        .send(user)
        .expect(200);

      const device1Cookie = getRefreshTokenCookie(device1.headers);
      const device2Cookie = getRefreshTokenCookie(device2.headers);
      expect(device1Cookie).toBeDefined();
      expect(device2Cookie).toBeDefined();

      // Both tokens should work
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', device1Cookie!)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', device2Cookie!)
        .expect(200);
    });
  });

  describe('Logout', () => {
    it('should revoke refresh token and return 204', async () => {
      const user = {
        email: 'logout@example.com',
        password: 'Password123!',
      };

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      const { accessToken } = registerRes.body;
      const refreshCookie = getRefreshTokenCookie(registerRes.headers);
      expect(refreshCookie).toBeDefined();

      // Logout
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', refreshCookie!)
        .expect(204);

      // Try to use revoked token
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshCookie!)
        .expect(401);
    });

    it('should return 204 even when refresh token cookie is missing', async () => {
      const user = {
        email: 'logout-no-cookie@example.com',
        password: 'Password123!',
      };

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      const { accessToken } = registerRes.body;

      // Logout without cookie should succeed (idempotent)
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });
  });

  describe('Forgot Password', () => {
    it('should return 200 and send email when user exists', async () => {
      const user = {
        email: 'forgot@example.com',
        password: 'Password123!',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.message).toBeDefined();
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        user.email,
        expect.stringContaining('/auth/reset-password?token='),
      );
    });

    it('should return 200 but not send email when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.message).toBeDefined();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should return 200 but not send email for OAuth-only user', async () => {
      // Create OAuth user (no password)
      const now = new Date().toISOString();
      await testDbService.db.insert(users).values({
        id: crypto.randomUUID(),
        email: 'oauth-only@example.com',
        hashedPassword: null,
        createdAt: now,
        updatedAt: now,
      });

      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'oauth-only@example.com' })
        .expect(200);

      expect(response.body.message).toBeDefined();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  describe('Reset Password', () => {
    it('should reset password with valid token', async () => {
      const user = {
        email: 'reset@example.com',
        password: 'OldPassword123!',
      };

      // Register user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      // Request password reset
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      // Extract token from mock call
      const resetUrl = mockEmailService.sendPasswordResetEmail.mock.calls[0][1];
      const token = new URL(resetUrl).searchParams.get('token');

      // Reset password
      const newPassword = 'NewPassword456!';
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, password: newPassword })
        .expect(200);

      // Login with new password should work
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: newPassword })
        .expect(200);

      // Login with old password should fail
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(401);
    });

    it('should return 400 for invalid token', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: crypto.randomUUID(), password: 'NewPassword123!' })
        .expect(400);
    });

    it('should return 400 for expired token', async () => {
      const user = {
        email: 'expired-reset@example.com',
        password: 'Password123!',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      // Get user ID
      const dbUser = await testDbService.db.query.users.findFirst();

      // Insert expired token directly
      const expiredToken = crypto.randomUUID();
      const hashedToken = await hashToken(expiredToken);
      await testDbService.db.insert(passwordResetTokens).values({
        id: crypto.randomUUID(),
        userId: dbUser!.id,
        hashedToken,
        expiresAt: new Date(Date.now() - 1000).toISOString(), // expired
        createdAt: new Date().toISOString(),
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: expiredToken, password: 'NewPassword123!' })
        .expect(400);
    });

    it('should return 400 for already used token', async () => {
      const user = {
        email: 'used-token@example.com',
        password: 'Password123!',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      const resetUrl = mockEmailService.sendPasswordResetEmail.mock.calls[0][1];
      const token = new URL(resetUrl).searchParams.get('token');

      // Use token first time
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, password: 'NewPassword123!' })
        .expect(200);

      // Try to use same token again
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, password: 'AnotherPassword123!' })
        .expect(400);
    });

    it('should invalidate all refresh tokens after password reset', async () => {
      const user = {
        email: 'invalidate-sessions@example.com',
        password: 'Password123!',
      };

      // Register and get refresh token
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      const refreshCookie = getRefreshTokenCookie(registerRes.headers);
      expect(refreshCookie).toBeDefined();

      // Request password reset
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      const resetUrl = mockEmailService.sendPasswordResetEmail.mock.calls[0][1];
      const token = new URL(resetUrl).searchParams.get('token');

      // Reset password
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, password: 'NewPassword123!' })
        .expect(200);

      // Old refresh token should no longer work
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshCookie!)
        .expect(401);
    });

    it('should return 400 for password validation errors', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: crypto.randomUUID(), password: 'short' })
        .expect(400);
    });
  });
});

// Helper function to hash token (same as auth service)
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
