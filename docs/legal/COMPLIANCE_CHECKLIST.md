# Legal and compliance checklist

Prepared with the **Legal Compliance Checker** persona. These documents are
plain-language drafts written from what the software actually does. They are
**not legal advice** — have a Pakistani lawyer review them before launch.

## Published pages (live after the next deploy)

| Page | Path | Why it exists |
| --- | --- | --- |
| Privacy Policy | `/privacy` | Required by Google Play and the App Store; linked at signup and login |
| Terms of Service | `/terms` | The licence terms, AI disclaimer, liability limit |
| Refund Policy | `/refund-policy` | Refunds for one-time and Premium licences |
| Delete Your Account | `/delete-account` | Google Play requires a public data-deletion URL |

The text lives in `src/content/legal.ts` and is rendered by
`src/components/legal/LegalPageView.tsx`. Edit the strings there; the pages
update on the next deploy.

## Operator details (pre-filled — check these three)

They live in one block at the top of `src/content/legal.ts` (`OPERATOR`). I filled
them from what I could see in the project; confirm or correct each one:

| Value | Currently set to | Why | Action |
| --- | --- | --- | --- |
| `legalName` | **Attendas** | Taken from the `attendas.pk@gmail.com` account created on the site. | Change if that is not the business customers contract with. |
| `contactEmail` | **support@dukhata.com** | Matches the domain and reads professionally. | **Must be set up** — see below. |
| `city` | **Karachi** | Governing-law city. | Change to your city if needed. |
| `country` | Pakistan | | |

### Set up support@dukhata.com (2 minutes, do this first)

Your domain already has Namecheap email forwarding (the `eforward` MX records),
so no new mailbox is needed:

1. Namecheap -> Domain List -> `dukhata.com` -> **Manage**
2. Open the **Mail Settings** tab (or "Email Forwarding")
3. Add a forwarding rule: `support@dukhata.com` -> your Gmail
4. Save

Until that exists, the address published in the policies will not receive mail.
Prefer a different address? Change `contactEmail` in `src/content/legal.ts`.

Do **not** invent a postal address. If a lawyer or a payment provider later asks
for one, add it to the same `OPERATOR` block.

Also confirm these statements are true for you (they are in the Terms):

- Premium is **PKR 3,000 per 30 days** and Regular is **PKR 10,000 one-time**.
- The Regular licence does **not** include the AI assistant; the 14-day trial
  does.
- You can refund to the same payment method you were paid with.

## Data inventory (what the software really stores)

**Account data (you are the controller):** name, email, bcrypt password hash,
optional hashed PIN, business name, currency, units, theme, timezone.

**Business records (you are the processor; the shopkeeper is the controller):**
customers (name, phone, address, notes, company), products, sales and sale items,
payments, expenses, stock movements, suppliers, reminders, follow-ups, audit log.

**AI inputs:** typed text or recorded audio, sent to Google's Gemini API to be
transcribed and turned into a draft. Audio is not retained; the draft expires.

**Technical:** a signed HttpOnly session cookie; IP address for rate limiting;
**Vercel Analytics** page views (cookieless, no cross-site tracking) — this is
enabled in `src/app/layout.tsx` and is disclosed in the Privacy Policy.

**Processors:** Vercel (hosting, analytics, region `bom1`), Supabase (PostgreSQL,
Mumbai `ap-south-1`), Google (Gemini API).

## Gaps closed in code

- Signup now states that creating an account accepts the Terms and Privacy
  Policy, with links (`src/app/register/page.tsx`).
- Login shows the same links (`src/app/login/page.tsx`).
- Both documents are bilingual (English and Urdu) through the existing i18n keys.

## Still to do before launch

1. **Fill the placeholders** above and redeploy.
2. **Google Play Data Safety form**: declare account data (name, email) and
   "app activity" (page views via analytics), state that data is encrypted in
   transit, and give the `/delete-account` URL for deletion requests.
3. **Processor agreements**: Supabase, Vercel and Google each publish standard
   data-processing terms. Accept or download them so you can show a lawful basis
   for processing if asked.
4. **Customer data requests**: your customers are not Dukhata users. Add the
   sentence in `/privacy` section 1 to your own shop policy so they know to ask
   you, not us.
5. **Payments**: if you accept card payments, your gateway will require the
   Terms, Privacy Policy and Refund Policy URLs. They are ready for that.
6. **Business registration and tax**: invoicing for licence sales is a separate
   legal and tax question — confirm with your accountant.
7. **Trademark**: consider registering "Dukhata" if you will invest in the brand.
8. **Lawyer review**: one review pass before launch, and again if you start
   serving customers outside Pakistan (GDPR/CCPA would then apply).
