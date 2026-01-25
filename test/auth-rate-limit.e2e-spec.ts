import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DatabaseService } from './../src/database/database.service';
import { TestDatabaseService } from './setup/test-database.service';

// IMPORTANT:
// Rate limiting is disabled in AppModule when NODE_ENV === 'test'.
// This spec intentionally uses a non-test NODE_ENV and loads AppModule lazily.
process.env.NODE_ENV = 'rate-limit-e2e';
process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-e2e-testing-only';
process.env.JWT_ACCESS_EXPIRATION = '1h';
process.env.JWT_REFRESH_EXPIRATION = '30d';
process.env.JWT_ROTATION_PERIOD = '1h';
process.env.JWT_COOKIE_MAX_AGE = '30d';

function loadAppModule(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./../src/app.module').AppModule;
}

describe('Auth Rate Limiting (e2e)', () => {
  let app: INestApplication<App>;
  let testDbService: TestDatabaseService;

  beforeAll(async () => {
    testDbService = new TestDatabaseService();
    await testDbService.setupSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [loadAppModule()],
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

  it('should return 429 after exceeding /auth/login limit', async () => {
    const user = {
      email: 'ratelimit@example.com',
      password: 'Password123!',
    };

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(user)
      .expect(201);

    // /auth/login is annotated with @Throttle({ default: { limit: 10, ttl: 60000 } })
    // Make 10 attempts (401) then the 11th should be rate limited (429).
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: 'WrongPassword!' })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'WrongPassword!' })
      .expect(429);
  });
});
