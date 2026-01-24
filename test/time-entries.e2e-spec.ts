import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { TestDatabaseService } from './setup/test-database.service';
import { timeEntries } from '../src/database/schema';

// Load test env vars before anything else
process.env.NODE_ENV = 'test'; // turns rate limiting offf
process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-e2e-testing-only';

describe('Time Entries (e2e)', () => {
  let app: INestApplication<App>;
  let testDbService: TestDatabaseService;
  let accessToken: string;
  let activityId: string;

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

    const activityResponse = await request(app.getHttpServer())
      .post('/activities')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Default Activity' })
      .expect(201);

    activityId = activityResponse.body.id;
  });

  describe('POST /time-entries/start', () => {
    it('should start a new time entry without description', async () => {
      const response = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('startedAt');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body.activityId).toBe(activityId);
      expect(response.body.description).toBeNull();
      expect(response.body.stoppedAt).toBeNull();
    });

    it('should start a new time entry with description', async () => {
      const description = 'Working on feature X';

      const response = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description })
        .expect(201);

      expect(response.body.description).toBe(description);
      expect(response.body.stoppedAt).toBeNull();
    });

    it('should return 409 when trying to start while active entry exists', async () => {
      // Start first entry
      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'First entry' })
        .expect(201);

      // Try to start second entry
      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Second entry' })
        .expect(409);
    });

    it('should return 400 for description exceeding 500 characters', async () => {
      const longDescription = 'a'.repeat(501);

      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: longDescription })
        .expect(400);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .post('/time-entries/start')
        .send({})
        .expect(401);
    });
  });

  describe('POST /time-entries/stop', () => {
    it('should stop an active time entry', async () => {
      // Start entry
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Task to stop' })
        .expect(201);

      const entryId = startResponse.body.id;

      // Stop entry
      const stopResponse = await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: entryId })
        .expect(201);

      expect(stopResponse.body.id).toBe(entryId);
      expect(stopResponse.body.stoppedAt).not.toBeNull();
      expect(stopResponse.body.rating).toBeNull();
      expect(stopResponse.body.comment).toBeNull();
      expect(new Date(stopResponse.body.stoppedAt).getTime()).toBeGreaterThan(
        new Date(stopResponse.body.startedAt).getTime(),
      );
    });

    it('should stop with null rating and comment', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      const stopResponse = await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      expect(stopResponse.body.rating).toBeNull();
      expect(stopResponse.body.comment).toBeNull();
      expect(stopResponse.body.distractionCount).toBe(0);
    });

    it('should return 404 when stopping non-existent entry', async () => {
      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });
    it('should return 409 when stopping already stopped entry', async () => {
      // Start and stop entry
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Task' })
        .expect(201);

      const entryId = startResponse.body.id;

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: entryId })
        .expect(201);

      // Try to stop again
      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: entryId })
        .expect(409);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: 'not-a-uuid' })
        .expect(400);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .send({ id: '00000000-0000-0000-0000-000000000000' })
        .expect(401);
    });

    it('should stop with distraction count', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      const stopResponse = await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id, distractionCount: 3 })
        .expect(201);

      expect(stopResponse.body.distractionCount).toBe(3);
      expect(stopResponse.body.stoppedAt).not.toBeNull();
    });

    it('should stop with zero distraction count', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      const stopResponse = await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id, distractionCount: 0 })
        .expect(201);

      expect(stopResponse.body.distractionCount).toBe(0);
    });

    it('should return 400 for negative distraction count', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id, distractionCount: -1 })
        .expect(400);
    });
  });

  describe('PATCH /time-entries/:id', () => {
    it('should update rating and comment after stopping', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      const updateResponse = await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 4, comment: 'Great session!' })
        .expect(200);

      expect(updateResponse.body.rating).toBe(4);
      expect(updateResponse.body.comment).toBe('Great session!');
    });

    it('should update rating and comment within 1 week', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      const updateResponse = await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 5, comment: 'Updated comment' })
        .expect(200);

      expect(updateResponse.body.rating).toBe(5);
      expect(updateResponse.body.comment).toBe('Updated comment');
    });

    it('should update only rating', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ comment: 'Original comment' })
        .expect(200);

      const updateResponse = await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 3 })
        .expect(200);

      expect(updateResponse.body.rating).toBe(3);
      expect(updateResponse.body.comment).toBe('Original comment');
    });

    it('should return 404 for non-existent entry', async () => {
      await request(app.getHttpServer())
        .patch('/time-entries/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 5 })
        .expect(404);
    });

    it('should return 409 when trying to update an active entry', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 5 })
        .expect(409);
    });

    it('should return 403 when editing after 1 week', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      // Manually set stoppedAt to 8 days ago
      const eightDaysAgo = new Date(
        Date.now() - 8 * 24 * 60 * 60 * 1000,
      ).toISOString();
      await testDbService.db
        .update(timeEntries)
        .set({ stoppedAt: eightDaysAgo })
        .where(eq(timeEntries.id, startResponse.body.id));

      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 5 })
        .expect(403);
    });

    it('should return 400 for invalid rating', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 0 })
        .expect(400);
    });

    it('should return 400 for comment exceeding 1000 characters', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ comment: 'a'.repeat(1001) })
        .expect(400);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .patch('/time-entries/00000000-0000-0000-0000-000000000000')
        .send({ rating: 5 })
        .expect(401);
    });

    it('should update distraction count', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id, distractionCount: 5 })
        .expect(201);

      const updateResponse = await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ distractionCount: 2 })
        .expect(200);

      expect(updateResponse.body.distractionCount).toBe(2);
    });

    it('should update distraction count with other fields', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id, distractionCount: 3 })
        .expect(201);

      const updateResponse = await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 4, comment: 'Good session', distractionCount: 1 })
        .expect(200);

      expect(updateResponse.body.rating).toBe(4);
      expect(updateResponse.body.comment).toBe('Good session');
      expect(updateResponse.body.distractionCount).toBe(1);
    });

    it('should return 400 for negative distraction count in update', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ distractionCount: -5 })
        .expect(400);
    });
  });

  describe('GET /time-entries', () => {
    it('should return empty array when no entries exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/time-entries')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return all time entries for authenticated user', async () => {
      // Create 3 entries
      const entry1Response = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Entry 1' });

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: entry1Response.body.id });

      const entry2Response = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Entry 2' });

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: entry2Response.body.id });

      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Entry 3 (active)' });

      // Get all entries
      const response = await request(app.getHttpServer())
        .get('/time-entries')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(3);
      // Should be ordered by startedAt DESC
      expect(response.body[0].description).toBe('Entry 3 (active)');
      expect(response.body[1].description).toBe('Entry 2');
      expect(response.body[2].description).toBe('Entry 1');
    });

    it('should filter time entries by from date', async () => {
      const now = new Date();
      const yesterday = new Date(
        now.getTime() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const tomorrow = new Date(
        now.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString();

      // Create entry (will have current timestamp)
      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Today entry' });

      // Filter from tomorrow (should return empty)
      const futureResponse = await request(app.getHttpServer())
        .get('/time-entries')
        .query({ from: tomorrow })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(futureResponse.body).toHaveLength(0);

      // Filter from yesterday (should return entry)
      const pastResponse = await request(app.getHttpServer())
        .get('/time-entries')
        .query({ from: yesterday })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(pastResponse.body).toHaveLength(1);
    });

    it('should filter time entries by to date', async () => {
      const now = new Date();
      const yesterday = new Date(
        now.getTime() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const tomorrow = new Date(
        now.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString();

      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Today entry' });

      // Filter to yesterday (should return empty)
      const pastResponse = await request(app.getHttpServer())
        .get('/time-entries')
        .query({ to: yesterday })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(pastResponse.body).toHaveLength(0);

      // Filter to tomorrow (should return entry)
      const futureResponse = await request(app.getHttpServer())
        .get('/time-entries')
        .query({ to: tomorrow })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(futureResponse.body).toHaveLength(1);
    });

    it('should filter time entries by from and to date range', async () => {
      const now = new Date();
      const yesterday = new Date(
        now.getTime() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const tomorrow = new Date(
        now.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString();

      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Today entry' });

      const response = await request(app.getHttpServer())
        .get('/time-entries')
        .query({ from: yesterday, to: tomorrow })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
    });

    it('should return 400 for invalid from date format', async () => {
      await request(app.getHttpServer())
        .get('/time-entries')
        .query({ from: 'not-a-date' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should return 400 for invalid to date format', async () => {
      await request(app.getHttpServer())
        .get('/time-entries')
        .query({ to: '2024-13-45' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).get('/time-entries').expect(401);
    });

    it('should only return entries belonging to authenticated user', async () => {
      // Create entry for first user
      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'User 1 entry' });

      // Register and login as second user
      const user2 = {
        email: 'user2@example.com',
        password: 'Password456!',
      };
      const user2Response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user2)
        .expect(201);

      const user2Token = user2Response.body.accessToken;

      // Second user should see empty list
      const response = await request(app.getHttpServer())
        .get('/time-entries')
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it('should filter time entries by activityId', async () => {
      // Create second activity
      const secondActivityResponse = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Second Activity' });

      const activity2Id = secondActivityResponse.body.id;

      // Create entries in both activities
      const entry1Response = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Entry in activity 1' });

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: entry1Response.body.id });

      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId: activity2Id, description: 'Entry in activity 2' });

      // Verify unfiltered returns both
      const allResponse = await request(app.getHttpServer())
        .get('/time-entries')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(allResponse.body).toHaveLength(2);

      // Filter by first activity
      const activity1Response = await request(app.getHttpServer())
        .get('/time-entries')
        .query({ activityId })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(activity1Response.body).toHaveLength(1);
      expect(activity1Response.body[0].description).toBe('Entry in activity 1');
      expect(activity1Response.body[0].activityId).toBe(activityId);

      // Filter by second activity
      const activity2FilterResponse = await request(app.getHttpServer())
        .get('/time-entries')
        .query({ activityId: activity2Id })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(activity2FilterResponse.body).toHaveLength(1);
      expect(activity2FilterResponse.body[0].description).toBe('Entry in activity 2');
      expect(activity2FilterResponse.body[0].activityId).toBe(activity2Id);
    });
  });

  describe('GET /time-entries/current', () => {
    it('should return null when no active entry exists', async () => {
      const response = await request(app.getHttpServer())
        .get('/time-entries/current')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.entry).toBeNull();
    });

    it('should return active time entry', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Active task' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/time-entries/current')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.entry).not.toBeNull();
      expect(response.body.entry.id).toBe(startResponse.body.id);
      expect(response.body.entry.description).toBe('Active task');
      expect(response.body.entry.stoppedAt).toBeNull();
    });

    it('should return null after stopping active entry', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Task' });

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id });

      const response = await request(app.getHttpServer())
        .get('/time-entries/current')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.entry).toBeNull();
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get('/time-entries/current')
        .expect(401);
    });
  });

  describe('Tasks and Tags Integration', () => {
    it('should start time entry with taskId', async () => {
      // Create a task
      const taskResponse = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Complete chapter 1' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, taskId: taskResponse.body.id })
        .expect(201);

      expect(response.body.taskId).toBe(taskResponse.body.id);
    });

    it('should return 404 for task from different activity', async () => {
      // Create another activity
      const activity2 = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Another activity' })
        .expect(201);

      // Create task in another activity
      const taskResponse = await request(app.getHttpServer())
        .post(`/activities/${activity2.body.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Task in activity 2' })
        .expect(201);

      // Try to start time entry with mismatched task
      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, taskId: taskResponse.body.id })
        .expect(404);
    });

    it('should update time entry with tags', async () => {
      // Create and stop entry
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      // Create tags
      const tagsResponse = await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['urgent', 'review'] })
        .expect(201);

      const tagIds = tagsResponse.body.map((t: { id: string }) => t.id);

      // Update entry with tags
      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tagIds })
        .expect(200);

      // Verify tags are included in response
      const entriesResponse = await request(app.getHttpServer())
        .get('/time-entries')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(entriesResponse.body[0].tags).toHaveLength(2);
    });

    it('should include task and tags in findAll response', async () => {
      // Create task
      const taskResponse = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'My task' })
        .expect(201);

      // Start and stop entry with task
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, taskId: taskResponse.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      // Create and attach tags
      const tagsResponse = await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['focus'] })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tagIds: [tagsResponse.body[0].id] })
        .expect(200);

      // Verify findAll includes task and tags
      const response = await request(app.getHttpServer())
        .get('/time-entries')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body[0].task).not.toBeNull();
      expect(response.body[0].task.name).toBe('My task');
      expect(response.body[0].tags).toHaveLength(1);
      expect(response.body[0].tags[0].name).toBe('focus');
    });

    it('should include task in current entry response', async () => {
      // Create task
      const taskResponse = await request(app.getHttpServer())
        .post(`/activities/${activityId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Current task' })
        .expect(201);

      // Start entry with task
      await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, taskId: taskResponse.body.id })
        .expect(201);

      // Verify current includes task
      const response = await request(app.getHttpServer())
        .get('/time-entries/current')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.entry.task).not.toBeNull();
      expect(response.body.entry.task.name).toBe('Current task');
      expect(response.body.entry.tags).toEqual([]);
    });

    it('should replace tags when updating with new tagIds', async () => {
      // Create and stop entry
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      // Create first tag and attach
      const tag1 = await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['first'] })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tagIds: [tag1.body[0].id] })
        .expect(200);

      // Create second tag and replace
      const tag2 = await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['second'] })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tagIds: [tag2.body[0].id] })
        .expect(200);

      // Verify only second tag remains
      const response = await request(app.getHttpServer())
        .get('/time-entries')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body[0].tags).toHaveLength(1);
      expect(response.body[0].tags[0].name).toBe('second');
    });

    it('should clear tags when updating with empty tagIds array', async () => {
      // Create and stop entry
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: startResponse.body.id })
        .expect(201);

      // Attach tag
      const tagResponse = await request(app.getHttpServer())
        .post('/tags/get-or-create')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ names: ['to-remove'] })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tagIds: [tagResponse.body[0].id] })
        .expect(200);

      // Clear tags
      await request(app.getHttpServer())
        .patch(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tagIds: [] })
        .expect(200);

      // Verify no tags
      const response = await request(app.getHttpServer())
        .get('/time-entries')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body[0].tags).toHaveLength(0);
    });
  });

  describe('DELETE /time-entries/:id', () => {
    it('should delete a time entry', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify it's gone
      const entries = await testDbService.db.query.timeEntries.findMany({
        where: and(
          eq(timeEntries.id, startResponse.body.id),
          eq(timeEntries.userId, startResponse.body.userId),
        ),
      });
      expect(entries).toHaveLength(0);
    });

    it('should return 404 when deleting non-existent entry', async () => {
      await request(app.getHttpServer())
        .delete('/time-entries/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should delete an active time entry', async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify no active entry
      const currentResponse = await request(app.getHttpServer())
        .get('/time-entries/current')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(currentResponse.body.entry).toBeNull();
    });

    it("should not allow deleting another user's entry", async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId })
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

      // Second user should not be able to delete first user's entry
      await request(app.getHttpServer())
        .delete(`/time-entries/${startResponse.body.id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(404);

      // Verify entry still exists for first user
      const entries = await testDbService.db.query.timeEntries.findMany({
        where: and(
          eq(timeEntries.id, startResponse.body.id),
          eq(timeEntries.userId, startResponse.body.userId),
        ),
      });
      expect(entries).toHaveLength(1);
    });
  });
});
