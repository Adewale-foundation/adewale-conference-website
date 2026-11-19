# Working in this repo

The ASC portal: a public site plus a portal for schools, students and admins.
Next.js App Router with React Server Components, Supabase/Postgres with RLS,
Server Actions. News, past editions and the gallery are content in `src/lib/`.

**Read [docs/review-checklist.md](docs/review-checklist.md) before changing
anything and again before declaring done.** It is the accumulated list of ways
this codebase has gone wrong, with the worked cases. What follows is the short
version.

## The three rules that cause the most damage when broken

1. **Read `.env` before you run anything.** There are three databases: `.env`
   points at the dev Supabase project, `.env.prod` at **production**, and the
   Supabase CLI keychain token reaches a different personal project. Never
   assume which one a command will hit.
2. **Migrations are the owner's to run.** Write the file, say which environments
   still need `npm run db:push` / `npm run db:push:prod`, and stop. Never edit a
   migration that has already been applied — `db push` will not replay it, and
   the database silently falls behind the code. Check the timestamp is unused
   before naming a migration — `schema_migrations` is keyed on it, and a
   collision rolls the second file back.
3. **Check `error` on every Supabase call.** `const { data } = await …` discards
   the reason and turns a missing column into an empty page or a 404.

## Commands

```bash
npm run dev              # the owner runs this; ask them to refresh
npx tsc --noEmit         # the real gate — eslint is broken repo-wide
npm test                 # node:test via tsx; globs src/lib/*.test.ts ONLY
npm run check:normalizers
npm run build
```

## Where code goes

| | |
|---|---|
| `src/lib/` | Pure decisions, each with a `*.test.ts`. The only code `npm test` reaches — if it deserves a test, it lives here. |
| `src/app/(portal)/portal/` | Portal pages. `admin/`, `school/`, `student/` each have their own layout and sidebar. |
| `src/components/portal/` | Portal UI. Server components unless they need state. |
| `src/supabase/` | Client factories, `auth.ts` (`requireModuleView`, `requireManage`), shared types. |
| `supabase/migrations/` | `YYYYMMDDHHMMSS_slug.sql`, additive and idempotent. |
| `docs/adr/` | One ADR per architectural decision, with the rejected alternative. |

## Conventions

- TypeScript throughout, `@/` alias, camelCase in TS and snake_case in SQL.
- Reuse before adding — `chunk`, `parseCsvGrid`, `percent`, `resultForStage`,
  `bulkDecisionSummary`, `normalizeSchoolName`. The checklist lists them.
- **Comments are sparse.** One or two lines where a reader would otherwise ask
  "why is it like this" — a non-obvious constraint, a bug being prevented, a
  rejected alternative. Never restate the code, never narrate what the next line
  does, never write a paragraph where a clause will do. A block comment longer
  than the code it introduces belongs in an ADR or a commit message instead. The
  same goes for migrations: state the rule and the reason, not the essay.
- Every `SECURITY DEFINER` function needs `set search_path = public`, its own
  permission guard, and `revoke … from public, anon`.
- A form action must return a rendered result, or a rejected submit looks like
  the form wiped itself.
- Anything scoped to a competition year carries `edition_year`. A student row is
  **retagged** into the next edition rather than duplicated, so it keeps every
  past year's results — match on stage *and* edition.

## Commits

Short and descriptive. **No `Co-Authored-By` trailer.** This is a public repo:
scan the diff for secrets and for real student or school names before
committing — the repo has fictional fixtures, use those.

Risky changes stay uncommitted until the owner has tested them.
