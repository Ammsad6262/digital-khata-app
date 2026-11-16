import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/services/auth";
import { CONTACT_EMAIL, HOME_FAQ } from "@/content/marketing";

/**
 * Public landing page — the only page written to rank in search.
 *
 * Signed-in visitors are sent straight to their dashboard (the old behaviour of
 * this route) so the app is unchanged for existing owners. Everyone else gets
 * the marketing page, which is the thing search engines index.
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

const FEATURES = [
  {
    title: "Customer khatas that stay correct",
    body: "Every sale, payment and adjustment updates the balance for that customer. No totals to re-check by hand.",
  },
  {
    title: "Record a sale in one sentence",
    body: "Type or speak it. Dukhata turns \"Ali ko 500 udhar diye\" into a customer, an amount and a credit sale you confirm with one tap.",
  },
  {
    title: "Payments and partial payments",
    body: "Take part payment, full payment or an advance. The khata shows exactly what is still owed.",
  },
  {
    title: "Stock that matches the shelf",
    body: "Add products, buy stock, and let sales reduce the count automatically.",
  },
  {
    title: "Expenses and profit at a glance",
    body: "Record shop expenses, then see sales, expenses and profit for the day, week or month.",
  },
  {
    title: "Reports and follow-ups",
    body: "Who owes the most, who has gone quiet, what sold best — and one-tap Call or WhatsApp to chase a payment.",
  },
];

const AUDIENCE = [
  "Kiryana and general stores",
  "Wholesalers and distributors",
  "Medical stores",
  "Hardware and sanitary shops",
  "Mobile and electronics shops",
  "Anyone who keeps a khata in a notebook today",
];

const PLANS = [
  {
    name: "Free trial",
    price: "Rs 0",
    period: "for 14 days",
    points: ["Everything included", "Including the AI assistant", "No card needed"],
    cta: "Start free trial",
    highlight: false,
  },
  {
    name: "Regular licence",
    price: "Rs 10,000",
    period: "one time, permanent",
    points: ["Core app forever", "Customers, sales, stock, expenses", "Does not include the AI assistant"],
    cta: "Create account",
    highlight: false,
  },
  {
    name: "Premium",
    price: "Rs 3,000",
    period: "per 30 days",
    points: ["Everything in Regular", "AI assistant included", "Voice entry in Urdu and Roman Urdu"],
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
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight text-ink">Dukhata</span>
        <Link
          href="/login"
          className="text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
        >
          Log in
        </Link>
      </header>

      <section className="mt-10">
        <h1 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-4xl">
          Dukhata — the digital khata app for Pakistani shops
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          Dukhata keeps your shop&apos;s khata on your phone. Record a sale, an udhaar or a payment in
          seconds — by typing or simply by speaking in Urdu or Roman Urdu — and every customer balance
          stays correct on its own.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-control bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Start free 14-day trial
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-control border border-line-strong bg-surface px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            Log in
          </Link>
        </div>
        <p className="mt-3 text-xs text-ink-subtle">
          No card needed for the trial. Works on the phone you already have.
        </p>
      </section>

      <section className="mt-12" lang="ur" dir="rtl">
        <h2 className="text-xl font-semibold text-ink">اردو میں بھی آسان</h2>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          دکھاتہ آپ کی دکان کا کھاتہ موبائل پر رکھتا ہے۔ آپ اردو یا رومن اردو میں بول کر بتائیں
          &quot;علی کو پانچ سو ادھار دیے&quot; اور ایپ خود اندراج بنا دے گی — آپ صرف تصدیق کریں۔
          گاہک کا باقی، ادائیگیاں، اسٹاک اور خرچ سب ایک جگہ۔
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-ink">Everything a shop khata needs</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-card border border-line bg-surface p-4">
              <h3 className="text-sm font-semibold text-ink">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-ink">Built for shops like yours</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {AUDIENCE.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-ink-muted">
              <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" id="pricing">
        <h2 className="text-xl font-semibold text-ink">Simple pricing</h2>
        <p className="mt-2 text-sm text-ink-subtle">
          Start with the free trial. Pay only if it saves you time.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={
                plan.highlight
                  ? "rounded-card border-2 border-brand-500 bg-surface p-4"
                  : "rounded-card border border-line bg-surface p-4"
              }
            >
              <h3 className="text-sm font-semibold text-ink">{plan.name}</h3>
              <p className="mt-2 text-2xl font-semibold text-ink">{plan.price}</p>
              <p className="text-xs text-ink-subtle">{plan.period}</p>
              <ul className="mt-3 space-y-1.5">
                {plan.points.map((point) => (
                  <li key={point} className="text-xs leading-relaxed text-ink-muted">
                    {point}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="mt-4 inline-flex w-full items-center justify-center rounded-control bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-ink">Questions shopkeepers ask</h2>
        <div className="mt-4 divide-y divide-line rounded-card border border-line bg-surface">
          {HOME_FAQ.map((item) => (
            <details key={item.question} className="group px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-ink marker:content-none">
                {item.question}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-ink-subtle">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-card border border-line bg-surface-2 p-5 text-center">
        <h2 className="text-lg font-semibold text-ink">Try it with your own customers</h2>
        <p className="mt-2 text-sm text-ink-subtle">
          Set up your shop in a few minutes and record your first khata today.
        </p>
        <Link
          href="/register"
          className="mt-4 inline-flex items-center justify-center rounded-control bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Create your free account
        </Link>
      </section>

      <footer className="mt-12 border-t border-line pt-6">
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/privacy" className="text-ink-subtle underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-ink-subtle underline-offset-2 hover:underline">
            Terms of Service
          </Link>
          <Link href="/refund-policy" className="text-ink-subtle underline-offset-2 hover:underline">
            Refund Policy
          </Link>
          <Link href="/delete-account" className="text-ink-subtle underline-offset-2 hover:underline">
            Delete Account
          </Link>
        </nav>
        <p className="mt-4 text-xs text-ink-faint">
          Dukhata · {CONTACT_EMAIL}
        </p>
      </footer>
    </main>
  );
}
