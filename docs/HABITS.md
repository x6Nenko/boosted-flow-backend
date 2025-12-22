# Habits Feature (Database Layer)

## High-Level Purpose
Gamified habit tracking with XP progression, streak counting, and optional time-entry linkage for mastery-based skill development.

---

## Architectural Map
```
src/database/schema/
├── habits.ts              # Habit table definition
├── time-entries.ts        # Updated: Added optional habitId FK
├── relations.ts           # User → Habits, Habits → TimeEntries
└── index.ts               # Schema exports

drizzle/
└── 0004_known_virginia_dare.sql  # Migration: CREATE habits, ALTER time_entries
```

**Status:** Database schema implemented. Service/Controller/Module pending.

---

## Data Model

### Core Entity: Habit
A user-owned entity tracking progress toward skill mastery through time tracking and gamification.

### Relationships
- **User → Habits**: One-to-Many (cascade delete)
- **Habit → TimeEntries**: One-to-Many (cascade delete)
- **TimeEntry → Habit**: Many-to-One (nullable—allows habit-less time tracking)

### Design Philosophy
1. **Archive-only deletion**: UI removes habits via `archivedAt` timestamp (soft delete)
2. **Optional habit tracking**: Time entries can exist without habits (backward compatible)
3. **Cascade on hard delete**: If habit hard-deleted (exceptional case), time entries removed (clean state)

---

## Database Schema

### `habits`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | TEXT | PK | UUID |
| userId | TEXT | FK → users.id, NOT NULL, ON DELETE CASCADE | Ownership |
| name | TEXT | NOT NULL | Habit display name |
| targetDuration | INTEGER | NOT NULL | Total seconds to master habit |
| xp | INTEGER | NOT NULL, DEFAULT 0 | Total XP earned (cumulative) |
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
| habitId | TEXT | FK → habits.id, NULL, ON DELETE SET NULL | Optional habit linkage |

**Why nullable?** Allows:
- Free-form time tracking (no habit)
- Existing time entries to remain valid
- Flexible workflow (start entry, assign habit later)

---

## Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_habits_user_archived` | (user_id, archived_at) | Fast query: "List user's active habits" (WHERE archived_at IS NULL) |
| `idx_time_entries_user_date` | (user_id, started_at) | Chronological user time entries (existing pattern) |
| `idx_time_entries_habit_date` | (habit_id, started_at) | Habit-specific time tracking aggregation |

**Index strategy:** Cover actual query patterns—no speculative indexes.

---

## Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Soft Delete Only** | `archivedAt` timestamp—no hard delete in UI (constraint: user requirement) |
| **Nullable Foreign Key** | `habitId` allows optional habit tracking without breaking existing flows |
| **Cascade on All Deletes** | User deletion cascades to habits; habit deletion cascades to time entries (exceptional case cleanup) |
| **Cumulative Metrics** | `xp`, `trackedDuration` stored—not computed (avoids N+1 aggregation queries) |
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
type Habit = typeof habits.$inferSelect
// { id, userId, name, targetDuration, xp, trackedDuration, currentStreak, longestStreak, lastCompletedDate, archivedAt, createdAt, updatedAt }

