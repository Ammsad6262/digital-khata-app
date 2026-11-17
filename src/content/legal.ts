/**
 * Legal documents shown at /privacy, /terms, /refund-policy and /delete-account.
 *
 * Source of truth for the published text. Edit the strings here and the pages
 * update on the next deploy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OPERATOR DETAILS - THE ONLY BLOCK YOU SHOULD NEED TO EDIT
 *
 * These were filled in automatically. Check the three values below and change
 * any that are wrong; nothing else in this file needs editing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const OPERATOR = {
  /** The business or person customers are contracting with. */
  legalName: "Dukhata",
  /** Support address, confirmed by the owner. */
  contactEmail: "dukhata.app@gmail.com",
  /** City whose courts hear disputes. */
  city: "Karachi",
  country: "Pakistan",
};

/** Replaces {{TOKENS}} in the document text with the operator details above. */
export function fillPlaceholders(text: string): string {
  return text
    .replaceAll("{{LEGAL_NAME}}", OPERATOR.legalName)
    .replaceAll("{{CONTACT_EMAIL}}", OPERATOR.contactEmail)
    .replaceAll("{{CITY}}", OPERATOR.city)
    .replaceAll("{{COUNTRY}}", OPERATOR.country);
}

export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "note"; text: string };

export type LegalDocument = {
  slug: string;
  title: string;
  summary: string;
  effectiveDate: string;
  blocks: LegalBlock[];
};

const EFFECTIVE_DATE = "16 November 2026";

