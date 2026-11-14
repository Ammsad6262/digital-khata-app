"use client";

/**
 * ContactActions — one-tap Call / WhatsApp buttons for a stored phone number.
 *
 * The point of the app is that the owner never leaves it to do the obvious
 * next thing: chase a payment, confirm an order, answer a customer. Every
 * place that shows a customer or supplier shows these two buttons, and the
 * WhatsApp message is pre-written so the owner only has to press send.
 *
 * `iconOnly` is for list rows: two compact round buttons fit beside a balance
 * without pushing the customer's name off the screen.
 */

import { MessageCircle, Phone } from "lucide-react";
import { getCallLink, getContactWhatsAppLink } from "@/lib/utils/whatsapp";
import { useLanguage } from "@/providers/language-provider";
import { cn } from "@/lib/utils/cn";

export function ContactActions({
  phone,
  whatsappMessage,
  className,
  compact = false,
  iconOnly = false,
}: {
  phone: string | null | undefined;
  /** Pre-filled text. The owner still presses send — nothing is sent for them. */
  whatsappMessage?: string;
  className?: string;
  compact?: boolean;
  /** Round icon buttons with no text — for dense rows. */
  iconOnly?: boolean;
}) {
  const { t } = useLanguage();

  const callHref = getCallLink(phone);
  const waHref = getContactWhatsAppLink(phone, whatsappMessage);
  if (!callHref || !waHref) return null;

  if (iconOnly) {
    const size = compact ? "h-8 w-8" : "h-9 w-9";
    return (
      <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
        <a
          href={callHref}
          aria-label={t("contact.call")}
          title={t("contact.call")}
          className={cn(
            size,
            "inline-flex items-center justify-center rounded-full border border-line bg-surface text-ink-muted transition-colors hover:bg-app active:scale-95",
          )}
        >
          <Phone className="h-4 w-4" strokeWidth={2.1} />
        </a>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("contact.whatsapp")}
          title={t("contact.whatsapp")}
          className={cn(
            size,
            "inline-flex items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm transition-[filter] hover:brightness-95 active:scale-95",
          )}
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2.1} />
        </a>
      </div>
    );
  }

  const padding = compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <a
        href={callHref}
        aria-label={t("contact.call")}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border border-line bg-surface font-semibold text-ink-muted hover:bg-app active:scale-[0.97]",
          padding,
        )}
      >
        <Phone className="h-3.5 w-3.5" />
        {t("contact.call")}
      </a>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("contact.whatsapp")}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border border-success/20 bg-success-soft font-semibold text-success-ink hover:bg-success-soft active:scale-[0.97]",
          padding,
        )}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {t("contact.whatsapp")}
      </a>
    </div>
  );
}
