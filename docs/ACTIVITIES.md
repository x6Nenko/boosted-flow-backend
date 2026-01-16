# Activities Feature

## High-Level Purpose
Activity tracking with soft-delete archiving and required time-entry linkage for skill development.

---

## Architectural Map
```
src/
├── activities/
│   ├── activities.module.ts      # Feature module, exports ActivitiesService
│   ├── activities.controller.ts  # HTTP endpoints (CRUD, archive/unarchive)
│   ├── activities.service.ts     # Business logic, CRUD operations
│   └── dto/
│       ├── create-activity.dto.ts    # Validation: name (max 255 chars)
│       ├── update-activity.dto.ts    # Validation: optional name
│       └── index.ts                  # DTO exports
└── database/schema/
    ├── activities.ts             # Activity table definition
    ├── time-entries.ts           # Updated: activityId required FK
    └── relations.ts              # User → Activities, Activities → TimeEntries
```

---

## Data Flow

### Create Activity
1. `POST /activities` → `CreateActivityDto` validates name (max 255 chars)
2. `@CurrentUser()` extracts `{ userId: string }` from request
3. `ActivitiesService.create()` → generates UUID
4. Inserts into `activities` table with `archivedAt: null`
5. Response: Full `Activity` object

### List Activities
1. `GET /activities?includeArchived=false`
2. `ActivitiesService.findAll()` → builds query with conditional `archivedAt IS NULL`
3. Filters: `userId` (always), `archivedAt` (optional)
4. Uses index: `idx_activities_user_archived`
5. Response: Array of `Activity` objects, sorted by `createdAt DESC`

### Update Activity
1. `PATCH /activities/:id` → `UpdateActivityDto` validates optional name
2. `ActivitiesService.update()` → verifies ownership via `findById()`
3. Updates `name` and `updatedAt` timestamp
4. Response: Updated `Activity`

### Archive Activity
1. `POST /activities/:id/archive` → no body required
2. `ActivitiesService.archive()` → verifies ownership + checks not already archived
3. Sets `archivedAt` to current ISO timestamp
4. Response: Updated `Activity` with `archivedAt` populated

### Unarchive Activity
1. `POST /activities/:id/unarchive` → no body required
2. `ActivitiesService.unarchive()` → verifies ownership + checks is archived
3. Sets `archivedAt` to `null`
4. Response: Updated `Activity` with `archivedAt: null`

---

## Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Protected Routes** | All endpoints require authentication (global `AuthGuard`) |
| **Custom Param Decorator** | `@CurrentUser()` extracts user from request |
| **Rate Limiting** | `@Throttle({ default: { limit: 10, ttl: 60000 } })` on mutations (create, update, archive, unarchive) |
| **Ownership Validation** | Service always filters by `userId` from JWT—no cross-user access |
| **Soft Delete Only** | `archivedAt` timestamp—no hard delete exposed via API |
| **Cascade Delete** | `onDelete: 'cascade'` on `userId` FK—user deletion removes activities |
| **Activity-Required Time Entries** | TimeEntriesService validates `activityId` before insert |
| **Dynamic Query Building** | `findAll` uses conditional `isNull(archivedAt)` filter |

---

## Public Interface

### ActivitiesController (`/activities`)
```typescript
@Post()                create(@CurrentUser() user, @Body() dto: CreateActivityDto): Promise<Activity>
@Get()                 findAll(@CurrentUser() user, @Query('includeArchived') include?: string): Promise<Activity[]>
@Get(':id')            findOne(@CurrentUser() user, @Param('id') id: string): Promise<Activity>
@Patch(':id')          update(@CurrentUser() user, @Param('id') id, @Body() dto: UpdateActivityDto): Promise<Activity>
@Post(':id/archive')   archive(@CurrentUser() user, @Param('id') id: string): Promise<Activity>
@Post(':id/unarchive') unarchive(@CurrentUser() user, @Param('id') id: string): Promise<Activity>
```

### ActivitiesService
```typescript
create(userId: string, name: string): Promise<Activity>
findAll(userId: string, includeArchived?: boolean): Promise<Activity[]>
findById(userId: string, id: string): Promise<Activity>  // Throws NotFoundException if not found
update(userId: string, id: string, data: { name?: string }): Promise<Activity>
archive(userId: string, id: string): Promise<Activity>  // Throws ConflictException if already archived
unarchive(userId: string, id: string): Promise<Activity>  // Throws ConflictException if not archived
```

### Activity Type
```typescript
type Activity = typeof activities.$inferSelect
// { id, userId, name, archivedAt, createdAt, updatedAt }
```

---

## Database Schema

### `activities`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| userId | TEXT FK | References `users.id`, cascade delete |
| name | TEXT | NOT NULL, max 255 chars (DTO enforced) |
| archivedAt | TEXT | ISO timestamp, NULL = active |
| createdAt | TEXT | ISO timestamp |
| updatedAt | TEXT | ISO timestamp |

### Relations
- `users` → `activities`: One-to-Many
- `activities` → `user`: Many-to-One
- `activities` → `tasks`: One-to-Many (cascade delete)
- `activities` → `timeEntries`: One-to-Many (cascade delete)
- `timeEntries` → `activity`: Many-to-One (required)

---

## "Gotchas" & Rules

1. **Soft delete only**: UI uses `archivedAt` timestamp—never hard delete via API
2. **Activity typing**: Use `typeof activities.$inferSelect` for `Activity` type (Drizzle pattern)
3. **User shape in controller**: `@CurrentUser()` returns `{ userId: string }`—use `user.userId`
4. **Ownership enforcement**: Service always includes `userId` in queries—never trust client-provided userId
5. **Archive/unarchive conflicts**: Throw `ConflictException` for invalid state transitions
6. **Update behavior**: Only `name` is mutable via `PATCH`
7. **Timestamp storage**: `createdAt`, `updatedAt`, `archivedAt` stored as ISO 8601 strings in SQLite TEXT columns
8. **Required activityId**: Time entries cannot be created without valid activity ownership
9. **Archived validation**: `findById()` checks if activity is archived—cannot track time against archived activities
10. **Cascade behavior**: Deleting activity cascades to time entries (exceptional case—archive is normal flow)
11. **Index usage**: Multi-column `idx_activities_user_archived` for "active activities" query
12. **DTO validation**: `@MaxLength(255)` on name—enforced at DTO level, not database constraint

---

## Dependencies
```json
"drizzle-orm": "^0.44.7",
"uuid": "^13.0.0",
"class-validator": "^0.14.2",
"class-transformer": "^0.5.1"
```
