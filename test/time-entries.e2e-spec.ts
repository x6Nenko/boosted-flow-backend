import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { TestDatabaseService } from './setup/test-database.service';
import { dailyTimeEntryCounts, timeEntries } from '../src/database/schema';

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
    });

    it('should increment daily heatmap count when stopping entries', async () => {
      // Start entry #1
      const start1 = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Heatmap #1' })
        .expect(201);

      const userId = start1.body.userId as string;
      const entryId1 = start1.body.id as string;

      // Stop entry #1
      const stop1 = await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: entryId1 })
        .expect(201);

      const date = (stop1.body.stoppedAt as string).split('T')[0];

      const rowAfterFirstStop =
        await testDbService.db.query.dailyTimeEntryCounts.findFirst({
          where: and(
            eq(dailyTimeEntryCounts.userId, userId),
            eq(dailyTimeEntryCounts.date, date),
          ),
        });

      expect(rowAfterFirstStop).toBeTruthy();
      expect(rowAfterFirstStop!.count).toBe(1);

      // Start + stop entry #2 (same day)
      const start2 = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Heatmap #2' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: start2.body.id })
        .expect(201);

      const rowAfterSecondStop =
        await testDbService.db.query.dailyTimeEntryCounts.findFirst({
          where: and(
            eq(dailyTimeEntryCounts.userId, userId),
            eq(dailyTimeEntryCounts.date, date),
          ),
        });

      expect(rowAfterSecondStop).toBeTruthy();
      expect(rowAfterSecondStop!.count).toBe(2);

      const allRowsForUser =
        await testDbService.db.query.dailyTimeEntryCounts.findMany({
          where: eq(dailyTimeEntryCounts.userId, userId),
        });
      expect(allRowsForUser).toHaveLength(1);
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
  });

  describe('GET /time-entries/heatmap', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get('/time-entries/heatmap')
        .expect(401);
    });

    it('should return aggregated counts for the current day', async () => {
      // Stop two entries to increment heatmap
      const start1 = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Heatmap GET #1' })
        .expect(201);

      const stop1 = await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: start1.body.id })
        .expect(201);

      const date = (stop1.body.stoppedAt as string).split('T')[0];

      const start2 = await request(app.getHttpServer())
        .post('/time-entries/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ activityId, description: 'Heatmap GET #2' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/time-entries/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: start2.body.id })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/time-entries/heatmap')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      const today = response.body.find((r: any) => r.date === date);
      expect(today).toBeTruthy();
      expect(today.count).toBe(2);
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
});
