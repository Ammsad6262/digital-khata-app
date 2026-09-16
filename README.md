# Digital Khata

A mobile-first web app for small wholesale businesses — replaces paper khata
registers with auto-calculated customer balances, stock, sales, payments,
and expenses.

Built for one-handed phone use. No accounting knowledge required.

---

## ✨ Features

- **Dashboard** — total receivables, today's sales/payments/expenses, low-stock alerts, recent activity feed
- **Customer Khata** — per-customer account with running balance, search by name/phone
- **Sales** — multi-product sale entry, auto stock deduction, partial/full/credit payments
- **Payments** — fast entry, 6 methods (Cash/Bank/Cheque/JazzCash/EasyPaisa/Other), overpayment creates advance credit
- **Products + Stock** — current stock derived from movements, low-stock thresholds, write-off adjustments
- **Expenses** — 7 categories (transport/shop/electricity/packaging/salary/rent/other)
- **Transaction History** — unified feed with date + type filters + custom date range
- **Backup & Export** — full JSON backup/restore + per-table CSV export
- **Settings** — business name, currency (8 presets + custom), theme picker, PIN lock, data management
- **Themes** — Default Green + Bright Leaf (#CDFF9B + #203D43)
- **Security** — HMAC-signed session auth, rate-limited PIN unlock (5 attempts / 5 min)

## 🎯 Core data relationships

| Action | Automatic side effects |
|---|---|
| **Sale** | Customer balance ↑ · Stock ↓ · Linked payment created (if paid) |
| **Payment** | Customer balance ↓ · Linked sale's paidAmount updated |
| **Stock addition** | Stock ↑ · Movement recorded |
| **Stock adjustment** | Stock ± · Reason required (audit trail) |
| **Expense** | Expense total ↑ · No effect on customer or stock |

All balances and stock quantities are **derived from transactions** — never
manually edited. Voiding (not deleting) preserves the audit trail.

## 📱 Navigation

```
Dashboard | Khata | Sales | Stock | More
                              └── Customers, Products, Expenses,
                                  Transactions, Settings
```

## 🚀 Quick start

```bash
npm install
npm run db:migrate      # create SQLite DB + run migrations
npm run db:seed         # load realistic sample data (optional)
npm run dev             # http://localhost:3000
```

Optional test suite:

```bash
npm run test:foundation # 17 atomic-operation tests
npm run test:audit      # 17 data-integrity tests
npm run test:e2e        # 64 end-to-end tests (requires dev server running)
```

## 🧱 Tech stack

- **Next.js 14** (App Router) + TypeScript (strict)
- **Tailwind CSS** (CSS-variable theming)
- **Prisma** + SQLite (V1) → Postgres-ready (Supabase-compatible)
- **TanStack Query** for client data + cache invalidation
- **React Hook Form** + **Zod** schemas (shared client/server validation)
- **Web Crypto API** HMAC sessions (Edge-runtime compatible)
- **bcryptjs** for PIN hashing

## 🗂️ Project layout

```
src/
├── app/                # Next.js App Router pages + API routes
│   ├── api/            # REST endpoints (auth, customers, sales, ...)
│   └── (routes)/       # /dashboard, /khata, /sales, /stock, /more/*
├── components/         # UI components by feature
├── hooks/              # React Query wrappers
├── lib/
│   ├── auth/           # session.ts, pin.ts, rate-limiter.ts
│   ├── db/             # prisma.ts (singleton)
│   ├── errors/         # AppError hierarchy
│   ├── schemas/        # Zod schemas (shared client + server)
│   ├── services/       # business logic (single source of truth)
│   └── utils/          # money, date, decimal, api client
├── providers/          # query, toast, theme, auth-gate
└── middleware.ts       # session enforcement on /api/*
```

Architecture + schema docs live in [`docs/`](./docs).

## 🚢 Deploying to Vercel / Supabase

The app is built on SQLite for V1, which doesn't work on Vercel's serverless
runtime (no persistent filesystem). To deploy:

1. **Switch to Postgres** — change `provider = "sqlite"` to `provider = "postgresql"`
   in `prisma/schema.prisma`, then `npx prisma migrate deploy`.
2. **Create a Supabase project** at https://supabase.com → grab the connection string.
3. **Set env vars in Vercel**:
   - `DATABASE_URL` = `postgresql://...` (from Supabase)
   - `SESSION_SECRET` = 32+ random chars (`openssl rand -base64 32`)
4. **Push to GitHub** → import the repo into Vercel → deploy.

The Prisma schema uses `Decimal` types that are Postgres-compatible — no
schema changes needed beyond the `provider` line.

## 📋 V1 scope

Built intentionally **without**: receipts, payroll, employee management,
advanced accounting, AI features, loyalty programs, online payments,
multi-business, customer logins, complex permissions, analytics dashboards,
or notifications. These are reserved for V2.

## 🔒 Security model (V1)

- **Single owner, single device** — no multi-user, no customer logins
- **PIN lock** (optional) — 4-6 digits, bcrypt hashed, gates destructive actions
- **HMAC session cookie** — HttpOnly + SameSite=Strict + Secure (production)
- **Rate-limited PIN unlock** — 5 failed attempts → 5-minute lockout per IP
- **All API routes require session** (except `/api/auth/*` and `/api/health`)
- **All inputs validated server-side** via Zod schemas
- **All queries use Prisma's parameterized API** — no SQL injection
- **No `dangerouslySetInnerHTML`** with user input
- **CSV exports defend against formula injection**

## License

Private — built for a single wholesale business.
