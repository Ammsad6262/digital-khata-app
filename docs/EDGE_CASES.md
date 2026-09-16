# Edge Cases & Decisions — Digital Khata & Wholesale Business App (V1)

> Catalogued before we start coding so we don't make ad-hoc decisions in the middle of writing features. Each item has a **decision** so Phase 2+ knows what to build.

---

## 1. Money & Numeric Precision

| Case | Decision |
|---|---|
| Money values | `Decimal(12, 2)` everywhere — DB column type, Prisma type, TS type (`Decimal` from `prisma`). Never `number` / `float` for stored money. |
| Quantities | `Decimal(10, 3)` — wholesale sells by kg, box, dozen; fractional quantities are common. |
| Currency symbol | Stored in `Setting.currencySymbol` (default `"Rs."`). Display helper formats as `Rs. 1,234.50`. |
| Rounding | Round to 2 decimals **only at display time**. Internal math keeps full precision. |
| Negative numbers in money | Allowed — represents customer credit (advance payment) or negative expense (refund). |

---

## 2. Customer

| Case | Decision |
|---|---|
| Duplicate phone numbers | **Blocked** — `phone` is `@unique`. UI shows "A customer with this phone already exists." |
| Customer with no phone | Allow empty phone in V1? **No** — phone is the primary identifier and search key. Make it required. |
| Editing customer info | Allowed freely; doesn't affect transactions. |
| Deleting a customer with transactions | **Blocked**. Provide `isDeleted` soft-delete flag for future use, but in V1 just disable the delete button if any sale/payment exists. |
| Customer pays more than outstanding | **Allowed**. Balance goes negative. UI shows "Advance payment: Rs. X" instead of "Outstanding: Rs. X". |
| Customer with same name | Allowed — names are not unique. The owner distinguishes by phone. |

---

## 3. Sale

