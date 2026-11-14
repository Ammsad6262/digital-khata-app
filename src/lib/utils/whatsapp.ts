export const WHATSAPP_NUMBER_DISPLAY = "03183494917";
export const WHATSAPP_NUMBER_INTL = "923183494917";
export function getWhatsAppLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER_INTL}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
export function getDefaultWhatsAppMessage(userName?: string): string {
  const name = userName ? ` My name is ${userName}.` : "";
  return `Hello Dukhata, my free trial has ended and I would like an activation code.${name}`;
}

/**
 * Pre-filled purchase message for a specific plan, so the chat opens with the
 * right product/price instead of a generic request.
 */
export function getPlanWhatsAppMessage(
  plan: "REGULAR" | "PREMIUM",
  userName?: string,
): string {
  const name = userName ? ` My name is ${userName}.` : "";
  const text =
    plan === "REGULAR"
      ? "Hello Dukhata, I would like to buy the Regular plan (Rs. 10,000 one-time, lifetime). Please send me an activation code."
      : "Hello Dukhata, I would like to buy the Premium plan (Rs. 3,000 / 30 days). Please send me an activation code.";
  return `${text}${name}`;
}

/**
 * Convert a number typed however the shop owner likes ("0300 1234567",
 * "+92 300 1234567", "923001234567") into the digits WhatsApp expects.
 * Returns null when there is nothing usable.
 */
export function toInternationalNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}

/** `tel:` link — keeps the number in its local form, which phones handle best. */
export function getCallLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}

/** WhatsApp chat link for a stored contact, optionally with a pre-filled message. */
export function getContactWhatsAppLink(
  phone: string | null | undefined,
  message?: string,
): string | null {
  const number = toInternationalNumber(phone);
  if (!number) return null;
  const base = `https://wa.me/${number}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
