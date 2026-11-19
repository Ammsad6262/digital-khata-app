# Mobile API contract

How the native app (React Native) talks to the same backend as the web app.

There is **one backend**: `https://dukhata.com/api/*` (Next.js routes + Prisma +
Postgres). The native app is a thin client. No business rule — pricing, stock,
discounts, dues, entitlement, trial rules — is reimplemented on the phone.

## Authentication

Two carriers for the **same signed JWT** (`SESSION_SECRET`, 7-day expiry):

| Client | Request | Response |
| --- | --- | --- |
| Web browser | `Cookie: dk_auth_token=<jwt>` | `Set-Cookie: dk_auth_token=…; HttpOnly` |
| Native app | `Authorization: Bearer <jwt>` | `{ user, token }` when the request carries `x-client: mobile` |

- `POST /api/auth/login` and `POST /api/auth/register` return `token` in the
  body **only** when `x-client: mobile` is sent. A browser never receives the
  token in JavaScript, so `httpOnly` still protects it against XSS.
- The proxy (`src/proxy.ts`) and `getCurrentUserId()` accept either carrier.
  A Bearer value is used when present; otherwise the cookie.
- `GET /api/auth/me` also accepts the Bearer token — it is how the app
  rehydrates a session on launch.
- A forged or expired token gets `401` with the same body the web app sees,
  and an expired cookie is cleared.
- On logout the app simply deletes the token from secure storage; calling
  `POST /api/auth/logout` is harmless but not required.

Storage on the device: `expo-secure-store` (Android Keystore-backed). Never
`AsyncStorage`, never a plain file.

## Request conventions

- JSON only. No endpoint needs `multipart/form-data`.
- Errors are `{ ok: false, error: { code, message, messageKey?, params? } }`.
  `messageKey` is a translation key already present in the 2,196-key catalogue;
  `message` is the server-rendered English fallback. The app should render
  `messageKey` through the shared catalogue and fall back to `message`.
- `401` = sign in again. `403` = signed in but not allowed (trial ended,
  unactivated account, premium required) — do **not** sign the user out.
- Writes return `201` on create.

## Verified endpoints

| Purpose | Endpoint |
| --- | --- |
| Register / log in / log out | `POST /api/auth/register`, `/login`, `/logout` |
| Session | `GET /api/auth/me` |
| Entitlement | `GET /api/licensing`, `GET /api/subscription/status` |
| Customers | `GET/POST /api/customers`, `GET/PATCH/DELETE /api/customers/:id` |
| Payments | `POST /api/payments` |
| Products / stock | `/api/products`, `/api/stock-moves` |
| Sales | `/api/sales`, `/api/sales/:id` |
| Expenses | `/api/expenses` |
| Reports | `/api/reports/*` (Sunday week start) |
| Assistant (text or audio) | `POST /api/assistant/message` — `{ text }` or `{ audio: { base64, mimeType } }` |

The assistant endpoint already accepts base64 audio, so native recording needs
no server change.

## Regression suite

`scripts/qa-mobile-auth.mts` proves, against production:

- browser login/register returns no token in the body and still sets the cookie;
- the app receives a JWT and uses it on a read (`/api/customers`), a write
  (`POST /api/customers`) and session rehydration (`/api/auth/me`);
- no credential, a malformed Bearer, and a forged signature all get `401`;
- an empty Bearer falls through to the cookie (no accidental lockout).

Run it after any change to auth, the proxy, or the login/register routes.