"use client";

/**
 * ShareReceipt — sends the customer their sale receipt in one tap.
 *
 * The text is built from the saved sale (see lib/utils/receipt.ts), so the
 * figures always match the sale detail screen. The owner still presses send;
 * nothing is marked as delivered.
 */

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, MessageCircle, Printer } from "lucide-react";
import { getContactWhatsAppLink } from "@/lib/utils/whatsapp";
import { useLanguage } from "@/providers/language-provider";

export function ShareReceipt({
  phone,
  message,
  printHref,
}: {
  phone: string | null | undefined;
  /** Already-built receipt text. */
  message: string;
  /** Printable receipt page for this sale. */
  printHref?: string;
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const waHref = getContactWhatsAppLink(phone, message);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the WhatsApp button still works.
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface shadow-card p-3.5">
      <p className="text-sm font-semibold text-ink">{t("receipt.shareTitle")}</p>
      <p className="mt-0.5 text-xs text-ink-subtle">
        {waHref ? t("receipt.shareHint") : t("statement.needsPhone")}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-success/20 bg-success-soft px-3 py-2 text-xs font-semibold text-success-ink hover:bg-success-soft active:scale-[0.97]"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {t("statement.sendWhatsApp")}
          </a>
        ) : null}

        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-app active:scale-[0.97]"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t("statement.copied") : t("statement.copy")}
        </button>

        {printHref ? (
          <Link
            href={printHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-app active:scale-[0.97]"
          >
            <Printer className="h-3.5 w-3.5" />
            {t("receipt.print")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
