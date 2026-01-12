# Tags Feature

## High-Level Purpose
User-scoped tags for categorizing time entries, with smart get-or-create lookup and many-to-many relationship support.

---

## Architectural Map
```
src/
├── tags/
│   ├── tags.module.ts            # Feature module, exports TagsService
│   ├── tags.controller.ts        # HTTP endpoints (findAll, getOrCreate, delete)
│   ├── tags.service.ts           # Business logic, deduplication, entry linking
│   └── dto/
│       ├── create-tag.dto.ts         # Validation: name (max 50 chars)
│       ├── get-or-create-tags.dto.ts # Validation: names array (max 3)
│       └── index.ts                  # DTO exports
└── database/schema/
    ├── tags.ts                   # Tag table + time_entry_tags junction table
    └── relations.ts              # Tags ↔ TimeEntryTags ↔ TimeEntries
```

---

## Data Flow

### List Tags
1. `GET /tags` → no body/params required
2. `@CurrentUser()` extracts `{ userId: string }` from request
3. `TagsService.findAll()` → returns all tags for user
4. Response: Array of `Tag` objects, sorted by `name ASC`

### Get or Create Tags
1. `POST /tags/get-or-create` → `GetOrCreateTagsDto` validates names array (max 3)
2. `TagsService.getOrCreate()` → normalizes names (lowercase, trim)
3. Finds existing tags matching normalized names
4. Creates missing tags with UUID
5. Response: Array of all `Tag` objects (existing + new)

### Delete Tag
1. `DELETE /tags/:id` → no body required
2. `TagsService.delete()` → verifies ownership
3. Deletes tag (cascade removes from time_entry_tags)
4. Response: `204 No Content`

### Link Tags to Entry (via TimeEntriesService)
1. `PATCH /time-entries/:id` with `tagIds` array
2. `TagsService.setEntryTags()` → verifies all tags belong to user
3. Deletes existing entry tags → inserts new ones
4. Response: Updated `TimeEntry` (tags fetched separately via relation)

---

## Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Protected Routes** | All endpoints require authentication (global `AuthGuard`) |
| **Custom Param Decorator** | `@CurrentUser()` extracts user from request |
| **Rate Limiting** | `@Throttle({ default: { limit: 10, ttl: 60000 } })` on mutations |
| **Ownership Validation** | Service always filters by `userId` from JWT |
| **Deduplication** | `getOrCreate` normalizes names and checks existing before insert |
| **Max Tags Limit** | DTO enforces max 3 tags per request |
| **Cascade Delete** | Deleting tag removes all time_entry_tags references |
| **Replace Strategy** | `setEntryTags` replaces all tags (delete + insert) |

---

## Public Interface

### TagsController (`/tags`)
```typescript
@Get()                    findAll(@CurrentUser() user): Promise<Tag[]>
@Post('get-or-create')    getOrCreate(@CurrentUser() user, @Body() dto: GetOrCreateTagsDto): Promise<Tag[]>
@Delete(':id')            delete(@CurrentUser() user, @Param('id') id: string): Promise<void>
```

### TagsService
```typescript
findAll(userId: string): Promise<Tag[]>
getOrCreate(userId: string, names: string[]): Promise<Tag[]>
delete(userId: string, id: string): Promise<void>
setEntryTags(userId: string, timeEntryId: string, tagIds: string[]): Promise<void>  // Called by TimeEntriesService
```

### Tag Type
```typescript
type Tag = typeof tags.$inferSelect
// { id, userId, name, createdAt }
```

---

## Database Schema

### `tags`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| userId | TEXT FK | References `users.id`, cascade delete |
| name | TEXT | NOT NULL, max 50 chars (DTO enforced) |
| createdAt | TEXT | ISO timestamp |

### `time_entry_tags`
| Column | Type | Notes |
|--------|------|-------|
| timeEntryId | TEXT PK | Composite PK, references `time_entries.id`, cascade delete |
| tagId | TEXT PK | Composite PK, references `tags.id`, cascade delete |

### Relations
- `users` → `tags`: One-to-Many
- `tags` → `user`: Many-to-One
- `tags` ↔ `timeEntries`: Many-to-Many (via `time_entry_tags`)

---

## "Gotchas" & Rules

1. **Name normalization**: Names are lowercased and trimmed before storage
2. **Max 3 tags**: DTO enforces limit on `getOrCreate` and `update` operations
3. **Replace semantics**: `setEntryTags` replaces all tags, not append
4. **Ownership enforcement**: Tags are user-scoped, no cross-user access
5. **Tag typing**: Use `typeof tags.$inferSelect` for `Tag` type (Drizzle pattern)
6. **Cascade behavior**: Deleting user or tag cascades to junction table
7. **No update endpoint**: Tags are immutable; delete and recreate if needed
8. **Empty array clears tags**: Passing `[]` to `setEntryTags` removes all tags

---

## Dependencies
```json
"drizzle-orm": "^0.44.7",
"uuid": "^13.0.0",
"class-validator": "^0.14.2",
"class-transformer": "^0.5.1"
```
