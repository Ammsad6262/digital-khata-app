import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Globe,
  Smartphone,
  FileDown,
  Mic,
  Users,
  Wallet,
  Package,
  TrendingUp,
  Phone,
} from "lucide-react";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/services/auth";
import { CONTACT_EMAIL, HOME_FAQ } from "@/content/marketing";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SmoothScroll } from "@/components/marketing/SmoothScroll";
import { Container } from "@/components/marketing/Container";
import { UseInBrowserCta, DownloadAppCta } from "@/components/marketing/CtaButtons";

/**
 * Public landing page — the only page written to rank in search.
 *
 * Signed-in visitors are sent straight to their dashboard (the old behaviour of
 * this route) so the app is unchanged for existing owners. Everyone else gets
 * the marketing page, which is the thing search engines index.
 *
 * This stays a Server Component: all copy is in the server-rendered HTML. Only
 * <SmoothScroll> is a client component, and it starts hidden states from JS.
 */

export const metadata: Metadata = {
  title: "Digital Khata App for Pakistani Shops",
  description:
    "Record sales, udhaar and payments in seconds. Dukhata is a simple digital khata app for kiryana, wholesale and general stores in Pakistan. Free 14-day trial.",
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: "Dukhata — digital khata app for Pakistani shops",
    description:
      "Record sales, udhaar and payments in seconds. Speak in Urdu or Roman Urdu and Dukhata writes the entry for you. Free 14-day trial.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Dukhata" }],
  },
};

// True facts only — everything below is already stated elsewhere in the app.
const TRUST = [
  {
    icon: ShieldCheck,
    text: "14-day free trial with everything included, and no card needed.",
  },
  {
    icon: Globe,
    text: "Type or speak in Urdu, Roman Urdu or English — no language setting.",
  },
  {
    icon: Smartphone,
    text: "Runs in your browser, and adds to your home screen like an app.",
  },
  {
    icon: FileDown,
    text: "Export your records any time, and delete your account any time.",
  },
] as const;

const AUDIENCE = [
  "Kiryana and general stores",
  "Wholesalers and distributors",
  "Medical stores",
  "Hardware and sanitary shops",
  "Mobile and electronics shops",
];

// The one feature that matters most, given its own space.
const LEAD_FEATURE = {
  icon: Mic,
  title: "Record a sale in one sentence",
  body: 'Type it, or just say it. Dukhata turns "Ali ko 500 udhaar diye" into a customer, an amount and a credit sale you confirm with one tap.',
};

const FEATURES = [
  {
    icon: Users,
    title: "Customer khatas that stay correct",
    body: "Every sale, payment and adjustment updates the balance for that customer. No totals to re-check by hand.",
  },
  {
    icon: Wallet,
    title: "Payments and partial payments",
    body: "Take part payment, full payment or an advance. The khata shows exactly what is still owed.",
  },
  {
    icon: Package,
    title: "Stock that matches the shelf",
    body: "Add products, buy stock, and let sales reduce the count automatically.",
  },
  {
    icon: TrendingUp,
    title: "Expenses and profit at a glance",
    body: "Record shop expenses, then see sales, expenses and profit for the day, week or month.",
  },
  {
    icon: Phone,
    title: "Reports and follow-ups",
    body: "Who owes the most, who has gone quiet, what sold best — and one-tap Call or WhatsApp to chase a payment.",
  },
];

const STEPS = [
  {
    title: "Say it or type it",
    body: '"Ali ko 500 udhaar diye" — in Urdu, Roman Urdu, English or a mix. There is no form to fill in.',
  },
  {
    title: "Check the draft, tap confirm",
    body: "Dukhata shows the customer, the amount and the type. Nothing is saved until you confirm it.",
  },
  {
    title: "The balance updates itself",
    body: "Ali's khata now shows what he still owes. Follow up with one-tap Call or WhatsApp when you like.",
  },
];

