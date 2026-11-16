import type { Metadata } from "next";
import Link from "next/link";
import { FileDown, ShieldCheck, Trash2, Users, Lock } from "lucide-react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SmoothScroll } from "@/components/marketing/SmoothScroll";
import { Container } from "@/components/marketing/Container";
import { UseInBrowserCta, DownloadAppCta } from "@/components/marketing/CtaButtons";
import { CONTACT_EMAIL } from "@/content/marketing";
import { OPERATOR } from "@/content/legal";

export const metadata: Metadata = {
  title: "About Dukhata",
  description:
    "Who builds Dukhata, the problem it solves for Pakistani shops, and exactly what data it stores about you and your customers.",
  alternates: { canonical: "/about" },
  openGraph: {
    url: "/about",
    title: "About Dukhata — a khata built for Pakistani shops",
    description:
      "Who builds Dukhata, the problem it solves, and exactly what data it holds. Built and supported from Karachi, Pakistan.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Dukhata" }],
  },
};

const DATA_HELD = [
  {
    title: "Your account",
    body: "Your name, your email address, and a bcrypt hash of your password — never the password itself. Your business name, currency, units, theme, timezone, and an optional 4–6 digit PIN stored only as a hash.",
  },
  {
    title: "Your shop's records",
    body: "The customers, products, sales and sale items, payments, expenses, stock movements, suppliers, reminders, follow-ups and audit-log entries you enter. These belong to you: you are the controller of them and we store them only to run the app for you.",
  },
  {
    title: "AI inputs",
    body: "The text you type, or the audio you record, when you use the assistant. It is sent to Google's Gemini API to be turned into a draft entry. The audio is not kept, and an unconfirmed draft expires.",
  },
  {
    title: "Technical data",
    body: "A signed, HttpOnly session cookie so you stay logged in, your IP address to rate-limit abuse, and cookieless page-view counts from Vercel Analytics that do not track you across other websites.",
  },
];

const PROCESSORS = [
  { name: "Vercel", role: "Application hosting and cookieless page-view analytics (Mumbai region)." },
  { name: "Supabase", role: "The PostgreSQL database, hosted in the Mumbai region." },
  { name: "Google (Gemini API)", role: "AI transcription and interpretation for the assistant." },
];

const CONTROL = [
  { icon: FileDown, text: "Export your records any time from Backup inside the app." },
  { icon: Trash2, text: "Delete your account and its records any time, from Settings." },
  { icon: Users, text: "Your account and your customers' records are isolated per user." },
  { icon: Lock, text: "Passwords and PINs are one-way hashes; traffic is encrypted with TLS." },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-app">
      <SiteHeader />

      <SmoothScroll className="flex-1">
        <main id="main">
          <Container className="max-w-3xl py-14 lg:py-20">
            <p className="eyebrow">About</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
              About Dukhata
            </h1>
            <p className="mt-5 text-base leading-relaxed text-ink-muted">
              Dukhata is a digital khata for Pakistani shops. It keeps the ledger a shopkeeper
              already keeps — customers, udhaar, payments, stock and daily expenses — on the phone
              in their pocket instead of in a notebook.
            </p>

            <section className="mt-12" data-reveal="">
              <h2 className="text-xl font-semibold text-ink">Who builds it</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                Dukhata is built and supported from {OPERATOR.city}, {OPERATOR.country}. It is an
                independent product, not a franchise or a reseller, and the same address that
                answers your licence and refund emails is{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="focus-ring rounded font-medium text-brand-700 underline-offset-2 hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </section>

            <section className="mt-12" data-reveal="">
              <h2 className="text-xl font-semibold text-ink">The problem it solves</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                A paper khata works, until it doesn&apos;t. Totals have to be added by hand, so
                mistakes hide in the numbers. An udhaar from three weeks ago is easy to forget, and
                following it up means flipping pages. And when the notebook is lost or soaked
                through, so is the record of who owes what.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                Dukhata keeps the balance for each customer automatically: record a sale, a payment
                or an advance, and the khata updates itself. Reports show who owes the most and who
                has gone quiet, and one tap opens a Call or a WhatsApp message to chase the
                payment.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                It is made for kiryana and general stores, wholesalers, medical stores, hardware and
                sanitary shops, and mobile or electronics shops — anyone who keeps a khata in a
                notebook today.
              </p>
            </section>

            <section className="mt-12" data-reveal="">
              <h2 className="text-xl font-semibold text-ink">What data Dukhata holds</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                Two different kinds of information live in the app, and they are treated
                differently.
              </p>
              <dl className="mt-5 flex flex-col gap-3">
                {DATA_HELD.map((item) => (
                  <div key={item.title} className="rounded-card border border-line bg-surface p-4">
                    <dt className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden="true" />
                      {item.title}
                    </dt>
                    <dd className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{item.body}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="mt-12" data-reveal="">
              <h2 className="text-xl font-semibold text-ink">Who else is involved</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                We do not sell your data and we do not share it with advertisers. Three providers
                process it so the app can run:
              </p>
              <ul className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {PROCESSORS.map((processor) => (
                  <li key={processor.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
                    <span className="text-sm font-semibold text-ink sm:w-44 sm:shrink-0">
                      {processor.name}
                    </span>
                    <span className="text-sm leading-relaxed text-ink-subtle">{processor.role}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-12" data-reveal="">
              <h2 className="text-xl font-semibold text-ink">Your control over it</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {CONTROL.map((item) => (
                  <li
                    key={item.text}
                    className="flex items-start gap-2.5 rounded-card border border-line bg-surface p-4"
                  >
                    <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                    <span className="text-sm leading-relaxed text-ink-muted">{item.text}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-12" data-reveal="">
              <h2 className="text-xl font-semibold text-ink">Read the detail</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                The legal pages spell all of this out in full.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { href: "/privacy", label: "Privacy Policy" },
                  { href: "/terms", label: "Terms of Service" },
                  { href: "/refund-policy", label: "Refund Policy" },
                  { href: "/delete-account", label: "Delete your account" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="focus-ring rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </section>

            <section className="mt-14 rounded-card border border-line bg-surface-2 p-6 sm:p-8" data-reveal="">
              <h2 className="text-xl font-semibold text-ink">Try it with your own customers</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                Set up your shop in a few minutes and record your first khata today.
              </p>
              <div className="mt-6 flex flex-wrap items-start gap-4">
                <UseInBrowserCta />
                <DownloadAppCta />
              </div>
            </section>
          </Container>
        </main>
      </SmoothScroll>

      <SiteFooter />
    </div>
  );
}
