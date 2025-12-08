import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { TestDatabaseService } from './setup/test-database.service';

// Load test env vars before anything else
process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-e2e-testing-only';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let testDbService: TestDatabaseService;

  beforeAll(async () => {
    testDbService = new TestDatabaseService();
    await testDbService.setupSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(testDbService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    testDbService.close();
  });

  beforeEach(async () => {
    await testDbService.clearDatabase();
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
    it('should create a new user and return token pair', async () => {
      const user = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
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
    it('should login existing user and return token pair', async () => {
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
      expect(response.body).toHaveProperty('refreshToken');
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
      expect(registerRes.body.refreshToken).toBeDefined();

      // Step 2: Login with the same credentials
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send(user)
        .expect(200);

      expect(loginRes.body.accessToken).toBeDefined();
      expect(loginRes.body.refreshToken).toBeDefined();

      const loginAccessToken = loginRes.body.accessToken;
      const loginRefreshToken = loginRes.body.refreshToken;

      // Step 3: Access a protected route with the login token
      await request(app.getHttpServer())
        .get('/')
        .set('Authorization', `Bearer ${loginAccessToken}`)
        .expect(200);

      // Step 4: Refresh the token (simulating token expiration scenario)
      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRefreshToken })
        .expect(200);

      expect(refreshRes.body.accessToken).toBeDefined();
      expect(refreshRes.body.refreshToken).toBeDefined();

      const newAccessToken = refreshRes.body.accessToken;
      const newRefreshToken = refreshRes.body.refreshToken;

      // Verify refresh token rotation: new refresh token should be different
      expect(newRefreshToken).not.toBe(loginRefreshToken);

      // Step 5: Access protected route with the refreshed token
      await request(app.getHttpServer())
        .get('/')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);

      // Step 6: Old refresh token should be revoked (token rotation)
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRefreshToken })
        .expect(401);

      // Step 7: Logout with the current refresh token
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .send({ refreshToken: newRefreshToken })
        .expect(204);

      // Step 8: After logout, the refresh token should no longer work
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: newRefreshToken })
        .expect(401);
    });
  });

  describe('Refresh', () => {
    it('should return 401 when refreshing with invalid token format', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'not-a-valid-jwt-token' })
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

      const refreshToken = registerRes.body.refreshToken;

      // Manually delete user from database using SQL
      await testDbService.clearDatabase();

      // Try to refresh - should fail because user no longer exists
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
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

      // Both tokens should work
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: device1.body.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: device2.body.refreshToken })
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

      const { accessToken, refreshToken } = registerRes.body;

      // Logout
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(204);

      // Try to use revoked token
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('should return 400 when refresh token is missing', async () => {
      const user = {
        email: 'logout@example.com',
        password: 'Password123!',
      };

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      const { accessToken } = registerRes.body;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });
  });
});
