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

// ────────────────────────────────────────────────────────────────────────────
// Step-up confirmation for a destructive account action
// ────────────────────────────────────────────────────────────────────────────

import type { ConfirmableAction } from "@/lib/account/action-confirmation";

const ACTION_COPY: Record<
  ConfirmableAction,
  { subject: string; heading: string; request: string; effect: string }
> = {
  delete_account: {
    subject: "Confirm deleting your Dukhata account",
    heading: "Delete your account?",
    request: "You asked to delete your Dukhata account.",
    effect: "This permanently deletes your account and every customer, sale, product, expense and payment in it. It cannot be undone.",
  },
  change_password: {
    subject: "Confirm changing your Dukhata password",
    heading: "Change your password?",
    request: "You asked to change the password on your Dukhata account.",
    effect: "Once confirmed, the new password is the only one that will work. Anyone already signed in on the old password will be signed out.",
  },
  clear_data: {
    subject: "Confirm clearing your Dukhata business data",
    heading: "Clear your business data?",
    request: "You asked to clear the business data in Dukhata.",
    effect: "This deletes every customer, sale, product, stock record, expense and payment. Your login and licence stay, but the records cannot be recovered.",
  },
  export_data: {
    subject: "Confirm exporting your Dukhata data",
    heading: "Export all your data?",
    request: "You asked to download a full copy of your Dukhata data.",
    effect: "The download contains your customers, sales, products, payments and expenses. Keep the file safe — it is your whole khata.",
  },
  reset_pin: {
    subject: "Confirm resetting your Dukhata PIN",
    heading: "Forgot your PIN?",
    request: "You asked to remove the security PIN from your Dukhata app.",
    effect: "The PIN will be removed, so the app opens without it on this device. You can set a new PIN afterwards in Settings, Security.",
  },
};

export function buildActionConfirmationEmail(input: {
  name?: string | null;
  code: string;
  action: ConfirmableAction;
  expiresInMinutes?: number;
}): EmailContent {
  const expires = input.expiresInMinutes ?? 10;
  const shownCode = spaced(input.code);
  const name = (input.name ?? "").trim();
  const greeting = name ? `Assalam-o-Alaikum ${name},` : "Assalam-o-Alaikum,";
  const copy = ACTION_COPY[input.action];

  const text = [
    greeting,
    "",
    copy.request,
    "",
    `To confirm, enter this code in the app:`,
    "",
    `    ${shownCode}`,
    "",
    `It expires in ${expires} minutes.`,
    "",
    `What happens next: ${copy.effect}`,
    "",
    "If you did not start this, do not enter the code and do not share it with anyone.",
    "Someone else may have your phone. Change your Dukhata password as soon as you can.",
    "",
    "If you did nothing, your account is unchanged.",
    "",
    "اگر آپ نے یہ درخواست نہیں کی تو یہ کوڈ کسی کو نہ بتائیں۔",
    "",
    `- ${BRAND}`,
  ].join("\n");

  const safeCode = escapeHtml(shownCode);
  const safeGreeting = escapeHtml(greeting);
  const safeHeading = escapeHtml(copy.heading);
  const safeRequest = escapeHtml(copy.request);
  const safeEffect = escapeHtml(copy.effect);
  const safeExpires = escapeHtml(String(expires));

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f7f6f3;color:#1c1917;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:440px;margin:0 auto;background:#fffdfa;border:1px solid #ebe7e1;border-radius:16px;padding:24px;">
      <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#66605c;">${BRAND}</p>
      <h1 style="margin:0 0 16px;font-size:19px;line-height:1.3;color:#1c1917;">${safeHeading}</h1>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#57534e;">${safeGreeting}</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#57534e;">${safeRequest}</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#57534e;">Enter this code in the app to confirm:</p>
      <p style="margin:0 0 16px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:26px;font-weight:600;letter-spacing:0.14em;color:#1c1917;">${safeCode}</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#57534e;">It expires in ${safeExpires} minutes.</p>
      <p style="margin:0 0 16px;padding:12px;border-radius:10px;background:#fdf6f6;border:1px solid #f3dede;font-size:13px;line-height:1.6;color:#7f1d1d;">
        <strong style="color:#991b1b;">What happens next:</strong> ${safeEffect}
      </p>
      <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#66605c;">
        If you did not start this, do not enter the code and do not share it. Someone else may have your phone, so change your Dukhata password when you can. If you did nothing, your account is unchanged.
      </p>
      <p style="margin:0;padding-top:16px;border-top:1px solid #ebe7e1;font-size:13px;line-height:1.9;color:#57534e;" dir="rtl" lang="ur">
        اگر آپ نے یہ درخواست نہیں کی تو یہ کوڈ کسی کو نہ بتائیں۔
      </p>
    </div>
  </body>
</html>`;

  return { subject: copy.subject, text, html };
}