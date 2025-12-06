# Testing Strategy

## What to Test Where

**Unit Tests** (`.spec.ts`)
- Pure functions with complex logic (algorithms, calculations, regex)
- No HTTP, no database, no external dependencies
- Example: Password strength validator, date formatter

**E2E Tests** (`.e2e-spec.ts`)
- Everything else: Controllers, Services with DB, Guards, Full flows
- Use a real test database (in-memory or separate instance)
- Example: POST /auth/register with real DB writes

## Rules

1. **Default to E2E.** If unsure, write an E2E test.
2. **Only write unit tests when E2E would be slow.** (It rarely is.)
3. **Never mock the database.** Use a test DB.
4. **Never unit test controllers.** They're just HTTP glue.
5. **One E2E file per domain** (auth, users, tasks). Use `describe()` blocks for organization.
6. **Don't test the framework.** focus on the app logic
7. **Check status codes, not messages.** Avoid asserting specific error messages unless critical for user experience.

## File Structure

- auth.service.spec.ts ← Unit test (only if complex logic)
- auth.e2e-spec.ts ← All HTTP + DB tests here