const PLANS = [
  {
    name: "Free trial",
    price: "Rs 0",
    period: "for 14 days",
    badge: "Start here",
    points: ["Everything included", "Including the AI assistant", "No card needed"],
    cta: "Start free trial",
    highlight: false,
  },
  {
    name: "Regular licence",
    price: "Rs 10,000",
    period: "one time, permanent",
    badge: "One-time",
    points: [
      "Core app forever",
      "Customers, sales, stock, expenses",
      "Does not include the AI assistant",
    ],
    cta: "Create account",
    highlight: false,
  },
  {
    name: "Premium",
    price: "Rs 3,000",
    period: "per 30 days",
    badge: "Includes AI assistant",
    points: [
      "Everything in Regular",
      "AI assistant included",
      "Voice entry in Urdu and Roman Urdu",
    ],
    cta: "Create account",
    highlight: true,
  },
];

export default async function HomePage() {
  // Keep the old behaviour for owners who are already signed in.
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    const session = await verifyToken(token).catch(() => null);
    if (session) redirect("/dashboard");
  }

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HOME_FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  const appSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dukhata",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android",
    url: "https://dukhata.com/",
    description:
      "Digital khata app for Pakistani shops: record sales, udhaar, payments, stock and expenses, with voice entry in Urdu and Roman Urdu.",
    offers: [
      {
        "@type": "Offer",
        name: "Regular licence",
        price: "10000",
        priceCurrency: "PKR",
        category: "one-time",
      },
      {
        "@type": "Offer",
        name: "Premium (30 days)",
        price: "3000",
        priceCurrency: "PKR",
      },
    ],
    publisher: { "@type": "Organization", name: "Dukhata", url: "https://dukhata.com/" },
  };

  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Dukhata",
    alternateName: ["Dukhata app", "Dukhata digital khata", "Dukhata khata app"],
    url: "https://dukhata.com/",
    logo: "https://dukhata.com/icon-512.png",
    description:
      "Dukhata is a digital khata app for shops in Pakistan: record sales, udhaar, payments, stock and expenses, with voice entry in Urdu and Roman Urdu.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: CONTACT_EMAIL,
      availableLanguage: ["en", "ur"],
    },
  };

  // Tells Google the site itself is "Dukhata", which is what a brand search
  // ("dukhata") has to resolve to. alternateName carries the near-spellings
  // people actually type.
  const siteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Dukhata",
    alternateName: ["Dukhata app", "Dukhata khata", "dukhata.com"],
    url: "https://dukhata.com/",
    inLanguage: ["en", "ur"],
    publisher: { "@type": "Organization", name: "Dukhata", url: "https://dukhata.com/" },
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-app">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-lift"
      >
        Skip to content
      </a>

      <SiteHeader />

      <SmoothScroll className="flex-1">
        <main id="main">
          {/* ── Hero ─────────────────────────────────────────────────────── */}
          <section>
            <Container className="grid items-center gap-12 pb-14 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24 lg:pt-20">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-muted">
                  <ShieldCheck className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
                  14-day free trial · no card needed
                </p>

                <h1 className="mt-5 text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[2.6rem] lg:text-[3.15rem]">
                  Dukhata — the digital khata app for Pakistani shops
                </h1>

                <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-muted sm:text-base">
                  Record a sale, an udhaar or a payment in seconds. Type it or speak it in Urdu
                  or Roman Urdu, and every customer balance stays correct on its own.
                </p>

                <div className="mt-7 flex flex-wrap items-start gap-4">
                  <UseInBrowserCta />
                  <DownloadAppCta />
                </div>

                <p className="mt-4 text-xs text-ink-subtle">
                  Works on the phone you already have. Nothing to install today.
                </p>
              </div>

              {/* The core interaction, shown honestly: one sentence → one draft. */}
              <figure>
                <div className="rounded-card border border-line bg-surface p-5 shadow-lift">
                  <div className="flex items-center justify-between gap-3">
                    <span className="section-title">One sentence in</span>
                    <span className="pill border border-line bg-surface-2 text-ink-muted">
                      <Mic className="h-3 w-3" aria-hidden="true" />
                      Roman Urdu
                    </span>
                  </div>

                  <p className="mt-3 rounded-control border border-line bg-surface-2 px-3.5 py-3 text-[15px] font-medium text-ink">
                    “Ali ko 500 udhaar diye”
                  </p>

                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-ink-faint">
                    <span aria-hidden="true" className="h-px flex-1 bg-line" />
                    <span>Dukhata reads it</span>
                    <span aria-hidden="true" className="h-px flex-1 bg-line" />
                  </div>

                  <dl className="mt-4 divide-y divide-line overflow-hidden rounded-control border border-line">
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <dt className="text-xs text-ink-subtle">Customer</dt>
                      <dd className="text-sm font-semibold text-ink">Ali</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <dt className="text-xs text-ink-subtle">Entry</dt>
                      <dd className="text-sm font-semibold text-ink">Credit sale (udhaar)</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <dt className="text-xs text-ink-subtle">Amount</dt>
                      <dd className="text-sm font-semibold tabular-nums text-ink">Rs 500</dd>
                    </div>
                  </dl>

                  <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
                    Ali&apos;s khata shows what he owes. Nothing is saved until you confirm the
                    draft.
                  </p>
                </div>
                <figcaption className="mt-3 text-center text-xs text-ink-faint">
                  Urdu, Roman Urdu or English — spoken or typed.
                </figcaption>
              </figure>
            </Container>
          </section>

          {/* ── Trust strip ──────────────────────────────────────────────── */}
          <section className="border-y border-line bg-surface">
            <Container className="py-7">
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {TRUST.map((item) => (
                  <li key={item.text} className="flex items-start gap-2.5">
                    <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                    <span className="text-[13px] leading-relaxed text-ink-muted">{item.text}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs leading-relaxed text-ink-subtle">
                Built for {AUDIENCE.join(" · ")}.
              </p>
            </Container>
          </section>

          {/* ── Features ─────────────────────────────────────────────────── */}
          <section id="features" className="scroll-mt-24">
            <Container className="py-16 lg:py-20">
              <header className="max-w-2xl" data-reveal="">
                <p className="eyebrow">Features</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
                  Everything a shop khata needs
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  The whole ledger for one shop, without the paperwork. One thing matters more
                  than the rest, so it goes first.
                </p>
              </header>

              <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                <div
                  className="brand-wash rounded-card border border-line p-6 shadow-card"
                  data-reveal=""
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-control bg-brand-600 text-white shadow-brand">
                    <LEAD_FEATURE.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-ink">{LEAD_FEATURE.title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
                    {LEAD_FEATURE.body}
                  </p>
                  <p className="mt-4 rounded-control border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink-subtle">
                    “Ali ko 500 udhaar diye” → Ali · Credit sale · Rs 500
                  </p>
                </div>

                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  {FEATURES.slice(0, 2).map((feature, index) => (
                    <li
                      key={feature.title}
                      className="rounded-card border border-line bg-surface p-5"
                      data-reveal=""
                      data-reveal-delay={String(index * 60)}
                    >
                      <feature.icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
                      <h3 className="mt-3 text-sm font-semibold text-ink">{feature.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{feature.body}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <ul className="mt-4 grid gap-4 sm:grid-cols-3">
                {FEATURES.slice(2).map((feature, index) => (
                  <li
                    key={feature.title}
                    className="rounded-card border border-line bg-surface p-5"
                    data-reveal=""
                    data-reveal-delay={String(index * 60)}
                  >
                    <feature.icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
                    <h3 className="mt-3 text-sm font-semibold text-ink">{feature.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{feature.body}</p>
                  </li>
                ))}
              </ul>
            </Container>
          </section>

          {/* ── How it works ─────────────────────────────────────────────── */}
          <section className="border-y border-line bg-surface">
            <Container className="py-16 lg:py-20">
              <header className="max-w-2xl" data-reveal="">
                <p className="eyebrow">How it works</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
                  Three steps, seconds long
                </h2>
              </header>
              <ol className="mt-8 grid gap-4 md:grid-cols-3">
                {STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="rounded-card border border-line bg-surface p-5 shadow-card"
                    data-reveal=""
                    data-reveal-delay={String(index * 60)}
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold tabular-nums text-white">
                      {index + 1}
                    </span>
                    <h3 className="mt-3 text-sm font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{step.body}</p>
                  </li>
                ))}
              </ol>
            </Container>
          </section>

          {/* ── Urdu (RTL) ───────────────────────────────────────────────── */}
          <section>
            <Container className="pt-16 lg:pt-20">
              <div
                lang="ur"
                dir="rtl"
                className="font-urdu rounded-card border border-line bg-surface p-6 sm:p-8"
                data-reveal=""
              >
                <h2 className="text-xl font-semibold text-ink sm:text-2xl">اردو میں بھی آسان</h2>
                <p className="mt-3 text-base leading-[2] text-ink-muted">
                  دکھاتہ آپ کی دکان کا کھاتہ موبائل پر رکھتا ہے۔ آپ اردو یا رومن اردو میں بول کر
                  بتائیں &quot;علی کو پانچ سو ادھار دیے&quot; اور ایپ خود اندراج بنا دے گی — آپ صرف
                  تصدیق کریں۔ گاہک کا باقی، ادائیگیاں، اسٹاک اور خرچ سب ایک جگہ۔
                </p>
              </div>
            </Container>
          </section>

          {/* ── Pricing ──────────────────────────────────────────────────── */}
          <section id="pricing" className="scroll-mt-24">
            <Container className="py-16 lg:py-20">
              <header className="max-w-2xl" data-reveal="">
                <p className="eyebrow">Pricing</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">Simple pricing</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  Start with the 14-day free trial. Pay only if Dukhata saves you time.
                </p>
              </header>

              <div className="mt-8 grid gap-4 lg:grid-cols-3">
                {PLANS.map((plan, index) => (
                  <div
                    key={plan.name}
                    className={
                      plan.highlight
                        ? "flex flex-col rounded-card border-2 border-brand-500 bg-surface p-5 shadow-brand"
                        : "flex flex-col rounded-card border border-line bg-surface p-5"
                    }
                    data-reveal=""
                    data-reveal-delay={String(index * 60)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-ink">{plan.name}</h3>
                      <span
                        className={
                          plan.highlight
                            ? "pill bg-brand-600 text-white"
                            : "pill border border-line bg-surface-2 text-ink-muted"
                        }
                      >
                        {plan.badge}
                      </span>
                    </div>
                    <p className="mt-3 text-2xl font-semibold tabular-nums text-ink">{plan.price}</p>
                    <p className="text-xs text-ink-subtle">{plan.period}</p>
                    <ul className="mt-4 flex flex-1 flex-col gap-1.5">
                      {plan.points.map((point) => (
                        <li key={point} className="text-xs leading-relaxed text-ink-muted">
                          {point}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/register"
                      className="focus-ring mt-5 inline-flex h-11 w-full items-center justify-center rounded-control bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      {plan.cta}
                    </Link>
                  </div>
                ))}
              </div>

              <p className="mt-6 text-xs leading-relaxed text-ink-subtle">
                Prices in PKR. Payment is arranged on WhatsApp and you get an activation code —
                nothing is charged automatically.{" "}
                <Link
                  href="/contact"
                  className="focus-ring rounded font-medium text-brand-700 underline-offset-2 hover:underline"
                >
                  Contact us
                </Link>
                .
              </p>
            </Container>
          </section>

          {/* ── FAQ ──────────────────────────────────────────────────────── */}
          <section id="faq" className="scroll-mt-24 border-t border-line bg-surface">
            <Container className="py-16 lg:py-20">
              <header className="max-w-2xl" data-reveal="">
                <p className="eyebrow">FAQ</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
                  Questions shopkeepers ask
                </h2>
              </header>

              <div
                className="mt-6 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface"
                data-reveal=""
              >
                {HOME_FAQ.map((item) => (
                  <details key={item.question} className="group px-4 py-3">
                    <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded text-sm font-medium text-ink marker:content-none [&::-webkit-details-marker]:hidden">
                      <span>{item.question}</span>
                      <span
                        aria-hidden="true"
                        className="text-ink-faint transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed text-ink-subtle">{item.answer}</p>
                  </details>
                ))}
              </div>
            </Container>
          </section>

          {/* ── Final CTA ────────────────────────────────────────────────── */}
          <section>
            <Container className="py-16 lg:py-20">
              <div
                className="rounded-card border border-line bg-surface-2 p-6 text-center sm:p-10"
                data-reveal=""
              >
                <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                  Try it with your own customers
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
                  Set up your shop in a few minutes and record your first khata today.
                </p>
                <div className="mt-6 flex flex-wrap items-start justify-center gap-4">
                  <UseInBrowserCta />
                  <DownloadAppCta className="text-start" />
                </div>
              </div>
            </Container>
          </section>
        </main>
      </SmoothScroll>

      <SiteFooter />
    </div>
  );
}
