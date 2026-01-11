# Time Entries Feature

## High-Level Purpose
Manual time tracking with start/stop functionality, session rating and comments, optional descriptions, and date-range filtering for authenticated users.

---

## Architectural Map
```
src/
├── time-entries/
│   ├── time-entries.module.ts      # Feature module, imports DatabaseModule + ActivitiesModule
│   ├── time-entries.controller.ts  # HTTP endpoints (start, stop, update, findAll, findCurrent)
│   ├── time-entries.service.ts     # Business logic, CRUD operations
│   └── dto/
│       ├── start-time-entry.dto.ts      # Validation: optional description (max 500 chars)
│       ├── stop-time-entry.dto.ts       # Validation: UUID id, optional rating (1-5), optional comment (max 1000 chars)
│       ├── update-time-entry.dto.ts     # Validation: optional rating (1-5), optional comment (max 1000 chars)
│       └── get-time-entries-query.dto.ts # Validation: optional ISO8601 from/to
└── database/schema/
    ├── time-entries.ts             # Time entry table definition
    ├── daily-time-entry-counts.ts   # Pre-aggregated daily entry counts (heatmap)
    └── relations.ts                # User ↔ TimeEntry, Activity ↔ TimeEntry relations
```

---

## Data Flow

### Start Timer
1. `POST /time-entries/start` → `StartTimeEntryDto` validates required `activityId` and optional description (max 500 chars)
2. `@CurrentUser()` extracts `{ userId: string }` from request
3. `TimeEntriesService.start()` → checks for existing active entry via `findActive()`
4. If active entry exists → `ConflictException` (409)
5. Creates new entry with UUID, `startedAt` timestamp, `stoppedAt: null`
6. Response: Full `TimeEntry` object

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
1. `PATCH /time-entries/:id` → `UpdateTimeEntryDto` validates optional rating (1-5), optional comment (max 1000 chars)
2. `TimeEntriesService.update()` → finds entry by ID + userId (ownership check)
3. If not found → `NotFoundException` (404)
4. If entry is still active (not stopped) → `ConflictException` (409)
5. If more than 1 week since `stoppedAt` → `ForbiddenException` (403)
6. Updates `rating` and/or `comment` fields
7. Response: Updated `TimeEntry` object

### Get All Entries
1. `GET /time-entries?from=&to=` → `GetTimeEntriesQueryDto` validates ISO8601 dates
2. `TimeEntriesService.findAll()` → builds dynamic query with optional date filters
3. Filters: `userId` (always), `startedAt >= from` (optional), `startedAt <= to` (optional)
4. Response: Array of `TimeEntry` objects, sorted by `startedAt` DESC

### Get Current Active Entry
1. `GET /time-entries/current` → no body/params required
2. `TimeEntriesService.findActive()` → queries for entry where `stoppedAt IS NULL`
3. Response: `{ entry: TimeEntry | null }` (wrapped for JSON serialization)

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
| **Side-Effect Progress Update** | `stop()` calls `ActivitiesService.updateProgress()` |
| **Pre-Aggregated Heatmap** | `stop()` increments `daily_time_entry_counts` for fast heatmap reads |
| **1-Week Edit Window** | Rating/comment editable only within 1 week of stopping |

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
start(userId: string, activityId: string, description?: string): Promise<TimeEntry>
stop(userId: string, id: string, rating?: number, comment?: string): Promise<TimeEntry>
update(userId: string, id: string, data: { rating?: number; comment?: string }): Promise<TimeEntry>
findActive(userId: string): Promise<TimeEntry | null>
findAll(userId: string, from?: string, to?: string): Promise<TimeEntry[]>
getHeatmap(userId: string, from?: string, to?: string): Promise<Array<{ date: string; count: number }>>
```

### TimeEntry Type
```typescript
type TimeEntry = typeof timeEntries.$inferSelect
// { id, userId, activityId, description, startedAt, stoppedAt, rating, comment, createdAt }
```

---

## Database Schema

### `time_entries`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| userId | TEXT FK | References `users.id`, cascade delete |
| activityId | TEXT FK | References `activities.id`, NOT NULL, cascade delete |
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
12. **1-week edit window**: Rating/comment editable only within 1 week of `stoppedAt`
13. **Edit requires stopped entry**: Cannot update rating/comment on active entries
14. **Cascade behavior**: Deleting a user removes all their time entries automatically
15. **Progress side effect**: Stopping a time entry updates the linked activity's tracked duration + streaks
16. **Heatmap updates happen on stop**: Starting a timer does not affect `daily_time_entry_counts`
17. **Heatmap is derived data**: It should never be edited directly via API—only updated by `stop()`
18. **Missing days are not returned**: Heatmap endpoint returns only days that have at least one stopped entry

---

## Dependencies
```json
"drizzle-orm": "^0.43.1",
"uuid": "^13.0.0",
"class-validator": "^0.14.2",
"class-transformer": "^0.5.1"
```
