# Database operations

Production database: Supabase Postgres 17, `db.ywmddhvenvrcgihodmdg.supabase.co`,
database `postgres`. Connection strings live only in `.env.local` (gitignored)
and in Vercel's environment variables. Never commit them or paste them into
issues.

All scripts read `DATABASE_URL` from `.env.local` and are **read-only unless
explicitly told otherwise**.

| Command | What it does |
| --- | --- |
| `npm run db:verify` | exact row counts, users by domain, orphan rows, required indexes, money/ledger sanity. Read-only. |
| `npm run db:drift` | compares the live schema with the Prisma baseline; lists missing constraints and indexes. Read-only. |
| `npm run db:backup` | writes every table plus indexes/constraints to a timestamped JSON file in the OS temp folder. Read-only. |
| `npm run db:cleanup` | **dry run** of the test-account cleanup and schema repair. |
| `npm run db:cleanup -- --apply` | deletes known test accounts, orphan rows, repairs indexes and foreign keys. |

## Rules

1. **Back up before any write.** `npm run db:backup` and keep the printed
   SHA256 with the file.
2. **Audit before deleting.** `npm run db:cleanup` prints exactly which domains
   are kept and which are deleted, and aborts on an unknown email domain or if a
   test-domain account holds an owner grant.
3. **Only `gmail.com` accounts are production accounts.** `example.com`,
   `e.com`, `test.com`, `internal.local` and `dukhata-qa.test` are automated
   test data. Add a new keeper domain to `KEEP_DOMAINS` in
   `scripts/db-cleanup.ts` before it can be preserved.
4. **Schema changes go through Prisma.** Edit `prisma/schema.prisma`, then
   `npx prisma migrate dev --name …`, and deploy with `npx prisma migrate deploy`.
   The hand-written files in `prisma/production/` exist only to bring the
   pre-baseline live database up to date.

## History

On 2026-11-16 the live database held 165 accounts, 162 of them automated test
accounts, 171 active trials, 26 orphan subscriptions and 22 orphan settings,
and it was missing the `Setting(userId)` unique index plus six foreign keys.
The missing unique index is what made settings/PIN saves return 500; the
missing foreign keys are why deleted accounts left rows behind.

`npm run db:cleanup -- --apply` removed the 162 test accounts (cascading their
customers, sales, payments, products and stock moves), dropped the orphan rows,
recomputed `RedeemCode.redemptionCount`, and added the missing indexes and
foreign keys from `prisma/production/20261116_integrity_repair.sql`. The
pre-cleanup snapshot is a JSON file in the OS temp folder.

The three production accounts are:

| Email | Name | Notes |
| --- | --- | --- |
| `ammsad6262@gmail.com` | Ammsad | owner, has real business data |
| `sadatrehman2004@gmail.com` | Sad | owner |
| `cookish.fyp@gmail.com` | Ghund | no data yet |

## Password rotation

The Supabase database password was shared in plain text during setup. Rotate it
in Supabase (Project Settings → Database → Reset database password) and update
`.env.local` **and** the Vercel environment variables together. Remember to
URL-encode `$` as `%24` in `.env.local`.
