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
      "A digital khata is your shop's ledger kept on a phone instead of paper. You record each sale, udhaar and payment, and the app keeps every customer's balance up to date, so you can see who owes what without adding up a notebook.",
  },
  {
    question: "Is Dukhata free to try?",
    answer:
      "Yes. Every new account gets a free 14-day trial with all features, including the AI assistant, and no card is needed. After the trial you can buy a one-time Regular licence for Rs 10,000, or Premium for Rs 3,000 per 30 days which also includes the AI assistant.",
  },
  {
    question: "Can I use Dukhata in Urdu?",
    answer:
      "Yes. You can type or speak in Urdu, Roman Urdu, English, or a mix of them, and no language setting has to be chosen. For example, saying or typing \"Ali ko 500 udhar diye\" creates a credit sale for Ali that you confirm with one tap.",
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
