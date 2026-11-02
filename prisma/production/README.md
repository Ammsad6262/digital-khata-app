# Production DDL — how to apply

The `prisma/migrations/` folder is now a working, single **Postgres baseline**
plus two additive migrations. Fresh databases can be created with
`prisma migrate deploy`. An **existing** database (the live one) must be brought
up to date with the additive deltas in this folder, then baselined once.

Every file here is **additive** and **idempotent** (`IF NOT EXISTS` / guarded
foreign keys). None of them delete or rewrite rows.

---

## ⚠️ Read this first

The current code reads and writes `"Transaction"."voidedAt"`. If the app is
deployed **before** the DDL is applied, voiding a sale/payment/expense/stock
move/supplier payment fails. **Apply the DDL before (or together with) the code
deploy.**

The AI tables (`AIUsageDaily`, `AssistantAction`, `AssistantThread`) are safe
either way: the runtime falls back to an in-memory copy when they are missing.

---

## 1. Apply the pending deltas, in this order

If `20261020_stage2_3_delta.sql` was already applied, re-running it is harmless
(idempotent) — just run the whole list.

| # | File |
|---|---|
| 1 | `20261020_stage2_3_delta.sql` |
| 2 | `20261023_follow_ups.sql` |
| 3 | `20261023_sale_discount.sql` |
| 4 | `20261023_sale_due_date.sql` |
| 5 | `20261024_audit_log.sql` |
| 6 | `20261024_customer_company.sql` |
| 7 | `20261025_password_reset_codes.sql` |
| 8 | `20261025_purchase_due_date.sql` |
| 9 | `20261102_ai_assistant_tables.sql` |
| 10 | `20261102_transaction_voided_at.sql` |

### Option A — psql (one command)

Use the **direct** URL (`DIRECT_URL`), not the pooler:

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 \
  -f prisma/production/20261020_stage2_3_delta.sql \
  -f prisma/production/20261023_follow_ups.sql \
  -f prisma/production/20261023_sale_discount.sql \
  -f prisma/production/20261023_sale_due_date.sql \
  -f prisma/production/20261024_audit_log.sql \
  -f prisma/production/20261024_customer_company.sql \
  -f prisma/production/20261025_password_reset_codes.sql \
  -f prisma/production/20261025_purchase_due_date.sql \
  -f prisma/production/20261102_ai_assistant_tables.sql \
  -f prisma/production/20261102_transaction_voided_at.sql
```

### Option B — Supabase SQL editor

Open each file above **in order** and run it. Each is idempotent, so a failure
mid-way is safe to retry from the beginning.

---

## 2. Verify

```sql
-- the three assistant tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('AIUsageDaily','AssistantAction','AssistantThread');

-- the soft-void column exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'Transaction' AND column_name = 'voidedAt';
```

Both must return the expected rows before you baseline.

---

## 3. Baseline the live database (once)

After step 1, the live DB matches `prisma/schema.prisma`. Record that fact so
Prisma Migrate knows the history is already present:

```bash
# mark the baseline as already applied — does NOT run the baseline SQL
npx prisma migrate resolve --applied 20260101000000_baseline

# apply + record the two additive migrations (idempotent no-ops on the live DB)
npx prisma migrate deploy

npx prisma migrate status   # -> "Database schema is up to date!"
```

`prisma migrate deploy` uses `DIRECT_URL` (session mode), which is the right
connection for DDL.

Alternative to `migrate deploy`: if you would rather not run it, mark the two
additive migrations applied as well:

```bash
npx prisma migrate resolve --applied 20261102000000_add_ai_assistant_tables
npx prisma migrate resolve --applied 20261102000100_add_transaction_voided_at
```

---

## 4. From now on

- New schema changes: edit `prisma/schema.prisma`, then
  `npx prisma migrate dev --name <what_changed>`, and commit the new folder.
- Deploy with `npx prisma migrate deploy`.
- This is mirrored locally: `npx prisma migrate reset` rebuilds the dev DB from
  the migrations alone (verified: repo migrations reproduce `schema.prisma`
  exactly).

---

## Notes on the old history

The previous `prisma/migrations/*` files were **SQLite DDL** (`DATETIME`,
`DECIMAL`) and could never run on Postgres. They have been replaced by
`20260101000000_baseline`, which is real Postgres DDL generated from
`schema.prisma`. The old files remain in git history if ever needed.
