# Database backups & restore

Supabase's free tier has no automated backup safety net — the schema is safe in
git (`supabase/migrations/`), but the **data** (registrations, students, attempts,
auth users) is not. The nightly GitHub Action closes that gap.

## What runs

[.github/workflows/nightly-backup.yml](../.github/workflows/nightly-backup.yml)
— every night at 02:00 UTC (03:00 WAT), and on demand via the "Run workflow"
button:

1. `pg_dump` of the **`public` + `auth` schemas** (app data + login accounts) in
   custom format, over the **Session pooler** connection.
2. Upload to `s3://<bucket>/adewale-portal/YYYY-MM-DD.dump`, SSE-encrypted.
3. Sanity check that the archive is readable (`pg_restore --list`).

## One-time setup

1. Create a private S3 bucket (block all public access). Uploads authenticate
   with **OIDC**, not a key: the job assumes
   `arn:aws:iam::846268246033:role/adewale-ci-backup`, whose policy allows only
   `s3:PutObject` + `s3:AbortMultipartUpload` on the bucket. Write-only by
   design — a compromised backup run can add objects but can neither read the
   existing dumps (they contain the Supabase `auth` schema) nor destroy them.
   `AbortMultipartUpload` is needed because `aws s3 cp` goes multipart above
   8 MB and a dump crosses that. The role's trust policy pins the subject with
   `StringEquals` on `repo:Adewale-foundation/adewale-conference-website:ref:refs/heads/main`
   — this repo is public, so a `StringLike` pattern or any subject admitting
   `pull_request` would let a fork's PR workflow assume the role. The pin is
   exact and case-sensitive: renaming the repo or moving it between orgs breaks
   the nightly run with `Not authorized to perform sts:AssumeRoleWithWebIdentity`
   until the subject is updated to match.
2. Add a **lifecycle rule** on the `adewale-portal/` prefix — e.g. expire objects
   after 30 days — so retention is automatic.
3. Set the repo secrets (Settings → Secrets and variables → Actions):
   `SUPABASE_DB_URL` (Session pooler URI — the same one in `.env`; the direct
   connection is IPv6-only and fails on GitHub runners), `AWS_REGION`,
   `S3_BACKUP_BUCKET`. There is deliberately **no** `AWS_ACCESS_KEY_ID` /
   `AWS_SECRET_ACCESS_KEY` secret — both were deleted in the credential
   migration; `id-token: write` in the workflow is what makes auth work. Don't
   recreate them.
4. Run the workflow manually once and confirm the object lands in the bucket.
5. In GitHub notification settings, make sure failed-workflow emails are on —
   a backup that silently stops running is the failure mode to fear.

## Restore

```bash
aws s3 cp s3://<bucket>/adewale-portal/<date>.dump backup.dump
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "<target Session-pooler DB URL>" backup.dump
```

- Restoring into a **fresh Supabase project**: run against the new project's
  pooler URL. `--clean` drops and recreates the app objects; Supabase-managed
  schemas (storage, realtime) are untouched because the dump only contains
  `public` + `auth`.
- After a restore into a new project: update the env vars (URL, keys,
  `SUPABASE_PROJECT_REF`), and re-run `npm run db:push` — it's a no-op if the
  dump already contains the schema, but confirms migration parity.
- Auth note: restored `auth.users` keep their password hashes — students'
  access codes and coordinators' passwords keep working. JWT signing keys are
  project-level, so live sessions from the old project are invalidated (users
  just sign in again).

## What's deliberately NOT in the dump

- **Sanity content** (guides, news, results): export separately when needed —
  `npx sanity dataset export production` (or rely on Sanity's hosted history).
- **Airtable**: already a second copy of registrations; export CSVs ad hoc.
- **Storage files**: none in Supabase Storage today (resources live on Sanity's
  CDN). Revisit if that changes.
