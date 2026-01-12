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

describe('Activity Tasks (e2e)', () => {
  let app: INestApplication<App>;
  let testDbService: TestDatabaseService;
  let accessToken: string;
  let activityId: string;

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

    const activityResponse = await request(app.getHttpServer())
      .post('/activities')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Learn TypeScript' })
      .expect(201);

    activityId = activityResponse.body.id;
  });

  describe('POST /activities/:activityId/tasks', () => {
    it('should create a new task', async () => {
      const response = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Complete chapter 1' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Complete chapter 1');
      expect(response.body.activityId).toBe(activityId);
      expect(response.body.archivedAt).toBeNull();
    });

    it('should return 404 for non-existent activity', async () => {
      await request(app.getHttpServer())
        .post('/activities/00000000-0000-0000-0000-000000000000/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Task' })
        .expect(404);
    });
  });

  describe('GET /activities/:activityId/tasks', () => {
    it('should return all non-archived tasks for activity', async () => {
      await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Task 1' });

      await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Task 2' });

      const response = await request(app.getHttpServer())
        .get(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('should exclude archived tasks by default', async () => {
      const taskResponse = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Task to archive' });

      await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks/${taskResponse.body.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`);

      const response = await request(app.getHttpServer())
        .get(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(0);
    });
  });

  describe('PATCH /activities/:activityId/tasks/:id', () => {
    it('should update task name', async () => {
      const createResponse = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Original name' });

      const response = await request(app.getHttpServer())
        .patch(`/activities/${activityId}/tasks/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated name' })
        .expect(200);

      expect(response.body.name).toBe('Updated name');
    });
  });

  describe('POST /activities/:activityId/tasks/:id/archive', () => {
    it('should archive a task', async () => {
      const createResponse = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Task to archive' });

      const response = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks/${createResponse.body.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(response.body.archivedAt).not.toBeNull();
    });

    it('should return 409 when archiving already archived task', async () => {
      const createResponse = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Task' });

      await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks/${createResponse.body.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`);

      await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks/${createResponse.body.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);
    });
  });

  describe('POST /activities/:activityId/tasks/:id/unarchive', () => {
    it('should unarchive a task', async () => {
      const createResponse = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Task' });

      await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks/${createResponse.body.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`);

      const response = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks/${createResponse.body.id}/unarchive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(response.body.archivedAt).toBeNull();
    });
  });

  describe('DELETE /activities/:activityId/tasks/:id', () => {
    it('should delete a task', async () => {
      const createResponse = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Task to delete' });

      await request(app.getHttpServer())
        .delete(`/activities/${activityId}/tasks/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/activities/${activityId}/tasks/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
