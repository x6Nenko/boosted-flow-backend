# Time Entries Feature

## High-Level Purpose
Manual time tracking with start/stop functionality, session rating and comments, optional descriptions, task linking, tag categorization, and date-range filtering for authenticated users.

---

## Architectural Map
```
src/
├── time-entries/
│   ├── time-entries.module.ts      # Feature module, imports DatabaseModule + ActivitiesModule + ActivityTasksModule + TagsModule
│   ├── time-entries.controller.ts  # HTTP endpoints (start, stop, update, findAll, findCurrent)
│   ├── time-entries.service.ts     # Business logic, CRUD operations
│   └── dto/
│       ├── start-time-entry.dto.ts      # Validation: activityId, optional taskId, optional description (max 500 chars)
│       ├── stop-time-entry.dto.ts       # Validation: UUID id
│       ├── update-time-entry.dto.ts     # Validation: optional rating (1-5), optional comment (max 1000 chars), optional tagIds (max 3)
│       └── get-time-entries-query.dto.ts # Validation: optional ISO8601 from/to
└── database/schema/
    ├── time-entries.ts             # Time entry table definition
    ├── daily-time-entry-counts.ts   # Pre-aggregated daily entry counts (heatmap)
    └── relations.ts                # User ↔ TimeEntry, Activity ↔ TimeEntry, Task ↔ TimeEntry, Tags ↔ TimeEntry
```

---

## Data Flow

### Start Timer
1. `POST /time-entries/start` → `StartTimeEntryDto` validates required `activityId`, optional `taskId`, optional description (max 500 chars)
2. `@CurrentUser()` extracts `{ userId: string }` from request
3. `TimeEntriesService.start()` → checks for existing active entry via `findActive()`
4. If active entry exists → `ConflictException` (409)
5. Verifies activity ownership via `ActivitiesService.verifyOwnership()`
6. If `taskId` provided, verifies task ownership and activity match via `ActivityTasksService.verifyOwnership()`
7. Creates new entry with UUID, `startedAt` timestamp, `stoppedAt: null`
8. Response: Full `TimeEntry` object

### Stop Timer
1. `POST /time-entries/stop` → `StopTimeEntryDto` validates UUID `id`, optional rating (1-5), optional comment (max 1000 chars)
2. `TimeEntriesService.stop()` → finds entry by ID + userId (ownership check)
3. If not found → `NotFoundException` (404)
4. If already stopped → `ConflictException` (409)
5. Updates `stoppedAt` to current timestamp, sets `rating` and `comment` if provided
6. Calculates duration and calls `ActivitiesService.updateProgress()` to update tracked duration + streaks
7. Increments daily heatmap counter (`daily_time_entry_counts`) for `userId` + `YYYY-MM-DD`
8. Response: Updated `TimeEntry` object

### Update Time Entry
1. `PATCH /time-entries/:id` → `UpdateTimeEntryDto` validates optional rating (1-5), optional comment (max 1000 chars), optional tagIds (max 3)
2. `TimeEntriesService.update()` → finds entry by ID + userId (ownership check)
3. If not found → `NotFoundException` (404)
4. If entry is still active (not stopped) → `ConflictException` (409)
5. If more than 1 week since `stoppedAt` → `ForbiddenException` (403)
6. If `tagIds` provided, replaces all tags via `TagsService.setEntryTags()`
7. Updates `rating` and/or `comment` fields
8. Response: Updated `TimeEntry` object

### Get All Entries
1. `GET /time-entries?from=&to=` → `GetTimeEntriesQueryDto` validates ISO8601 dates
2. `TimeEntriesService.findAll()` → builds dynamic query with optional date filters
3. Includes task and tags via relational query (single query with JOINs)
4. Filters: `userId` (always), `startedAt >= from` (optional), `startedAt <= to` (optional)
5. Response: Array of `TimeEntryWithRelations` objects (includes task, tags), sorted by `startedAt` DESC

