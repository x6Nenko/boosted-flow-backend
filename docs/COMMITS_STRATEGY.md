# Commit title guidelines / strategy tips

## Use Conventional Commits

Use Conventional Commits: Type(scope): short summary

- Types: feat (feat is a feature), fix, refactor, chore, docs, test, perf
- Scope: small, lowercase, single word (e.g., auth, deps, time-entries)
- Example: feat(auth): add JwtStrategy for JWT validation

## Commit titles and body

- Keep titles short (~50 characters) and imperative ("Add", "Remove", "Refactor").
- Include a body for complex changes:
  - What changed, why, and the impact (e.g., DB or API contract changes).
  - One-line summary followed by bullet points if needed.

- Prefer atomic commits: each commit should implement a single logical change.
- Separate dependency updates from feature code; subject lines: chore(deps): bump/add <package>.

## Refactors and security

For refactors that change behavior (e.g., token payload change):
  - Mark as refactor:; if it’s breaking, add BREAKING CHANGE in the footer or use feat!:
  - Add tests or e2e changes in the same PR/commit (or separate if large).

For security-related changes: use security: or fix: + scope, and mention in the body.

Include issue or task IDs when relevant (e.g., (#123)).