# Activities Feature (Database Layer)

## High-Level Purpose
Gamified activity tracking with streak counting and optional time-entry linkage for mastery-based skill development.

---

## Architectural Map
```
src/database/schema/
├── activities.ts          # Activity table definition
├── time-entries.ts        # Updated: Added optional activityId FK
├── relations.ts           # User → Activities, Activities → TimeEntries
└── index.ts               # Schema exports

drizzle/
└── 0006_steady_vindicator.sql  # Migration: CREATE activities, ALTER time_entries
```

**Status:** Database schema implemented. Service/Controller/Module pending.

---

## Data Model

### Core Entity: Activity
A user-owned entity tracking progress toward skill mastery through time tracking and gamification.

### Relationships
- **User → Activities**: One-to-Many (cascade delete)
- **Activity → TimeEntries**: One-to-Many (cascade delete)
- **TimeEntry → Activity**: Many-to-One (nullable—allows activity-less time tracking)

### Design Philosophy
1. **Archive-only deletion**: UI removes activities via `archivedAt` timestamp (soft delete)
2. **Optional activity tracking**: Time entries can exist without activities (backward compatible)
3. **Cascade on hard delete**: If activity hard-deleted (exceptional case), time entries removed (clean state)

---

## Database Schema

### `activities`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | TEXT | PK | UUID |
| userId | TEXT | FK → users.id, NOT NULL, ON DELETE CASCADE | Ownership |
| name | TEXT | NOT NULL | Activity display name |
| targetDuration | INTEGER | NOT NULL | Total seconds to master activity |
| trackedDuration | INTEGER | NOT NULL, DEFAULT 0 | Total seconds tracked (sum of time entries) |
| currentStreak | INTEGER | NOT NULL, DEFAULT 0 | Consecutive completion days |
| longestStreak | INTEGER | NOT NULL, DEFAULT 0 | Historical max streak |
| lastCompletedDate | TEXT | NULL | ISO8601 date of last completion |
| archivedAt | TEXT | NULL | ISO8601 timestamp—soft delete marker |
| createdAt | TEXT | NOT NULL | ISO8601 timestamp |
| updatedAt | TEXT | NOT NULL | ISO8601 timestamp |

### `time_entries` (Updated)
**New Column:**
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| activityId | TEXT | FK → activities.id, NULL, ON DELETE CASCADE | Optional activity linkage |

**Why nullable?** Allows:
- Free-form time tracking (no activity)
- Existing time entries to remain valid
- Flexible workflow (start entry, assign activity later)

---

## Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_activities_user_archived` | (user_id, archived_at) | Fast query: "List user's active activities" (WHERE archived_at IS NULL) |
| `idx_time_entries_user_date` | (user_id, started_at) | Chronological user time entries (existing pattern) |
| `idx_time_entries_activity_date` | (activity_id, started_at) | Activity-specific time tracking aggregation |

**Index strategy:** Cover actual query patterns—no speculative indexes.

---

## Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Soft Delete Only** | `archivedAt` timestamp—no hard delete in UI (constraint: user requirement) |
| **Nullable Foreign Key** | `activityId` allows optional activity tracking without breaking existing flows |
| **Cascade on All Deletes** | User deletion cascades to activities; activity deletion cascades to time entries (exceptional case cleanup) |
| **Cumulative Metrics** | `trackedDuration` stored—not computed (avoids N+1 aggregation queries) |
| **Streak Calculation** | App-code responsibility on completion—no DB triggers or cron jobs |
| **Target Duration** | Total mastery goal (not daily/weekly target)—business logic defines "completion" |
| **ISO8601 Dates** | All timestamps TEXT in SQLite (consistent with existing schema) |
| **UUID Primary Keys** | Generated client-side (matches users/time_entries pattern) |
| **Modern Drizzle Syntax** | Index definition uses array return `(table) => [index(...)]` (not deprecated object return) |

---

## Public Interface

**Note:** Service layer not yet implemented. Schema types available:

### Types (Drizzle Inferred)
```typescript
type Activity = typeof activities.$inferSelect
// { id, userId, name, targetDuration, trackedDuration, currentStreak, longestStreak, lastCompletedDate, archivedAt, createdAt, updatedAt }

type TimeEntry = typeof timeEntries.$inferSelect  // Now includes activityId
// { id, userId, activityId, description, startedAt, stoppedAt, createdAt }
```