### Get Current Active Entry
1. `GET /time-entries/current` → no body/params required
2. `TimeEntriesService.findActive()` → queries for entry where `stoppedAt IS NULL`
3. Includes task and tags via relational query (single query with JOINs)
4. Response: `{ entry: TimeEntryWithRelations | null }` (wrapped for JSON serialization)

### Get Heatmap Data
1. `GET /time-entries/heatmap?from=&to=` → optional ISO8601 from/to
2. `TimeEntriesService.getHeatmap()` → reads from pre-aggregated `daily_time_entry_counts`
3. Filters: `userId` (always), `date >= from` (optional), `date <= to` (optional)
4. Response: Array of `{ date, count }` rows (days with no entries are omitted)

---

## Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Protected Routes** | All endpoints require authentication (global `AuthGuard`) |
| **Custom Param Decorator** | `@CurrentUser()` extracts user from request |
| **Rate Limiting** | `@Throttle({ default: { limit: 10, ttl: 60000 } })` on start/stop |
| **Ownership Validation** | Service always filters by `userId` from JWT—no cross-user access |
| **Single Active Entry** | `ConflictException` prevents multiple running timers |
| **Null-Safe Response** | `findCurrent` wraps result in `{ entry }` object |
| **Dynamic Query Building** | `findAll` uses conditional `and()` with optional date filters |
| **Cascade Delete** | `onDelete: 'cascade'` on `userId` FK—user deletion removes entries |
| **Task FK Set Null** | `onDelete: 'set null'` on `taskId` FK—task deletion nullifies reference |
| **Side-Effect Progress Update** | `stop()` calls `ActivitiesService.updateProgress()` |
| **Pre-Aggregated Heatmap** | `stop()` increments `daily_time_entry_counts` for fast heatmap reads |
| **1-Week Edit Window** | Rating/comment/tags editable only within 1 week of stopping |
| **Relational Queries** | `findAll` and `findActive` use Drizzle relational queries to include task and tags |
| **Tag Replace Strategy** | `update` replaces all tags when `tagIds` provided |

---

## Public Interface

### TimeEntriesController (`/time-entries`)
```typescript
@Post('start')   start(@CurrentUser() user, @Body() dto: StartTimeEntryDto): Promise<TimeEntry>
@Post('stop')    stop(@CurrentUser() user, @Body() dto: StopTimeEntryDto): Promise<TimeEntry>
@Patch(':id')    update(@CurrentUser() user, @Param('id') id, @Body() dto: UpdateTimeEntryDto): Promise<TimeEntry>
@Get()           findAll(@CurrentUser() user, @Query() query: GetTimeEntriesQueryDto): Promise<TimeEntry[]>
@Get('current')  findCurrent(@CurrentUser() user): Promise<{ entry: TimeEntry | null }>
@Get('heatmap')  getHeatmap(@CurrentUser() user, @Query() query: GetHeatmapQueryDto): Promise<Array<{ date: string; count: number }>>
```

### TimeEntriesService
```typescript
start(userId: string, activityId: string, description?: string, taskId?: string): Promise<TimeEntry>
stop(userId: string, id: string): Promise<TimeEntry>
update(userId: string, id: string, data: { rating?: number; comment?: string; tagIds?: string[] }): Promise<TimeEntry>
findActive(userId: string): Promise<TimeEntryWithRelations | null>
findAll(userId: string, from?: string, to?: string): Promise<TimeEntryWithRelations[]>
getHeatmap(userId: string, from?: string, to?: string): Promise<Array<{ date: string; count: number }>>
```

### TimeEntry Type
```typescript
type TimeEntry = typeof timeEntries.$inferSelect
// { id, userId, activityId, taskId, description, startedAt, stoppedAt, rating, comment, createdAt }

type TimeEntryWithRelations = TimeEntry & {
  task: { id: string; name: string; archivedAt: string | null } | null;
  tags: Tag[];
}
```

