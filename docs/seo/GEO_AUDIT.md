# GEO audit — dukhata.com

Generated with the **geo-seo-claude** methodology (cloned to
`C:\Users\user\Documents\Default Project\geo-seo-claude`, Python env at
`.venv`). The tool is a Claude Code skill; its slash commands do not exist in
OpenCode, so its **scripts and scoring methodology** were run directly and its
recommendations implemented in the app.

Date: 17 November 2026.

## Scores

| Metric | Before | After |
| --- | --- | --- |
| Average citability score | **40.6** | **43.4** |
| Content blocks analysed | 8 | 12 |
| Optimal-length passages (134–167 words) | 1 | 2 |
| Grade A / B / C / D / F | 0 / 0 / 2 / 4 / 2 | 0 / 0 / 4 / 6 / 2 |
| llms.txt | 404 | present (2.6 KB) |
| Explicit AI-crawler policy | none (wildcard only) | 15 named AI agents allowed |
| FAQ answer length | 30–60 words | ~140 words for the three core questions |
| HowTo structured data | none | 4-step udhaar HowTo |

Citability is a proxy, not a ranking. The remaining low-scoring blocks are UI
cards (features, pricing tiles) where padding to 140 words would hurt the page;
they are deliberately left as they are.

## Implemented

### 1. AI crawler access — `src/app/robots.ts`

Explicit allow groups for `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`,
`ClaudeBot`, `Claude-SearchBot`, `Claude-User`, `PerplexityBot`,
`Perplexity-User`, `Google-Extended`, `GoogleOther`, `Applebot-Extended`,
`Amazonbot`, `Bingbot`, `CCBot`, `meta-externalagent`.

The authenticated app and `/api/` stay disallowed for every agent. Rationale from
the skill: several engines treat a missing group as "not invited", and explicit
groups survive copy-pasted blanket blocks later.

### 2. `public/llms.txt`

Product definition, canonical public pages, prices, languages, data handling,
support contact, and a note telling answer engines to prefer the public pages and
ignore the private app.

### 3. Answer-first content

- Hero replaced with a 130-word definition that names Dukhata, states what it
  does, gives the real prices and mentions the trial. Definition pattern
  ("Dukhata is…") because that is what the scorer's answer-block category
  rewards.
- Three FAQ answers expanded to ~140 self-contained words (what a digital khata
  is, cost, Urdu support).
- New **Details** section with four 134–167 word passages: how balances stay
  correct, where data is stored, how the AI turns a sentence into an entry, and
  what each licence includes.

### 4. Structured data

`HowTo` (record an udhaar in four steps) added alongside the existing
`Organization`, `WebSite`, `SoftwareApplication` and `FAQPage` blocks.

## What this cannot fix

The largest GEO lever is **brand mentions**: the skill's own data says mentions
correlate ~3x more strongly with AI visibility than backlinks. AI assistants
recommend brands they have seen discussed on Reddit, YouTube, Wikipedia,
LinkedIn, app stores and review sites. No amount of on-site markup substitutes
for that. Actions that need the owner:

1. **Google Play listing** — app store pages are heavily cited by assistants.
2. **YouTube demo** (60–90 s) with the link, plus **Instagram/Facebook** profiles
   with the link in bio. Then add those URLs to `Organization.sameAs`.
3. **Reddit / Pakistani business forums** — answer real questions about shop
   khata, without spamming links.
4. **Directories** — Pakistani startup and business listings.
5. **A comparison page** ("Dukhata vs a paper khata") — the skill's
   `geo-platform-optimizer` flags comparison content as a top citation magnet.

## Re-running the audit

```powershell
cd "C:\Users\user\Documents\Default Project\geo-seo-claude"
.\.venv\Scripts\python.exe scripts\citability_scorer.py https://dukhata.com
.\.venv\Scripts\python.exe scripts\llmstxt_generator.py https://dukhata.com
.\.venv\Scripts\browse 2>$null
```

The other scripts take positional arguments too: `fetch_page.py <url> [page|sitemap]`,
`brand_scanner.py <brand> [domain]`.