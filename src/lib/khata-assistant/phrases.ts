/**
 * Localisation for the Khata Assistant.
 *
 * A tiny phrase table with three variants. English is always complete; Urdu and
 * Roman Urdu cover every headline and the recurring figure labels. Strings that
 * are not translated fall back to English, which is stated honestly in the UI.
 */

import type { KhataLanguage } from "./types";

export type Phrase = { en: string; ur: string; roman: string };

/** Pick the phrase for an answer language. `mixed` uses English prose. */
export function pick(language: KhataLanguage, phrase: Phrase): string {
  switch (language) {
    case "ur":
      return phrase.ur;
    case "roman-ur":
      return phrase.roman;
    default:
      return phrase.en;
  }
}

/** Interpolate {placeholders} in a template. */
export function fill(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

/** Recurring labels, kept in one place so all three languages stay in step. */
export const L = {
  // Money & periods
  billed: { en: "Billed (sales)", ur: "فروخت", roman: "Bikri" },
  cashReceived: { en: "Cash received", ur: "وصول شدہ رقم", roman: "Wasool shuda raqam" },
  outstanding: { en: "Outstanding", ur: "واجب الادا", roman: "Wajib ul ada" },
  receivables: { en: "Customers owe you", ur: "گاہکوں سے وصول کرنا ہے", roman: "Gahakon se wasool karna hai" },
  payables: { en: "You owe suppliers", ur: "سپلائرز کو دینا ہے", roman: "Suppliers ko dena hai" },
  today: { en: "Today", ur: "آج", roman: "Aaj" },
  thisMonth: { en: "This month", ur: "اس مہینے", roman: "Is mahine" },
  lastMonth: { en: "Last month", ur: "پچھلے مہینے", roman: "Pichhle mahine" },
  thisWeek: { en: "This week", ur: "اس ہفتے", roman: "Is hafte" },
  lastWeek: { en: "Last week", ur: "پچھلے ہفتے", roman: "Pichhle hafte" },
  change: { en: "Change", ur: "تبدیلی", roman: "Tabdeeli" },
  count: { en: "Number of sales", ur: "فروخت کی تعداد", roman: "Bikri ki tadaad" },
  discounts: { en: "Discounts", ur: "رعایت", roman: "Riyayat" },

  // Customers & products
  customer: { en: "Customer", ur: "گاہک", roman: "Gahak" },
  customers: { en: "Customers", ur: "گاہک", roman: "Gahak" },
  product: { en: "Product", ur: "مصنوع", roman: "Product" },
  amountOwed: { en: "Amount owed", ur: "واجب الادا رقم", roman: "Wajib ul ada raqam" },
  quantitySold: { en: "Quantity sold", ur: "فروخت شدہ مقدار", roman: "Bechi gayi miqdaar" },
  revenue: { en: "Revenue", ur: "آمدنی", roman: "Aamdani" },
  stock: { en: "Stock", ur: "اسٹاک", roman: "Stock" },
  threshold: { en: "Low-stock level", ur: "کم اسٹاک کی حد", roman: "Kam stock ki had" },
  stockValue: { en: "Stock value", ur: "اسٹاک کی قیمت", roman: "Stock ki qeemat" },
  daysInactive: { en: "Days since last purchase", ur: "آخری خریداری سے دن", roman: "Aakhri kharidari se din" },
  neverPurchased: { en: "No purchases yet", ur: "ابھی کوئی خریداری نہیں", roman: "Abhi koi kharidari nahi" },
  overdue: { en: "Overdue", ur: "زائد المیعاد", roman: "Overdue" },
  daysOverdue: { en: "Days overdue", ur: "زائد المیعاد دن", roman: "Overdue din" },

  // Profit & loss
  cogs: { en: "Cost of goods sold", ur: "بکی ہوئی اشیاء کی لاگت", roman: "Bechi hui cheezon ki lagat" },
  grossProfit: { en: "Gross profit", ur: "مجموعی منافع", roman: "Majmooi munafa" },
  expenses: { en: "Recorded expenses", ur: "درج اخراجات", roman: "Darj kharch" },
  netProfit: { en: "Estimated net profit", ur: "تخمینہ خالص منافع", roman: "Andaza net munafa" },
  margin: { en: "Margin", ur: "مارجن", roman: "Margin" },
  category: { en: "Category", ur: "قسم", roman: "Qism" },

  // Next steps
  nextSales: { en: "Open Sales to see the details.", ur: "تفصیل کے لیے سیلز کھولیں۔", roman: "Tafseel ke liye Sales kholein." },
  nextKhata: { en: "Open Khata to see each customer.", ur: "ہر گاہک کے لیے کھاتہ کھولیں۔", roman: "Har gahak ke liye Khata kholein." },
  nextProducts: { en: "Open Products to restock or reprice.", ur: "اسٹاک بڑھانے کے لیے مصنوعات کھولیں۔", roman: "Stock barhane ke liye Products kholein." },
  nextExpenses: { en: "Open Expenses to review them.", ur: "جائزے کے لیے اخراجات کھولیں۔", roman: "Jaize ke liye Expenses kholein." },
  nextReports: { en: "Open Reports for the full picture.", ur: "مکمل تصویر کے لیے رپورٹس کھولیں۔", roman: "Mukammal tasveer ke liye Reports kholein." },
  nextRecovery: { en: "Open Recovery to log a follow-up.", ur: "فالو اپ کے لیے ریکوری کھولیں۔", roman: "Follow-up ke liye Recovery kholein." },
} as const satisfies Record<string, Phrase>;