### Future Service Methods (Planned)
```typescript
// ActivitiesService (to be implemented)
create(userId: string, name: string, targetDuration: number): Promise<Activity>
findAll(userId: string, includeArchived?: boolean): Promise<Activity[]>
findById(userId: string, id: string): Promise<Activity>
update(userId: string, id: string, data: Partial<Activity>): Promise<Activity>
archive(userId: string, id: string): Promise<Activity>
updateProgress(userId: string, id: string, durationDelta: number): Promise<Activity>  // Called when time entry stopped
calculateStreak(userId: string, id: string): Promise<void>  // On completion
```

---

## "Gotchas" & Rules

1. **Archive, don't delete**: UI must only set `archivedAt`—never hard delete from database
2. **Activity typing**: Use `typeof activities.$inferSelect`—not manual interface (Drizzle pattern)
3. **Time entry linkage**: `activityId` nullable—always handle `null` case in queries
4. **Ownership validation**: Service must filter by `userId` from JWT—no cross-user access
5. **Tracked duration**: Updated when time entry with `activityId` is stopped—not real-time
6. **Streak logic**: Calculated in app code on "completion" event—define completion criteria in service
7. **Target duration**: Total mastery goal (e.g., 10,000 seconds)—not daily/weekly cadence
8. **Hard delete behavior**: Activity hard-delete cascades to time entries (shouldn't occur via UI—only archive allowed)
9. **Index order**: Multi-column indexes ordered for "WHERE userId AND archived_at" queries
10. **Date storage**: ISO8601 strings in TEXT columns (SQLite standard)—parse in application layer
11. **Cascade behavior**: User deletion cascades to activities → activity deletion cascades to time entries (clean removal)
12. **Migration compatibility**: Existing time entries get `activityId = NULL` automatically (backward compatible)
13. **Index syntax**: Use array return `(table) => [index(...)]` not object `(table) => ({ idx: index(...) })` (deprecated)

---

## Data Flow (Future Implementation)

### Create Activity
1. `POST /activities` → `CreateActivityDto` validates name, targetDuration
2. `@CurrentUser()` extracts userId from JWT
3. `ActivitiesService.create()` → generates UUID, sets defaults (streaks=0)
4. Inserts into `activities` table
5. Response: Full `Activity` object

### Link Time Entry to Activity
1. `PATCH /time-entries/:id` → `LinkActivityDto` validates activityId (UUID)
2. Service verifies activity ownership (userId match)
3. Updates `time_entries.activity_id`
4. Response: Updated `TimeEntry` with `activityId`

### Stop Time Entry (Activity-Linked)
1. Existing `POST /time-entries/stop` flow
2. If entry has `activityId` → calculate duration (stop - start)
3. `ActivitiesService.updateProgress()` → increment `trackedDuration`
4. Check if `trackedDuration >= targetDuration` → calculate streak
5. Response: Updated `TimeEntry` + side effect (activity progress updated)

### List User Activities
1. `GET /activities?includeArchived=false`
2. Query: `WHERE userId = ? AND (includeArchived OR archivedAt IS NULL)`
3. Uses index: `idx_activities_user_archived`
4. Response: Array of `Activity` objects, sorted by `createdAt DESC`

---

## Dependencies
```json
"drizzle-orm": "^0.44.7",  // Schema definition + relations
"uuid": "^13.0.0"          // Activity ID generation (client-side)
```

---

## Migration Notes

**Applied:** `0006_steady_vindicator.sql`
- CREATE `activities` table with all columns + FK to users
- DROP `habits` table
- Rebuild `time_entries` with `activity_id` column (nullable, FK to activities)
- CREATE indexes (activities: 1, time_entries: 2)

**Backward Compatibility:**
- Existing time entries automatically get `activityId = NULL`
- Existing queries unaffected (new column ignored)
- No data migration required

**Rollback Strategy:**
- Drop indexes first
- Rebuild time_entries without activity_id
- DROP TABLE activities CASCADE

---

## Next Implementation Steps

1. **Create ActivitiesModule** (imports DatabaseModule, UsersModule)
2. **Create ActivitiesService** (CRUD + progress tracking + streak logic)
3. **Create ActivitiesController** (REST endpoints with `@CurrentUser()`)
4. **Create DTOs** (CreateActivityDto, UpdateActivityDto, LinkActivityDto)
5. **Update TimeEntriesService** → call `ActivitiesService.updateProgress()` on stop
6. **Add validation** → `@IsUUID()` for activityId, `@Min(1)` for targetDuration
7. **Add rate limiting** → `@Throttle()` on activity mutations
8. **Write tests** → activities.e2e-spec.ts (CRUD + archiving + progress tracking)
