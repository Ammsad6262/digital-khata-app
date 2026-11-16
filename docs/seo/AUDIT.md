# Technical SEO audit — dukhata.com

Prepared with the **SEO Specialist** persona. Date: 16 November 2026.
Audited the deployed site (dukhata.com), not the source alone.

## Executive summary

**The site could not rank at all before this work**: `robots.txt` contained
`Disallow: /`, instructing every search engine to ignore the entire domain. There
was also no page written to rank — `/` was a redirect straight into the app — and
no sitemap, canonical, Open Graph tags or structured data.

Everything in the "Fixed" section below is deployed and verified. The remaining
items need Search Console access or content work.

## Crawlability and indexation

### robots.txt — FIXED
| Before | After |
| --- | --- |
| `User-agent: *` / `Disallow: /` | Allows `/`, `/privacy`, `/terms`, `/refund-policy`, `/delete-account`; disallows `/api/`, `/admin`, `/preview` and the authenticated app (`/dashboard`, `/khata`, `/sales`, `/stock`, `/expenses`, `/payments`, `/more`); declares the sitemap |

The static `public/robots.txt` was deleted so it cannot override the generated
one at `/robots.txt`.

### XML sitemap — ADDED
`/sitemap.xml` now lists the five public URLs with change frequency and priority.
The app is deliberately excluded: it has no public content and is disallowed.

### Utility pages — noindex
`/login`, `/register` and `/reset-password` are client-rendered pages that cannot
declare their own metadata, so each got a thin route layout setting
`robots: { index: false }`. They stay crawlable so the directive can be read, and
they no longer compete with the landing page for brand queries.

## The landing page — ADDED

`/` used to `redirect("/dashboard")`, so a search engine saw a redirect with no
content. It is now a real page:

- Signed-in owners (valid session cookie) are still redirected to `/dashboard` —
  the app experience is unchanged.
- Everyone else gets marketing content: an H1 containing the primary keyword in
  the first line of the page, six feature sections, audience list, pricing that
  matches the legal documents exactly, and a six-question FAQ.
- Bilingual on purpose: the page carries an Urdu section marked `lang="ur"
  dir="rtl"` so Urdu-script queries have something to match.

Primary target: **digital khata app / khata app Pakistan**. Supporting:
udhaar khata, shop ledger app, customer balance app, kiryana store app.

## Structured data — ADDED

Three JSON-LD blocks on the landing page: `Organization`, `SoftwareApplication`
(with PKR offers for the Regular and Premium licences) and `FAQPage` (built from
the same array the page renders, so the two cannot drift).

## Metadata — FIXED

| | Before | After |
| --- | --- | --- |
| Title | `Dukhata` on every page | Template `%s · Dukhata`, with a keyword-bearing default |
| Description | One generic line on every page | Unique per page; landing description is 157 characters |
| Canonical | none | `metadataBase` + self-referencing canonical |
| Open Graph / Twitter | none | Added, sharing `/icon-512.png` until a designed OG image exists |
| Keywords | none | Added (a weak signal, but harmless and useful documentation) |

## Core Web Vitals

**Not measurable yet — no field data.** The Chrome UX Report and Search Console
have no history for this domain. What I can report:

- The root layout sets `export const dynamic = "force-dynamic"` (a workaround for
  a Turbopack prerender issue), so the landing page is server-rendered per
  request instead of being served from the static cache. TTFB measured from here
  is in the same range as `/api/health` (~100–120 ms), so it is not a problem
  today, but a marketing page should be static or ISR.
  **Recommendation:** move the landing page into a route group with its own
  layout that omits the global `force-dynamic`, once the prerender issue is
  resolved.
- Images on the landing page: none, so no LCP image cost. The icon files are
  small PNGs.
- The layout loads two web fonts (Plus Jakarta Sans, Noto Naskh Arabic) with
  `display: swap`.

Once Search Console has 28 days of data, replace this section with real LCP / INP
/ CLS numbers.

## Cannibalization

Not applicable yet: there is exactly one indexable content page. Cannibalization
checks become mandatory before adding a second page targeting the same cluster.
The rule to apply then: the page with the most impressions/clicks on a query owns
it, and no other page may reuse that primary keyword in its title or H1.

## Language and URL architecture — RECOMMENDATION

The app switches language client-side (a cookie plus `dir`/`lang` on `<html>`), so
English and Urdu share one URL. Google indexes the default rendering, which means
Urdu content will not rank separately.

Two options, in order of preference:

1. **Path-based locales** (`/ur/...`) with `hreflang` between `/` and `/ur`. This
   is the correct fix and does not require moving to another domain.
2. Keep one URL and accept that only the default language ranks.

Do **not** add `hreflang` pointing both languages at the same URL: Google treats
that as invalid and it can suppress both.

## Next steps (need your access or decisions)

1. **Google Search Console** — verify `dukhata.com` (DNS TXT record), then submit
   `https://dukhata.com/sitemap.xml`. Nothing can be measured without this.
2. **Bing Webmaster Tools** — same verification, feeds Bing and ChatGPT-style
   answer engines.
3. **Google Business Profile** — if the business is verifiable, this is the
   single highest-value local signal for "khata app near me" style queries.
4. **Content plan** — one page per real search intent, e.g. "how to keep a khata
   on your phone", "udhaar khata template", "how to chase a customer's payment
   politely". This is what earns non-branded traffic; the landing page only
   converts it.
5. **Backlinks** — get listed where Pakistani shopkeepers already read: business
   directories, local startup lists, app-store listings, and a YouTube demo. No
   paid link schemes.
6. **App store listings** — the Play Store listing ranks in search too, and links
   back to the site.
7. **A designed Open Graph image** (1200×630) instead of the square app icon.

## What was verified

| Check | Result |
| --- | --- |
| `/robots.txt` served from the app | see deploy verification |
| `/sitemap.xml` returns valid XML | see deploy verification |
| Landing page title / description / canonical / OG / JSON-LD | see deploy verification |
| Signed-in redirect to `/dashboard` | preserved (session cookie checked server-side) |
