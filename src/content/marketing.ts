/**
 * Marketing copy for the public landing page (/).
 *
 * Kept away from the legal documents so the two never drift: the support
 * address comes from OPERATOR in src/content/legal.ts, which is the single
 * place it is defined.
 *
 * The FAQ answers below are also emitted as FAQPage structured data on the
 * landing page, so search engines can show them as rich results. Keep each
 * answer accurate and self-contained: it may appear in a search result with no
 * surrounding page.
 */

import { OPERATOR } from "./legal";

export const CONTACT_EMAIL = OPERATOR.contactEmail;

export const HOME_FAQ: Array<{ question: string; answer: string }> = [
  {
    question: "What is a digital khata?",
    answer:
      "A digital khata is a shop's paper ledger kept on a phone instead of in a notebook. Dukhata records each sale, each udhaar (credit) and each payment against a named customer, then recalculates that customer's balance immediately, so the owner can see who owes money without adding up pages by hand. In Dukhata the same ledger also carries stock, expenses and one-tap Call or WhatsApp follow-ups, because those are the next questions a shopkeeper asks after \"who owes me\". It is built for Pakistani shops — kiryana and general stores, wholesalers, medical stores and hardware shops — and runs on the phone the owner already has, in the browser or installed to the home screen. Records can be exported as a file or deleted at any time.",
  },
  {
    question: "Is Dukhata free to try?",
    answer:
      "Yes. Every new Dukhata account starts with a free 14-day trial that includes every feature, including the AI assistant, and no card is needed. When the trial ends the account is not deleted: the shop's records stay stored and access can be activated with a licence code. After the trial there are two options. The Regular licence costs PKR 10,000 once and gives permanent access to the core app — customers, sales, payments, stock, expenses and reports — but not the AI assistant. Premium costs PKR 3,000 for 30 days and includes core plus the AI assistant; renewing while a Premium period is still running adds the new 30 days to the end instead of restarting the clock. All prices are in Pakistani rupees.",
  },
  {
    question: "Can I use Dukhata in Urdu?",
    answer:
      "Yes. Dukhata accepts Urdu script, Roman Urdu and English, and the owner does not choose a language before speaking. Saying or typing \"Ali ko 500 udhaar diye\" — Roman Urdu for \"gave Ali 500 on credit\" — creates a draft sale for the customer Ali, with the amount 500 and no payment received, which the owner confirms with one tap. The same sentence works in Urdu script or English. The assistant shows what it understood before anything is saved, so a misheard word never writes to the ledger by itself. The interface is available in English and Urdu, including a right-to-left layout. The AI assistant is included in the 14-day trial and in Premium; the one-time Regular licence does not include AI features.",
  },
  {
    question: "Do I need special hardware or a card machine?",
    answer:
      "No. Dukhata runs in the browser on the phone you already own, and it can be installed to the home screen like an app. There is nothing to buy and no terminal to set up.",
  },
  {
    question: "What happens to my shop's data if I stop paying?",
    answer:
      "Your records belong to you. You can export your data at any time from Backup inside the app, and you can delete your account and its data at any time. A Regular licence is permanent and does not expire.",
  },
  {
    question: "Is my shop's data private?",
    answer:
      "Your account and your customers' records are isolated per user, passwords are stored only as one-way hashes, and traffic is encrypted. The assistant sends only the sentence you dictate to Google's Gemini API to be interpreted, and the Privacy Policy explains exactly what is collected and how to delete it.",
  },
];

/**
 * Longer, self-contained passages. Each one answers a single question in
 * 134-167 words, starts with a direct answer, names Dukhata explicitly and
 * carries verifiable specifics. That is the shape answer engines quote and the
 * shape the GEO citability scorer rewards; it also happens to be the detail a
 * shopkeeper wants before paying. Keep the facts consistent with
 * docs/COMMERCIAL_LICENSING.md and the legal pages.
 */
export const HOME_DETAILS: Array<{ title: string; body: string }> = [
  {
    title: "How a customer's balance stays correct",
    body: "Dukhata keeps a customer's balance correct by recalculating it from the entries attached to that customer, instead of trusting a number typed by hand. The balance is the opening balance, plus every confirmed sale, minus every payment, plus any adjustment; voided entries are excluded, so a cancelled mistake stops affecting the total. A shopkeeper moving from a paper notebook enters the outstanding amount once as that customer's opening balance, and the history starts there. A partial payment reduces the balance by exactly what was received and leaves the rest owing, while an advance paid ahead makes the balance negative, which Dukhata shows as credit rather than hiding. The same figures drive the customer screen, the khata list and the reports, so two screens cannot disagree about what is owed.",
  },
  {
    title: "Where your shop's data is stored",
    body: "Dukhata stores a shop's records in a PostgreSQL database hosted on Supabase, and serves the application from Vercel, both on secure cloud infrastructure. The account is protected by a password stored as a one-way bcrypt hash and an optional four to six digit PIN, also hashed; sessions use signed, HttpOnly cookies. Every request can read and write only the signed-in shop's rows, enforced by row-level security inside the database as well as by the API. The shopkeeper can export the records from the Backup screen at any time, and can delete the account, which removes its customers, sales, payments, stock and expenses. Email verification and password reset codes are stored only as hashes. Backups persist for a short period after deletion, and licence or payment records may be kept where needed to answer a dispute.",
  },
  {
    title: "How the AI assistant turns a sentence into an entry",
    body: "Dukhata's AI assistant converts one spoken or typed sentence into a draft entry, but it never writes to the ledger by itself. Speaking “Ali ko 500 udhaar diye” sends that sentence to Google's Gemini API, which returns the customer name, the amount and the intent; Dukhata shows those fields for confirmation, and the sale is saved only when the shopkeeper taps confirm. Audio is transcribed for that request and is not retained afterwards. When the sentence is ambiguous — a similar customer name, a missing quantity, or a price that differs from the last recorded one — the assistant asks or flags it instead of guessing. The assistant is included in the free 14-day trial and in Premium at PKR 3,000 per 30 days; the one-time Regular licence at PKR 10,000 does not include AI features.",
  },
  {
    title: "What Dukhata costs and what each licence includes",
    body: "Dukhata has three ways to use it, all priced in Pakistani rupees. Every new account begins with a free 14-day trial that includes every feature, including the AI assistant, and needs no card. After the trial, the Regular licence costs PKR 10,000 once and gives permanent access to the core app — customers, sales, payments, stock, expenses, reports and backups — but excludes the AI assistant. Premium costs PKR 3,000 for 30 days and includes the core app plus the assistant; renewing while a period is still running adds the new 30 days to the end instead of restarting the clock. Licences are delivered as single-use activation codes, so nothing is charged automatically and Dukhata stores no card details. Prices may change for future purchases but never reduce access already paid for.",
  },
];
