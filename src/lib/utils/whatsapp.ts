export const WHATSAPP_NUMBER_DISPLAY = "03183494917";
export const WHATSAPP_NUMBER_INTL = "923183494917";
export function getWhatsAppLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER_INTL}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
export function getDefaultWhatsAppMessage(userName?: string): string {
  const name = userName ? ` My name is ${userName}.` : "";
  return `Hello Digital Khata, my free trial has ended and I would like an activation code.${name}`;
}
