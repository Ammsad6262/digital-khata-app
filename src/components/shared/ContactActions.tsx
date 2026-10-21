"use client";

/**
 * ContactActions — one-tap Call / WhatsApp buttons for a stored phone number.
 *
 * The point of the app is that the owner never leaves it to do the obvious
 * next thing: chase a payment, confirm an order, answer a customer. Every
 * place that shows a customer or supplier shows these two buttons, and the
 * WhatsApp message is pre-written so the owner only has to press send.
 */

import { MessageCircle, Phone } from "lucide-react";
import { getCallLink, getContactWhatsAppLink } from "@/lib/utils/whatsapp";
import { useLanguage } from "@/providers/language-provider";

export function ContactActions({
  phone,
  whatsappMessage,
  className,
  compact = false,
}: {
  phone: string | null | undefined;
  /** Pre-filled text. The owner still presses send — nothing is sent for them. */
  whatsappMessage?: string;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useLanguage();

  const callHref = getCallLink(phone);
  const waHref = getContactWhatsAppLink(phone, whatsappMessage);
  if (!callHref || !waHref) return null;

  const padding = compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs";

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <a
        href={callHref}
        aria-label={t("contact.call")}
        className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.97] ${padding}`}
      >
        <Phone className="h-3.5 w-3.5" />
        {t("contact.call")}
      </a>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("contact.whatsapp")}
        className={`inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 font-semibold text-emerald-700 hover:bg-emerald-100 active:scale-[0.97] ${padding}`}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {t("contact.whatsapp")}
      </a>
    </div>
  );
}
