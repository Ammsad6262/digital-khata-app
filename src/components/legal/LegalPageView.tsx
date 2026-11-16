import Link from "next/link";
import { fillPlaceholders, type LegalDocument } from "@/content/legal";

/**
 * Renders a legal document. Deliberately plain and readable: these pages are
 * linked from app stores and are read once, on a phone, by a shopkeeper.
 *
 * `**bold**` inside a paragraph is rendered as <strong>.
 */

function withBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-semibold text-ink">
        {part}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export function LegalPageView({ doc }: { doc: LegalDocument }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <Link href="/" className="text-sm text-ink-subtle underline-offset-2 hover:underline">
        Dukhata
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-ink">{doc.title}</h1>
      <p className="mt-2 text-sm text-ink-subtle">{fillPlaceholders(doc.summary)}</p>
      <p className="mt-1 text-xs text-ink-faint">Effective {doc.effectiveDate}</p>

      <div className="mt-8 space-y-5">
        {doc.blocks.map((block, index) => {
          if (block.kind === "h") {
            return (
              <h2 key={index} className="pt-2 text-base font-semibold text-ink">
                {block.text}
              </h2>
            );
          }
          if (block.kind === "ul") {
            return (
              <ul key={index} className="space-y-2">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex gap-2 text-sm leading-relaxed text-ink-muted">
                    <span aria-hidden="true" className="text-ink-faint">
                      •
                    </span>
                    <span>{withBold(fillPlaceholders(item))}</span>
                  </li>
                ))}
              </ul>
            );
          }
          if (block.kind === "note") {
            return (
              <p
                key={index}
                className="rounded-card border border-line bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink"
              >
                {withBold(fillPlaceholders(block.text))}
              </p>
            );
          }
          return (
            <p key={index} className="text-sm leading-relaxed text-ink-muted">
              {withBold(fillPlaceholders(block.text))}
            </p>
          );
        })}
      </div>

      <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-sm">
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
      </div>
    </main>
  );
}