| Case | Decision |
|---|---|
| Sale with zero items | **Blocked** by Zod schema — must have ≥ 1 item. |
| Sale with negative quantity | **Blocked**. |
| Sale with negative unit price | **Blocked**. |
| Sale with `paidAmount > totalAmount` | **Blocked** by Zod schema. The owner can't pay more than the sale total at sale time. If they want to record an extra payment later, use the Payment screen. |
| Sale with `paidAmount = 0` | Allowed — pure credit sale. Outstanding = total. |
| Editing a sale after creation | **Allowed in V1** — recomputes `totalAmount`, `paidAmount`, `outstanding`. SaleItem rows are replaced. Stock moves are recomputed. |
| Deleting a sale | **Blocked** in V1. Provide a **Void** action instead — sets `voidedAt`, which excludes it from balance calculations but preserves audit history. |
| Voiding a sale that already had payments | **Allowed** — sale is marked void, but the payments remain as customer-level credits (they reduce the customer's overall balance). UI warns: "This sale had Rs. X in payments; voiding will leave that as advance credit on the customer's account." |
| Backdating a sale | **Allowed** — owner can set `date` to any past value. Useful for end-of-day entry. |
| Sale to a deleted customer | **Blocked** — UI doesn't show deleted customers in the picker. |
| Concurrent edits to the same sale | Single-user V1, so not a concern. If we add multi-user later, use `updatedAt`-based optimistic locking. |

---

## 4. Payment

| Case | Decision |
|---|---|
| Payment of 0 amount | **Blocked** by Zod. |
| Negative payment | **Blocked**. To reverse a payment, void it. |
| Payment to a customer with zero outstanding | **Allowed** — creates negative balance (advance). |
| Payment method | One of: `cash`, `bank`, `cheque`, `jazzcash`, `easypaisa`, `other`. Stored as string, picker in UI. |
| Editing a payment | **Allowed in V1** — amount, method, date, notes can all change. |
| Deleting a payment | **Blocked** in V1. Void it instead (sets `voidedAt`). |
| Cheque that bounces | Out of scope for V1 — owner can void the payment manually. |

---

## 5. Product & Stock

| Case | Decision |
|---|---|
| Duplicate SKU | **Blocked** — `sku` is `@unique` (if provided). SKU is optional. |
| Selling more than available stock | **Warned but allowed**. UI shows "Stock is at 3, you're selling 10 — proceed?" — owner confirms. |
| Stock goes negative | **Allowed** — represents "sold from incoming stock". Dashboard shows red badge but no block. |
| Editing a product's price | **Allowed** — doesn't affect past sales (SaleItem stores `unitPrice` at time of sale). Future sales use new price. |
| Deleting a product with sale/stock history | **Blocked**. Soft-delete via `isDeleted`. |
| Low stock threshold | Per-product, default 5. Owner can change per product. |
| Stock adjustment reason | Optional text field. Encouraged but not required. |
| Unit cost on stock purchase | Optional. Used later for profit calculations (not in V1 dashboard but stored for V2). |
| Manual stock recount | Use `StockMove` with `type = "adjustment"` and signed quantity to bring stock to the correct number. Original moves are preserved for audit. |

---

## 6. Expense

| Case | Decision |
|---|---|
| Negative expense | **Blocked** in the form. (For refunds, owner can record as negative in a later phase.) |
| Editing / deleting an expense | **Allowed** in V1 (no audit requirement to void). Owner can delete freely. |
| Expense category | One of: `transport`, `shop`, `electricity`, `packaging`, `salary`, `rent`, `other`. Stored as string. |
| Future expense date | **Blocked** — `date` cannot be in the future. |

---

## 7. Dashboard & Aggregates

| Case | Decision |
|---|---|
| "Today" definition | User's local timezone (Asia/Karachi by default, configurable in settings later). |
| Dashboard data freshness | React Query `staleTime: 30s`. Manual refetch on dashboard focus. |
| Recent transactions list | Limit 10. Mix of sales, payments, expenses, stock moves — sorted by date desc. |
| Total receivables | `SUM(sale.outstanding)` across all non-voided sales. |
| Today's sales | `SUM(sale.totalAmount)` where `sale.date` is today. |
| Today's payments | `SUM(payment.amount)` where `payment.date` is today. |
| Today's expenses | `SUM(expense.amount)` where `expense.date` is today. |
| Current stock overview | Count of products where `currentStock <= lowStockThreshold`. Tappable → stock screen. |

---

## 8. Search

| Case | Decision |
|---|---|
| Search scope | Customers (by name/phone) + Products (by name/SKU). Single search box on dashboard. |
| Min query length | 2 characters. |
| Result limit | 20 per type. |
| No match | Show "No results" + suggestion to create new customer/product. |

---

## 9. Backup / Export / Import

| Case | Decision |
|---|---|
| Export formats | **JSON** (full backup, includes all tables + relations) + **CSV per table** (for Excel viewing). XLSX optional via SheetJS. |
| Import format | **JSON only** (full restore). CSV import is risky (no relations) — not in V1. |
| Import collision strategy | "Replace all" — wipe DB then insert. UI shows scary confirmation: "This will erase all current data and replace it with the backup." |
| Backup file location | Browser download (no server-side storage in V1). |
| Auto-backup | **Not in V1** — owner manually exports. V2 can add scheduled cloud backup. |
| Backup encryption | **Not in V1** — JSON is plain text. Recommend owner keep backups private. |

---

## 10. Security / Auth

| Case | Decision |
|---|---|
| Auth model | Single owner, PIN-based. Hashed with bcrypt, stored in `Setting.ownerPinHash`. |
| PIN length | 4–6 digits. |
| Session | HttpOnly cookie, 24h expiry. |
| Forgot PIN | V1: owner can reset by clearing the `Setting.ownerPinHash` row directly in the DB (documented for the dev). V2: security question / email recovery. |
| API auth | Every `/api/*` route (except `/api/auth/*`) requires valid session cookie. |
| CSRF | Next.js built-in CSRF tokens on mutations. |
| Rate limiting | **Not in V1** — single user. |

---

## 11. UI / UX Edge Cases

| Case | Decision |
|---|---|
| Empty states | Every list screen shows a friendly empty state with a CTA ("No customers yet — add your first customer"). |
| Loading states | Skeleton screens, not spinners. |
| Error states | Toast notification with retry button. |
| Offline | **Not in V1**. If the network fails, show toast "Network error, please retry." Optimistic updates roll back. |
| Long customer / product lists | Virtualized list if > 200 rows. (Use `react-virtual` if needed.) |
| Number input | Use `<input type="number" inputmode="decimal">` for mobile keyboard. |
| Date input | Use `<input type="date">` for native mobile picker. |
| Long-press to delete | Not in V1 — explicit delete buttons in detail views only. |
| Confirmation dialogs | Used for: void sale, void payment, delete customer/product, restore backup. |

---

## 12. Performance

| Case | Decision |
|---|---|
| Dashboard load time target | < 500ms on a mid-tier phone. |
| Sale creation target | < 200ms server round-trip. |
| Customer list with 1000 customers | Should scroll smoothly — virtualize if needed. |
| Stock computation | Per-product `getProductStock()` is two aggregate queries. For the stock overview screen with N products, batch this into one raw SQL query rather than N+1. |

---

## 13. Data Integrity

| Case | Decision |
|---|---|
| Sale creation fails mid-way | Wrap in `prisma.$transaction()` — Sale + SaleItems + Payment + StockMoves all succeed or all roll back. |
| Payment creation fails | Single insert, transactional. |
| Import restore fails mid-way | Run inside a single transaction. If any insert fails, whole import is rolled back. |
| Decimal precision loss in JSON serialization | Use `Decimal.toJSON()` or convert to string in API responses; parse back on client. |

---

## 14. Future-Proofing (V2 hooks, not built in V1)

- `isDeleted` flag on Customer and Product — ready for soft-delete UI later.
- `voidedAt` on Sale and Payment — already supports void semantics.
- `Setting` table is a singleton now — can hold arbitrary key/value settings in V2.
- `StockMove.unitCost` — stored now for V2 profit reporting.
- `Payment.saleId` — optional link now, enables sale-level payment tracking in V2.
- All tables ready for `businessId` column if multi-business is added later.

---

**If a case isn't covered here, default to the simplest user-friendly behavior and add it to this document.**