---

## Database Schema

### `time_entries`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| userId | TEXT FK | References `users.id`, cascade delete |
| activityId | TEXT FK | References `activities.id`, NOT NULL, cascade delete |
| taskId | TEXT FK | References `tasks.id`, nullable, set null on delete |
| description | TEXT | Nullable, max 500 chars (DTO enforced) |
| startedAt | TEXT | ISO string, NOT NULL |
| stoppedAt | TEXT | ISO string, NULL = active |
| rating | INTEGER | Nullable, 1-5 (DTO enforced) |
| comment | TEXT | Nullable, max 1000 chars (DTO enforced) |
| createdAt | TEXT | ISO string |

### `daily_time_entry_counts`
| Column | Type | Notes |
|--------|------|-------|
| userId | TEXT PK | Composite PK (`userId`, `date`), cascade delete |
| date | TEXT PK | ISO date string (YYYY-MM-DD) |
| count | INTEGER | NOT NULL, DEFAULT 0 |
| createdAt | TEXT | ISO string |
| updatedAt | TEXT | ISO string |

### Relations
- `users` → `timeEntries`: One-to-Many
- `timeEntries` → `user`: Many-to-One
- `activities` → `timeEntries`: One-to-Many
- `timeEntries` → `activity`: Many-to-One
- `tasks` → `timeEntries`: One-to-Many
- `timeEntries` → `task`: Many-to-One (nullable)
- `timeEntries` ↔ `tags`: Many-to-Many (via `time_entry_tags`)
- `users` → `dailyTimeEntryCounts`: One-to-Many

---

## "Gotchas" & Rules

1. **Single active timer**: User can only have one entry with `stoppedAt = null` at a time
2. **Ownership enforcement**: Service always includes `userId` in queries—never trust client-provided userId
3. **User shape in controller**: `@CurrentUser()` returns `{ userId: string }`—use `user.userId`
4. **Entry typing**: Use `typeof timeEntries.$inferSelect` for `TimeEntry` type (Drizzle pattern)
5. **Date format**: All timestamps stored as ISO 8601 strings in SQLite TEXT columns
6. **Date filtering**: `from`/`to` filter on `startedAt`, not `stoppedAt`
7. **Null wrapping**: `findCurrent` returns `{ entry }` object, not raw entry—ensures proper `null` serialization
8. **No pagination**: `findAll` returns all matching entries—add pagination for production scale
9. **Description limit**: 500 chars max enforced at DTO level, not database level
10. **Rating range**: 1-5 enforced at DTO level, not database level
11. **Comment limit**: 1000 chars max enforced at DTO level, not database level
12. **Tag limit**: Max 3 tags per entry enforced at DTO level
13. **1-week edit window**: Rating/comment/tags editable only within 1 week of `stoppedAt`
14. **Edit requires stopped entry**: Cannot update rating/comment/tags on active entries
15. **Cascade behavior**: Deleting a user removes all their time entries automatically
16. **Task FK set null**: Deleting a task sets `taskId` to NULL on linked entries
17. **Task-Activity validation**: Task must belong to same activity as time entry
18. **Archived task exclusion**: Cannot start time entry with archived task
19. **Progress side effect**: Stopping a time entry updates the linked activity's tracked duration + streaks
20. **Heatmap updates happen on stop**: Starting a timer does not affect `daily_time_entry_counts`
21. **Heatmap is derived data**: It should never be edited directly via API—only updated by `stop()`
22. **Missing days are not returned**: Heatmap endpoint returns only days that have at least one stopped entry
23. **Relational query pattern**: `findAll` and `findActive` use Drizzle's relational query builder to avoid N+1
24. **Tag replace semantics**: Providing `tagIds` in update replaces all existing tags

---

## Dependencies
```json
"drizzle-orm": "^0.43.1",
"uuid": "^13.0.0",
"class-validator": "^0.14.2",
"class-transformer": "^0.5.1"
```
