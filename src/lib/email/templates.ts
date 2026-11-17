/**
 * Email templates — plain, short, and honest.
 *
 * The verification email is bilingual: a short English body and one Urdu
 * sentence, because the product is used in both languages and the recipient's
 * language is not known until they are signed in on this device.
 *
 * No emoji, no gradients, no tracking pixels. The code is repeated in a
 * monospaced block so it is easy to read on a phone and easy to copy.
 */

export type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

const BRAND = "Dukhata";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "123456" → "1 2 3 4 5 6" — the spaced form readers can scan. */
function spaced(code: string): string {
  return code.split("").join(" ");
}

export function buildVerificationEmail(input: {
  name?: string | null;
  code: string;
  expiresInMinutes?: number;
}): EmailContent {
  const expires = input.expiresInMinutes ?? 10;
  const code = input.code;
  const shownCode = spaced(code);
  const name = (input.name ?? "").trim();
  const greeting = name ? `Assalam-o-Alaikum ${name},` : "Assalam-o-Alaikum,";
  const subject = "Your Dukhata verification code";

  const text = [
    greeting,
    "",
    `Your ${BRAND} verification code is:`,
    "",
    `    ${shownCode}`,
    "",
    `It expires in ${expires} minutes. Enter it on the verification page to confirm this email address.`,
    "",
    "If you didn't ask for this, you can ignore this email. Your account stays as it is.",
    "",
    "السلام علیکم،",
    `آپ کا دکھاتہ تصدیقی کوڈ ${shownCode} ہے۔ یہ کوڈ ${expires} منٹ میں ختم ہو جائے گا۔ اگر آپ نے یہ درخواست نہیں کی تو اس ای میل کو نظر انداز کر دیں۔`,
    "",
    `— ${BRAND}`,
  ].join("\n");

  const safeCode = escapeHtml(shownCode);
  const safeExpires = escapeHtml(String(expires));
  const safeGreeting = escapeHtml(greeting);
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f7f6f3;color:#1c1917;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:440px;margin:0 auto;background:#fffdfa;border:1px solid #ebe7e1;border-radius:16px;padding:24px;">
      <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#66605c;">${BRAND}</p>
      <h1 style="margin:0 0 16px;font-size:19px;line-height:1.3;color:#1c1917;">Confirm your email address</h1>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#57534e;">${safeGreeting}</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#57534e;">Enter this code to finish verifying your account:</p>
      <p style="margin:0 0 16px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:26px;font-weight:600;letter-spacing:0.14em;color:#1c1917;">${safeCode}</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#57534e;">It expires in ${safeExpires} minutes.</p>
      <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#66605c;">If you didn't ask for this, ignore this email. Your account stays as it is.</p>
      <p style="margin:0;padding-top:16px;border-top:1px solid #ebe7e1;font-size:13px;line-height:1.9;color:#57534e;" dir="rtl" lang="ur">
        السلام علیکم،<br />
        آپ کا دکھاتہ تصدیقی کوڈ ${safeCode} ہے۔ یہ کوڈ ${safeExpires} منٹ میں ختم ہو جائے گا۔ اگر آپ نے یہ درخواست نہیں کی تو اس ای میل کو نظر انداز کر دیں۔
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}