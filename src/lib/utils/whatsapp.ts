/**
 * WhatsApp integration constants and helpers.
 *
 * The business owner's WhatsApp number is 03183494917.
 * International format: 923183494917 (Pakistan country code = 92).
 */

export const WHATSAPP_NUMBER_DISPLAY = "03183494917";
export const WHATSAPP_NUMBER_INTL = "923183494917";

/**
 * Generate a WhatsApp deep link with a pre-filled message.
 * Works on desktop (web.whatsapp.com), Android, and iPhone.
 */
export function getWhatsAppLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER_INTL}`;
  if (message) {
    return `${base}?text=${encodeURIComponent(message)}`;
  }
  return base;
}

/** Default pre-filled message for trial expiration. */
export function getDefaultWhatsAppMessage(userName?: string): string {
  const name = userName ? ` My name is ${userName}.` : "";
  return `Hello Digital Khata, my free trial has ended and I would like an activation code.${name}`;
}
