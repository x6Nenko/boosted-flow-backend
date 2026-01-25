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

describe('Tags (e2e)', () => {
  let app: INestApplication<App>;
  let testDbService: TestDatabaseService;
  let accessToken: string;

  const authenticateUser = async () => {
    const user = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(user)
      .expect(201);

    return response.body.accessToken;
  };

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
    accessToken = await authenticateUser();
  });

  describe('GET /tags', () => {
    it('should return empty array when no tags exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return all user tags', async () => {
      await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['urgent', 'review'] });

      const response = await request(app.getHttpServer())
        .get('/tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });
  });

  describe('POST /tags/get-or-create', () => {
    it('should create new tags', async () => {
      const response = await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['urgent', 'review'] })
        .expect(201);

      expect(response.body).toHaveLength(2);
      expect(response.body.map((t: { name: string }) => t.name).sort()).toEqual([
        'review',
        'urgent',
      ]);
    });

    it('should return existing tags without creating duplicates', async () => {
      // Create initial tags
      const first = await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['urgent'] })
        .expect(201);

      // Get or create with mix of existing and new
      const second = await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['urgent', 'review'] })
        .expect(201);

      expect(second.body).toHaveLength(2);

      // Verify no duplicates created
      const all = await request(app.getHttpServer())
        .get('/tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(all.body).toHaveLength(2);
      expect(first.body[0].id).toBe(
        second.body.find((t: { name: string }) => t.name === 'urgent').id,
      );
    });

    it('should normalize tag names (lowercase, trim)', async () => {
      const response = await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['  URGENT  ', 'Review'] })
        .expect(201);

      expect(response.body.map((t: { name: string }) => t.name).sort()).toEqual([
        'review',
        'urgent',
      ]);
    });

    it('should return 400 for more than 3 tags', async () => {
      await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['a', 'b', 'c', 'd'] })
        .expect(400);
    });
  });

  describe('DELETE /tags/:id', () => {
    it('should delete a tag', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['urgent'] });

      const tagId = createResponse.body[0].id;

      await request(app.getHttpServer())
        .delete(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const all = await request(app.getHttpServer())
        .get('/tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(all.body).toHaveLength(0);
    });

    it('should return 404 for non-existent tag', async () => {
      await request(app.getHttpServer())
        .delete('/tags/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