export const PRIVACY_POLICY: LegalDocument = {
  slug: "privacy",
  title: "Privacy Policy",
  summary:
    "What Dukhata collects, why, who else sees it, how long it is kept, and how to get it deleted.",
  effectiveDate: EFFECTIVE_DATE,
  blocks: [
    { kind: "p", text: "Dukhata is a record-keeping app for shopkeepers. It keeps a khata (ledger) of your customers, sales, payments, stock and expenses, and it offers an AI assistant that reads or listens to a sentence and prepares an entry for you to confirm." },
    { kind: "p", text: "This policy explains what we do with personal data. It applies to the Dukhata app and website at dukhata.com." },
    { kind: "p", text: "Contact: {{LEGAL_NAME}}, {{CONTACT_EMAIL}}." },

    { kind: "h", text: "1. Two roles: your account, and your customers' records" },
    { kind: "p", text: "This distinction matters, so we state it first." },
    { kind: "ul", items: [
      "**Your account data** (your name, email, password hash, business settings). We decide how this is used, so we are the controller of it.",
      "**The records you enter about other people** (your customers' names, phone numbers, addresses, notes, balances). Those people are your customers, not ours. You decide why you hold that information, so **you are the controller and we are your processor**: we only store and process it to run the app for you, on your instructions.",
    ] },
    { kind: "p", text: "Because of that, if one of your customers asks to see or delete their information, the request belongs to you. We will help you do it, but we cannot decide it for you." },

    { kind: "h", text: "2. What we collect" },
    { kind: "ul", items: [
      "**Account:** your name, your email address, and a bcrypt hash of your password. We never store your password itself.",
      "**Business settings:** business name, currency, units, theme, timezone, and an optional 4-6 digit PIN stored only as a hash.",
      "**Records you enter:** customers (name, phone, address, notes), products, sales and sale items, payments, expenses, stock movements, suppliers, reminders, follow-ups, and an audit log of changes you make.",
      "**AI inputs:** the text you type, or the voice recording you make, in the assistant. Audio is sent to Google's Gemini API to be transcribed and turned into a structured draft. We do not keep your audio; we keep the resulting draft and action until it is confirmed, cancelled, or expires.",
      "**Technical data:** a signed session cookie so you stay logged in, your IP address (used to rate-limit and block abuse), and aggregate page-view statistics from Vercel Analytics, which is cookieless and does not track you across other websites.",
    ] },

    { kind: "h", text: "3. Why we process it" },
    { kind: "ul", items: [
      "**To provide the service** you asked for: your account, your ledger, your reports. This is performance of our contract with you.",
      "**To keep it secure:** rate limiting, abuse prevention, audit logs. This is our legitimate interest in protecting the service and your data.",
      "**To run AI features** you choose to use. This happens at your request.",
      "**To meet legal obligations**, such as responding to a lawful request or resolving a payment dispute.",
    ] },

    { kind: "h", text: "4. AI features" },
    { kind: "p", text: "The assistant is powered by Google's Gemini models through the Gemini API. When you use it, the text or audio you provide is sent to Google to be processed. We do not use your data to train AI models, and we do not sell it." },
    { kind: "note", text: "AI output can be wrong. The app always shows you a draft to confirm, and an action is only saved when you confirm it. Check the numbers before you confirm." },

    { kind: "h", text: "5. Who else processes your data" },
    { kind: "ul", items: [
      "**Vercel** - application hosting and cookieless page-view analytics.",
      "**Supabase** - the PostgreSQL database that stores your records.",
      "**Google (Gemini API)** - AI transcription and interpretation for the assistant features.",
    ] },
    { kind: "p", text: "We do not sell your data and we do not share it with advertisers. We share it only with the providers above, or where the law requires it." },

    { kind: "h", text: "6. Where your data is stored" },
    { kind: "p", text: "Your data is stored on secure cloud servers, with copies for backup. Requests are served from the data centre closest to you." },

    { kind: "h", text: "7. How long we keep it" },
    { kind: "ul", items: [
      "**Account and records:** while your account exists. When you delete your account, your records are deleted with it.",
      "**AI drafts:** short-lived; unconfirmed drafts expire.",
      "**Daily AI counters:** kept to enforce usage limits.",
      "**Backups:** deleted data may remain in a backup for a short period before the backup expires.",
    ] },

    { kind: "h", text: "8. Security" },
    { kind: "p", text: "Passwords and PINs are stored as one-way bcrypt hashes. Sessions use signed, HttpOnly cookies. Traffic is encrypted with TLS. Database access is restricted per user with row-level security, and login attempts are rate-limited. No system is perfectly secure, so keep your password and PIN private and tell us if you think your account was accessed by someone else." },

    { kind: "h", text: "9. Your rights" },
    { kind: "ul", items: [
      "**See your data:** export it from the app (More, then Backup), or ask us.",
      "**Correct it:** edit any record, or ask us to correct your account details.",
      "**Delete it:** delete your account in the app (More, then Settings), or ask us. See the Data Deletion page.",
      "**Portability:** export your records as a file.",
      "**Object or restrict:** tell us what you object to and we will explain what we can change.",
    ] },
    { kind: "p", text: "Write to {{CONTACT_EMAIL}} and we will respond within 30 days." },

    { kind: "h", text: "10. Children" },
    { kind: "p", text: "Dukhata is a business tool and is not intended for anyone under 18." },

    { kind: "h", text: "11. Cookies" },
    { kind: "p", text: "We set one essential cookie to keep you logged in. We do not use advertising or cross-site tracking cookies." },

    { kind: "h", text: "12. Changes" },
    { kind: "p", text: "If this policy changes in a way that matters, we will update the effective date and tell you in the app." },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  slug: "terms",
  title: "Terms of Service",
  summary:
    "The rules for using Dukhata, what you pay for, and what happens if something goes wrong.",
  effectiveDate: EFFECTIVE_DATE,
  blocks: [
    { kind: "p", text: "These terms are an agreement between you and {{LEGAL_NAME}} for the Dukhata app and website. By creating an account or using the app, you accept them." },

    { kind: "h", text: "1. What Dukhata is, and what it is not" },
    { kind: "p", text: "Dukhata is record-keeping software. It helps you write down and understand your own business records." },
    { kind: "note", text: "It is not accounting, tax, investment or legal advice, and it is not a substitute for a qualified accountant. You are responsible for the accuracy of what you enter and for the decisions you take from it." },

    { kind: "h", text: "2. Who can use it" },
    { kind: "p", text: "You must be at least 18 and using Dukhata for a business you own or are authorised to manage. You are responsible for keeping your password and PIN private and for everything done through your account." },

    { kind: "h", text: "3. Plans and prices" },
    { kind: "ul", items: [
      "**Free trial (14 days):** full access including the AI assistant, so you can evaluate the app. It is temporary and is not a paid product.",
      "**Regular licence (PKR 10,000, one-time):** permanent access to the core app. It does **not** include the AI assistant.",
      "**Premium (PKR 3,000 per 30 days, renewable):** core app plus the AI assistant. Access is added to the end of an existing Premium period if one is still running.",
      "**Activation codes:** the licence you buy is delivered as a code. Codes are single-use, tied to one account, may carry an expiry date, and are not transferable.",
    ] },
    { kind: "p", text: "Prices may change for future purchases. A change never reduces access you have already paid for." },

    { kind: "h", text: "4. AI features" },
    { kind: "p", text: "The AI assistant prepares drafts for you to confirm; it does not write to your books on its own. AI can be wrong or unavailable, and it has daily usage limits. Always check a draft before confirming it." },

    { kind: "h", text: "5. Acceptable use" },
    { kind: "ul", items: [
      "Do not use Dukhata for anything unlawful, or to record information you have no right to hold.",
      "Only enter other people's information (your customers' names, phone numbers and notes) when you are entitled to hold it for your business. You are responsible for that.",
      "Do not try to break, overload or reverse-engineer the app, or access another account.",
      "Do not resell access or share a code except as the licence allows.",
      "Codes obtained by fraud, or payments reversed by a chargeback, may be revoked.",
    ] },

    { kind: "h", text: "6. Your data" },
    { kind: "p", text: "Your business records belong to you. You give us permission to store and process them only to run the app for you, as described in the Privacy Policy." },

    { kind: "h", text: "7. Availability" },
    { kind: "p", text: "We work to keep Dukhata available, but we do not promise uninterrupted or error-free service. We may pause the app briefly for maintenance or updates." },

    { kind: "h", text: "8. Suspension and ending your account" },
    { kind: "p", text: "You may stop using Dukhata and delete your account at any time. We may suspend or end access if these terms are seriously or repeatedly broken, or if the law requires it. Where we can, we will tell you first." },

    { kind: "h", text: "9. Disclaimers and limit of liability" },
    { kind: "p", text: "Dukhata is provided as it is. To the extent the law allows, we are not liable for lost profits or business, or for indirect losses, and our total liability is limited to the amount you paid us in the 12 months before the claim." },
    { kind: "p", text: "This does not exclude liability that cannot lawfully be excluded." },

    { kind: "h", text: "10. Your responsibility to others" },
    { kind: "p", text: "If someone claims that information you entered about them was held unlawfully, you are responsible for that claim. We will cooperate with a lawful request and help you answer it." },

    { kind: "h", text: "11. Governing law" },
    { kind: "p", text: "These terms are governed by the laws of Pakistan, and the courts of {{CITY}} have jurisdiction." },

    { kind: "h", text: "12. Changes" },
    { kind: "p", text: "We may update these terms. If a change matters, we will update the effective date and tell you in the app. Continuing to use Dukhata after a change means you accept it." },

    { kind: "p", text: "Questions: {{CONTACT_EMAIL}}." },
  ],
};

export const REFUND_POLICY: LegalDocument = {
  slug: "refund-policy",
  title: "Refund Policy",
  summary: "When a licence can be refunded, and how to ask.",
  effectiveDate: EFFECTIVE_DATE,
  blocks: [
    { kind: "p", text: "The 14-day free trial exists so you can test Dukhata before paying. Please use it: a refund is easier to give before a code has been used." },

    { kind: "h", text: "1. Free trial" },
    { kind: "p", text: "The trial is free and needs no refund. It expires on its own after 14 days." },

    { kind: "h", text: "2. Activation codes that have not been used" },
    { kind: "p", text: "An unredeemed code can be refunded within 7 days of purchase. Once a code has been redeemed on an account, it cannot be reversed." },

    { kind: "h", text: "3. Regular licence (PKR 10,000, one-time)" },
    { kind: "ul", items: [
      "If the code has not been redeemed, it can be refunded within 7 days of purchase (section 2).",
      "If it has been redeemed, the licence is considered delivered and is not refundable, except where the app did not work as described and we could not fix it for you.",
    ] },

    { kind: "h", text: "4. Premium (PKR 3,000 per 30 days)" },
    { kind: "ul", items: [
      "Because access begins the moment a code is redeemed, a redeemed Premium code is not refundable simply because you changed your mind.",
      "If you are charged twice for the same period, or a code does not work, we will fix it or refund it.",
      "If Premium access is unavailable for a long period because of a fault on our side, we will extend your access or refund the affected days.",
    ] },

    { kind: "h", text: "5. How to ask" },
    { kind: "p", text: "Email {{CONTACT_EMAIL}} from the address on your account, with the code or payment reference and what went wrong. We reply within 7 days and refund to the same payment method you used." },

    { kind: "h", text: "6. Chargebacks" },
    { kind: "p", text: "Please contact us before raising a chargeback; it is almost always faster. A reversed payment may lead to the related code being revoked." },

    { kind: "h", text: "7. Your statutory rights" },
    { kind: "p", text: "Nothing here removes any right you have under the law that cannot be waived." },
  ],
};

export const DATA_DELETION: LegalDocument = {
  slug: "delete-account",
  title: "Delete Your Account and Data",
  summary: "How to remove your account and the records inside it.",
  effectiveDate: EFFECTIVE_DATE,
  blocks: [
    { kind: "h", text: "Delete from inside the app (fastest)" },
    { kind: "ul", items: [
      "Open Dukhata and go to **More**, then **Settings**.",
      "Choose **Delete account** and confirm with your password.",
      "Your account and its records are deleted immediately.",
    ] },

    { kind: "h", text: "Ask us instead" },
    { kind: "p", text: "Email {{CONTACT_EMAIL}} from the address on your account with the subject \"Delete my account\". We will confirm and complete it within 30 days." },

    { kind: "h", text: "What is deleted" },
    { kind: "ul", items: [
      "Your account and login (name, email, password hash).",
      "Your business settings and PIN.",
      "Your customers, products, sales, payments, expenses, stock movements, suppliers, reminders and follow-ups.",
      "Your AI drafts and audit log entries.",
    ] },

    { kind: "h", text: "What may remain for a short time" },
    { kind: "ul", items: [
      "Backup copies, until the backup expires.",
      "Aggregate, non-personal counters used to enforce AI usage limits.",
      "Payment and licence records we must keep to answer a dispute or meet a legal duty.",
    ] },

    { kind: "h", text: "Before you delete" },
    { kind: "p", text: "Export your data first (More, then Backup). Deletion cannot be undone." },

    { kind: "h", text: "Are you a customer of a shop that uses Dukhata?" },
    { kind: "p", text: "Then your details were entered by that shop, who is responsible for them. Ask the shop to correct or delete your details. We do not have a direct relationship with you, but we provide tools that let the shop do this promptly." },

    { kind: "p", text: "Questions: {{CONTACT_EMAIL}}." },
  ],
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  PRIVACY_POLICY,
  TERMS_OF_SERVICE,
  REFUND_POLICY,
  DATA_DELETION,
];

export function getLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}
