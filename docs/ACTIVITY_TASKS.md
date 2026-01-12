# Activity Tasks Feature

## High-Level Purpose
Sub-tasks within activities for granular time tracking, with soft-delete archiving and optional hard delete for cleanup.

---

## Architectural Map
```
src/
├── activity-tasks/
│   ├── activity-tasks.module.ts      # Feature module, exports ActivityTasksService
│   ├── activity-tasks.controller.ts  # HTTP endpoints (CRUD, archive/unarchive, delete)
│   ├── activity-tasks.service.ts     # Business logic, ownership verification
│   └── dto/
│       ├── create-activity-task.dto.ts   # Validation: name (max 255 chars)
│       ├── update-activity-task.dto.ts   # Validation: optional name
│       └── index.ts                      # DTO exports
└── database/schema/
    ├── tasks.ts                      # Task table definition
    └── relations.ts                  # Activity → Tasks, Tasks → TimeEntries
```

---

## Data Flow

### Create Task
1. `POST /activities/:activityId/tasks` → `CreateActivityTaskDto` validates name (max 255 chars)
2. `@CurrentUser()` extracts `{ userId: string }` from request
3. `ActivityTasksService.create()` → verifies activity ownership via `ActivitiesService.findById()`
4. Inserts into `tasks` table with UUID, `archivedAt: null`
5. Response: Full `Task` object

### List Tasks for Activity
1. `GET /activities/:activityId/tasks?includeArchived=false`
2. `ActivityTasksService.findAllForActivity()` → verifies activity ownership
3. Filters: `activityId`, `userId`, optionally `archivedAt IS NULL`
4. Response: Array of `Task` objects, sorted by `createdAt DESC`

### Update Task
1. `PATCH /activities/:activityId/tasks/:id` → `UpdateActivityTaskDto` validates optional name
2. `ActivityTasksService.update()` → verifies task ownership
3. Updates `name` and `updatedAt` timestamp
4. Response: Updated `Task`

### Archive Task
1. `POST /activities/:activityId/tasks/:id/archive` → no body required
2. `ActivityTasksService.archive()` → verifies ownership + checks not already archived
3. Sets `archivedAt` to current ISO timestamp
4. Response: Updated `Task` with `archivedAt` populated

### Unarchive Task
1. `POST /activities/:activityId/tasks/:id/unarchive` → no body required
2. `ActivityTasksService.unarchive()` → verifies ownership + checks is archived
3. Sets `archivedAt` to `null`
4. Response: Updated `Task` with `archivedAt: null`

### Delete Task
1. `DELETE /activities/:activityId/tasks/:id` → no body required
2. `ActivityTasksService.delete()` → verifies ownership
3. Hard deletes task (time entries' taskId set to NULL via FK)
4. Response: `204 No Content`

### Verify Ownership (Called by TimeEntriesService)
1. `POST /time-entries/start` with `taskId` → `TimeEntriesService.start()` calls `ActivityTasksService.verifyOwnership()`
2. Checks task exists, belongs to user, matches activityId, and is not archived
3. If not valid → `NotFoundException` thrown in TimeEntriesService
4. Response: Boolean (true if valid, false otherwise)

---

## Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Protected Routes** | All endpoints require authentication (global `AuthGuard`) |
| **Custom Param Decorator** | `@CurrentUser()` extracts user from request |
| **Rate Limiting** | `@Throttle({ default: { limit: 10, ttl: 60000 } })` on mutations |
| **Ownership Validation** | Service always filters by `userId` from JWT |
| **Activity Ownership Check** | Create/List verify activity exists and belongs to user |
| **Soft Delete** | `archivedAt` timestamp for archive/unarchive |
| **Hard Delete** | `DELETE` endpoint removes task completely |
| **FK on Delete** | `onDelete: 'set null'` on time_entries.taskId |
| **Task-Activity Binding** | Task must belong to specified activity |
| **Archive Excludes from Linking** | `verifyOwnership()` excludes archived tasks |

---

## Public Interface

### ActivityTasksController (`/activities/:activityId/tasks`)
```typescript
@Post()                create(@CurrentUser() user, @Param('activityId') activityId, @Body() dto): Promise<Task>
@Get()                 findAll(@CurrentUser() user, @Param('activityId') activityId, @Query('includeArchived') include?): Promise<Task[]>
@Get(':id')            findOne(@CurrentUser() user, @Param('id') id): Promise<Task>
@Patch(':id')          update(@CurrentUser() user, @Param('id') id, @Body() dto): Promise<Task>
@Post(':id/archive')   archive(@CurrentUser() user, @Param('id') id): Promise<Task>
@Post(':id/unarchive') unarchive(@CurrentUser() user, @Param('id') id): Promise<Task>
@Delete(':id')         delete(@CurrentUser() user, @Param('id') id): Promise<void>
```

### ActivityTasksService
```typescript
create(userId: string, activityId: string, name: string): Promise<Task>
findAllForActivity(userId: string, activityId: string, includeArchived?: boolean): Promise<Task[]>
findById(userId: string, id: string): Promise<Task>  // Throws NotFoundException if not found
update(userId: string, id: string, data: { name?: string }): Promise<Task>
archive(userId: string, id: string): Promise<Task>  // Throws ConflictException if already archived
unarchive(userId: string, id: string): Promise<Task>  // Throws ConflictException if not archived
delete(userId: string, id: string): Promise<void>
verifyOwnership(userId: string, taskId: string, activityId: string): Promise<boolean>  // Called by TimeEntriesService
```

### Task Type
```typescript
type Task = typeof tasks.$inferSelect
// { id, userId, activityId, name, archivedAt, createdAt, updatedAt }
```

---

## Database Schema

### `tasks`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| userId | TEXT FK | References `users.id`, cascade delete |
| activityId | TEXT FK | References `activities.id`, cascade delete |
| name | TEXT | NOT NULL, max 255 chars (DTO enforced) |
| archivedAt | TEXT | ISO timestamp, NULL = active |
| createdAt | TEXT | ISO timestamp |
| updatedAt | TEXT | ISO timestamp |

### Relations
- `users` → `tasks`: One-to-Many
- `activities` → `tasks`: One-to-Many
- `tasks` → `user`: Many-to-One
- `tasks` → `activity`: Many-to-One
- `tasks` → `timeEntries`: One-to-Many (FK set null on delete)

---

## "Gotchas" & Rules

1. **Soft delete default**: Prefer archive over delete for normal workflow
2. **Hard delete available**: `DELETE` endpoint for cleanup scenarios
3. **Task typing**: Use `typeof tasks.$inferSelect` for `Task` type (Drizzle pattern)
4. **User shape in controller**: `@CurrentUser()` returns `{ userId: string }`
5. **Activity validation**: Create/List verify activity exists before proceeding
6. **Ownership enforcement**: Service always includes `userId` in queries
7. **Archive/unarchive conflicts**: Throw `ConflictException` for invalid state transitions
8. **Archived task exclusion**: Cannot start time entry with archived task
9. **Task-Activity mismatch**: Cannot link time entry to task from different activity
10. **Cascade behavior**: Deleting activity cascades to tasks
11. **Time entry FK**: Deleting task sets `taskId` to NULL on linked entries
12. **Timestamp storage**: All timestamps stored as ISO 8601 strings
13. **DTO validation**: `@MaxLength(255)` on name—enforced at DTO level

---

## Dependencies
```json
"drizzle-orm": "^0.44.7",
"uuid": "^13.0.0",
"class-validator": "^0.14.2",
"class-transformer": "^0.5.1"
```
