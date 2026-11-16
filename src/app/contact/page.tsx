import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SmoothScroll } from "@/components/marketing/SmoothScroll";
import { Container } from "@/components/marketing/Container";
import { CONTACT_EMAIL } from "@/content/marketing";
import { getWhatsAppLink, WHATSAPP_NUMBER_DISPLAY } from "@/lib/utils/whatsapp";

export const metadata: Metadata = {
  title: "Contact Dukhata",
  description:
    "Email or WhatsApp Dukhata support. How to get a licence or refund question answered, and how long a reply usually takes.",
  alternates: { canonical: "/contact" },
  openGraph: {
    url: "/contact",
    title: "Contact Dukhata",
    description: "Email or WhatsApp Dukhata support, and what to expect when you do.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Dukhata" }],
  },
};

const REPLY_TIMES = [
  "Licence, refund and general questions: we reply within 7 days.",
  "Data access or account-deletion requests: completed within 30 days.",
];

export default function ContactPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-app">
      <SiteHeader />

      <SmoothScroll className="flex-1">
        <main id="main">
          <Container className="max-w-3xl py-14 lg:py-20">
            <p className="eyebrow">Contact</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
              Contact Dukhata
            </h1>
            <p className="mt-5 text-base leading-relaxed text-ink-muted">
              Questions about a licence, a refund, or your data? Two ways to reach us, and both go
              to the same people who build and run Dukhata.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <section
                className="flex flex-col rounded-card border border-line bg-surface p-5"
                data-reveal=""
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-brand-600 text-white shadow-brand">
                  <Mail className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-base font-semibold text-ink">Email us</h2>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-subtle">
                  Best for refunds, data requests and anything you want in writing.
                </p>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="focus-ring mt-4 rounded font-semibold text-brand-700 underline-offset-2 hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
              </section>

              <section
                className="flex flex-col rounded-card border border-line bg-surface p-5"
                data-reveal=""
                data-reveal-delay="60"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-[#25D366] text-white">
                  <MessageCircle className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-base font-semibold text-ink">WhatsApp us</h2>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-subtle">
                  Best for buying a licence or an activation code. Payment is arranged here.
                </p>
                <a
                  href={getWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring mt-4 rounded font-semibold text-brand-700 underline-offset-2 hover:underline"
                >
                  {WHATSAPP_NUMBER_DISPLAY}
                </a>
              </section>
            </div>

            <section className="mt-12" data-reveal="">
              <h2 className="text-xl font-semibold text-ink">How long a reply takes</h2>
              <ul className="mt-4 flex flex-col gap-2">
                {REPLY_TIMES.map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-muted">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-12" data-reveal="">
              <h2 className="text-xl font-semibold text-ink">To help us answer faster</h2>
              <ul className="mt-4 flex flex-col gap-2">
                {[
                  "Email us from the address on your account, so we can find it straight away.",
                  "For a licence or refund, include the activation code or payment reference.",
                  "For a data request, say whether you want a copy of your data or full deletion.",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-muted">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm leading-relaxed text-ink-muted">
                You can also delete your account and its records yourself, without emailing us — see{" "}
                <Link
                  href="/delete-account"
                  className="focus-ring rounded font-medium text-brand-700 underline-offset-2 hover:underline"
                >
                  Delete your account
                </Link>
                . What we store, and why, is set out in the{" "}
                <Link
                  href="/privacy"
                  className="focus-ring rounded font-medium text-brand-700 underline-offset-2 hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </section>
          </Container>
        </main>
      </SmoothScroll>

      <SiteFooter />
    </div>
  );
}
