import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { TestDatabaseService } from './setup/test-database.service';

// Load test env vars before anything else
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-e2e-testing-only';
process.env.JWT_COOKIE_MAX_AGE = '30d';

describe('Health (e2e)', () => {
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

  describe('GET /health', () => {
    it('should return healthy status without authentication', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        info: {
          database: { status: 'up' },
        },
        details: {
          database: { status: 'up' },
        },
      });
    });
  });
});
