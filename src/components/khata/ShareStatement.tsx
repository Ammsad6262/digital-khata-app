"use client";

/**
 * ShareStatement — sends the customer their khata statement in one tap.
 *
 * The owner never types a summary by hand and never opens another app to
 * explain a balance. The text is generated from the customer's own record
 * (see lib/utils/statement.ts) and the owner still presses send themselves.
 */

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { getContactWhatsAppLink } from "@/lib/utils/whatsapp";
import { useLanguage } from "@/providers/language-provider";

export function ShareStatement({
  phone,
  message,
}: {
  phone: string | null | undefined;
  /** Already-built statement text. */
  message: string;
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
    <section className="rounded-xl border border-slate-200 bg-white p-3.5">
      <p className="text-sm font-semibold text-slate-900">{t("statement.sendTitle")}</p>
      <p className="mt-0.5 text-xs text-slate-500">
        {waHref ? t("statement.sendHint") : t("statement.needsPhone")}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 active:scale-[0.97]"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {t("statement.sendWhatsApp")}
          </a>
        ) : null}

        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 active:scale-[0.97]"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t("statement.copied") : t("statement.copy")}
        </button>
      </div>
    </section>
  );
}