type TimeEntry = typeof timeEntries.$inferSelect  // Now includes habitId
// { id, userId, habitId, description, startedAt, stoppedAt, createdAt }
```

### Future Service Methods (Planned)
```typescript
// HabitsService (to be implemented)
create(userId: string, name: string, targetDuration: number): Promise<Habit>
findAll(userId: string, includeArchived?: boolean): Promise<Habit[]>
findById(userId: string, id: string): Promise<Habit>
update(userId: string, id: string, data: Partial<Habit>): Promise<Habit>
archive(userId: string, id: string): Promise<Habit>
updateProgress(userId: string, id: string, durationDelta: number): Promise<Habit>  // Called when time entry stopped
calculateStreak(userId: string, id: string): Promise<void>  // On completion
```

---

## "Gotchas" & Rules

1. **Archive, don't delete**: UI must only set `archivedAt`—never hard delete from database
2. **Habit typing**: Use `typeof habits.$inferSelect`—not manual interface (Drizzle pattern)
3. **Time entry linkage**: `habitId` nullable—always handle `null` case in queries
4. **Ownership validation**: Service must filter by `userId` from JWT—no cross-user access
5. **XP semantics**: `xp` is total earned for this habit, not per-session reward
6. **Tracked duration**: Updated when time entry with `habitId` is stopped—not real-time
7. **Streak logic**: Calculated in app code on "completion" event—define completion criteria in service
8. **Target duration**: Total mastery goal (e.g., 10,000 seconds)—not daily/weekly cadence
9. **Hard delete behavior**: Habit hard-delete cascades to time entries (shouldn't occur via UI—only archive allowed)
10. **Index order**: Multi-column indexes ordered for "WHERE userId AND archived_at" queries
11. **Date storage**: ISO8601 strings in TEXT columns (SQLite standard)—parse in application layer
12. **Cascade behavior**: User deletion cascades to habits → habit deletion cascades to time entries (clean removal)
13. **Migration compatibility**: Existing time entries get `habitId = NULL` automatically (backward compatible)
14. **Index syntax**: Use array return `(table) => [index(...)]` not object `(table) => ({ idx: index(...) })` (deprecated)

---

## Data Flow (Future Implementation)

### Create Habit
1. `POST /habits` → `CreateHabitDto` validates name, targetDuration
2. `@CurrentUser()` extracts userId from JWT
3. `HabitsService.create()` → generates UUID, sets defaults (xp=0, streaks=0)
4. Inserts into `habits` table
5. Response: Full `Habit` object

### Link Time Entry to Habit
1. `PATCH /time-entries/:id` → `LinkHabitDto` validates habitId (UUID)
2. Service verifies habit ownership (userId match)
3. Updates `time_entries.habit_id`
4. Response: Updated `TimeEntry` with `habitId`

### Stop Time Entry (Habit-Linked)
1. Existing `POST /time-entries/stop` flow
2. If entry has `habitId` → calculate duration (stop - start)
3. `HabitsService.updateProgress()` → increment `trackedDuration`
4. Check if `trackedDuration >= targetDuration` → award XP, calculate streak
5. Response: Updated `TimeEntry` + side effect (habit progress updated)

### List User Habits
1. `GET /habits?includeArchived=false`
2. Query: `WHERE userId = ? AND (includeArchived OR archivedAt IS NULL)`
3. Uses index: `idx_habits_user_archived`
4. Response: Array of `Habit` objects, sorted by `createdAt DESC`

---

## Dependencies
```json
"drizzle-orm": "^0.44.7",  // Schema definition + relations
"uuid": "^13.0.0"          // Habit ID generation (client-side)
```

---

## Migration Notes

**Applied:** `0004_known_virginia_dare.sql`
- CREATE `habits` table with all columns + FK to users
- ALTER `time_entries` ADD `habit_id` column (nullable, FK to habits)
- CREATE 3 indexes (habits: 1, time_entries: 2)

**Backward Compatibility:**
- Existing time entries automatically get `habitId = NULL`
- Existing queries unaffected (new column ignored)
- No data migration required

**Rollback Strategy:**
- Drop indexes first
- ALTER TABLE DROP COLUMN habit_id (SQLite: requires table rebuild)
- DROP TABLE habits CASCADE

---

## Next Implementation Steps

1. **Create HabitsModule** (imports DatabaseModule, UsersModule)
2. **Create HabitsService** (CRUD + progress tracking + streak logic)
3. **Create HabitsController** (REST endpoints with `@CurrentUser()`)
4. **Create DTOs** (CreateHabitDto, UpdateHabitDto, LinkHabitDto)
5. **Update TimeEntriesService** → call `HabitsService.updateProgress()` on stop
6. **Add validation** → `@IsUUID()` for habitId, `@Min(1)` for targetDuration
7. **Add rate limiting** → `@Throttle()` on habit mutations
8. **Write tests** → habits.e2e-spec.ts (CRUD + archiving + progress tracking)
