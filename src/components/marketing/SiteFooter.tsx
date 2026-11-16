import Link from "next/link";
import { Logo } from "./Logo";
import { Container } from "./Container";
import { CONTACT_EMAIL } from "@/content/marketing";
import { OPERATOR } from "@/content/legal";

/**
 * Marketing site footer. Plain links, the real support address, and honest
 * placeholders for social accounts that do not exist yet (no invented URLs).
 */

const PRODUCT = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

const COMPANY = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const LEGAL = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refunds" },
  { href: "/delete-account", label: "Delete account" },
];

// No real accounts exist yet, so these are inert placeholders, not links.
const SOCIALS = ["Facebook", "Instagram", "YouTube"];

function LinkColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="focus-ring rounded text-sm text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <Container className="py-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              A digital khata for Pakistani shops. Record a sale, an udhaar or a payment in
              seconds, and keep every customer balance correct.
            </p>
            <p className="mt-4 text-sm">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="focus-ring rounded font-medium text-brand-700 underline-offset-2 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>

          <LinkColumn title="Product" links={PRODUCT} />
          <LinkColumn title="Company" links={COMPANY} />
          <LinkColumn title="Legal" links={LEGAL} />
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {SOCIALS.map((name) => (
              <span
                key={name}
                aria-disabled="true"
                title={`${name} — coming soon`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-subtle"
              >
                {name}
                <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  soon
                </span>
              </span>
            ))}
          </div>

          <p className="text-xs text-ink-faint">
            © {new Date().getFullYear()} {OPERATOR.legalName} · Made in {OPERATOR.city},{" "}
            {OPERATOR.country}
          </p>
        </div>
      </Container>
    </footer>
  );
}
