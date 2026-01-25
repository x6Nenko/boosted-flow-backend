import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { TestDatabaseService } from './setup/test-database.service';
import { activities, timeEntries } from '../src/database/schema';

// Load test env vars before anything else
process.env.NODE_ENV = 'test'; // turns rate limiting off
process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-e2e-testing-only';
process.env.JWT_COOKIE_MAX_AGE = '30d';

describe('Activities (e2e)', () => {
  let app: INestApplication<App>;
  let testDbService: TestDatabaseService;
  let accessToken: string;

  // Helper to register and login
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

  describe('POST /activities', () => {
    it('should create a new activity', async () => {
      const response = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Learn TypeScript' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.name).toBe('Learn TypeScript');
      expect(response.body.archivedAt).toBeNull();
    });

    it('should return 400 for missing name', async () => {
      await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .post('/activities')
        .send({ name: 'Learn TypeScript' })
        .expect(401);
    });
  });

  describe('GET /activities', () => {
    it('should return empty array when no activities exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return all non-archived activities', async () => {
      // Create activities
      await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Activity 1' });

      await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Activity 2' });

      const response = await request(app.getHttpServer())
        .get('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('should exclude archived activities by default', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Activity to archive' });

      await request(app.getHttpServer())
        .post(`/activities/${createResponse.body.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`);

      const response = await request(app.getHttpServer())
        .get('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it('should include archived activities when requested', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Activity to archive' });

      await request(app.getHttpServer())
        .post(`/activities/${createResponse.body.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`);

      const response = await request(app.getHttpServer())
        .get('/activities')
        .query({ includeArchived: 'true' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].archivedAt).not.toBeNull();
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).get('/activities').expect(401);
    });
  });

  describe('GET /activities/:id', () => {
    it('should return a specific activity', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'My Activity' });

      const response = await request(app.getHttpServer())
        .get(`/activities/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(createResponse.body.id);
      expect(response.body.name).toBe('My Activity');
    });

    it('should return 404 for non-existent activity', async () => {
      await request(app.getHttpServer())
        .get('/activities/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get('/activities/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });
  });

  describe('PATCH /activities/:id', () => {
    it('should update activity name', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Original Name' });

      const response = await request(app.getHttpServer())
        .patch(`/activities/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.name).toBe('Updated Name');
    });

    it('should return 404 for non-existent activity', async () => {
      await request(app.getHttpServer())
        .patch('/activities/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'New Name' })
        .expect(404);
    });

  });

  describe('POST /activities/:id/archive', () => {
    it('should archive an activity', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Activity to archive' });

      const response = await request(app.getHttpServer())
        .post(`/activities/${createResponse.body.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(response.body.archivedAt).not.toBeNull();
    });

    it('should return 409 when archiving already archived activity', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Activity to archive' });

      await request(app.getHttpServer())
        .post(`/activities/${createResponse.body.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`);

      await request(app.getHttpServer())
        .post(`/activities/${createResponse.body.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);
    });

    it('should return 404 for non-existent activity', async () => {
      await request(app.getHttpServer())
        .post('/activities/00000000-0000-0000-0000-000000000000/archive')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('POST /activities/:id/unarchive', () => {
    it('should unarchive an activity', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Activity' });

      await request(app.getHttpServer())
        .post(`/activities/${createResponse.body.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`);

      const response = await request(app.getHttpServer())
        .post(`/activities/${createResponse.body.id}/unarchive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(response.body.archivedAt).toBeNull();
    });

    it('should return 409 when unarchiving non-archived activity', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Activity' });

      await request(app.getHttpServer())
        .post(`/activities/${createResponse.body.id}/unarchive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);
    });
  });

  describe('Activity ownership isolation', () => {
    it('should not allow access to another user\'s activity', async () => {
      // Create activity for first user
      const createResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'User 1 Activity' });

      // Register second user
      const user2 = {
        email: 'user2@example.com',
        password: 'Password456!',
      };
      const user2Response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user2)
        .expect(201);

      const user2Token = user2Response.body.accessToken;

      // Second user should not see first user's activity
      await request(app.getHttpServer())
        .get(`/activities/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(404);
    });
  });

  describe('Time entry activity linking', () => {
    it('should start time entry with activity', async () => {
      const activityResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'My Activity' });

      const entryResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          description: 'Working on activity',
          activityId: activityResponse.body.id,
        })
        .expect(201);

      expect(entryResponse.body.activityId).toBe(activityResponse.body.id);
    });

    it('should return 404 when starting with non-existent activity', async () => {
      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          description: 'Working',
          activityId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(404);
    });
  });

  describe('DELETE /activities/:id', () => {
    it('should delete an activity', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'To Delete' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/activities/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify it's gone
      await request(app.getHttpServer())
        .get(`/activities/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should return 404 when deleting non-existent activity', async () => {
      await request(app.getHttpServer())
        .delete('/activities/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should cascade delete time entries when activity is deleted', async () => {
      // Create activity
      const activityResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Activity' })
        .expect(201);

      // Create time entry linked to activity
      const entryResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId: activityResponse.body.id })
        .expect(201);

      // Delete activity
      await request(app.getHttpServer())
        .delete(`/activities/${activityResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify time entry is also deleted
      const entries = await testDbService.db.query.timeEntries.findMany({
        where: eq(timeEntries.id, entryResponse.body.id),
      });
      expect(entries).toHaveLength(0);
    });

    it('should not allow deleting another user\'s activity', async () => {
      // Create activity for first user
      const createResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'User 1 Activity' })
        .expect(201);

      // Register second user
      const user2 = {
        email: 'user2-delete@example.com',
        password: 'Password456!',
      };
      const user2Response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user2)
        .expect(201);

      const user2Token = user2Response.body.accessToken;

      // Second user should not be able to delete first user's activity
      await request(app.getHttpServer())
        .delete(`/activities/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(404);

      // Verify activity still exists for first user
      await request(app.getHttpServer())
        .get(`/activities/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });
});
