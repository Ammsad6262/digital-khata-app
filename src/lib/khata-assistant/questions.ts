/**
 * The 20 prepared business questions, grouped into 5 categories.
 *
 * Pure data — safe to import on the client for instant rendering. The answer
 * logic lives in `engine.ts` (server-only).
 */

import type {
  KhataCategory,
  KhataCategoryId,
  KhataLanguage,
  KhataQuestionId,
  PreparedQuestion,
} from "./types";

export const KHATA_CATEGORIES: KhataCategory[] = [
  {
    id: "sales",
    labels: {
      en: "Sales & revenue",
      ur: "فروخت اور آمدنی",
      roman: "Bikri aur aamdani",
    },
  },
  {
    id: "customers",
    labels: {
      en: "Customers & khata",
      ur: "گاہک اور کھاتہ",
      roman: "Gahak aur khata",
    },
  },
  {
    id: "stock",
    labels: {
      en: "Stock & products",
      ur: "اسٹاک اور مصنوعات",
      roman: "Stock aur products",
    },
  },
  {
    id: "profit",
    labels: {
      en: "Expenses & profit",
      ur: "اخراجات اور منافع",
      roman: "Kharch aur munafa",
    },
  },
  {
    id: "performance",
    labels: {
      en: "Business performance",
      ur: "کاروباری کارکردگی",
      roman: "Karobar ki karkardagi",
    },
  },
];

export const PREPARED_QUESTIONS: PreparedQuestion[] = [
  // A. Sales and revenue
  {
    id: "sales_today",
    category: "sales",
    labels: {
      en: "How much have I sold today?",
      ur: "میں نے آج کتنا بیچا؟",
      roman: "Maine aaj kitna becha?",
    },
  },
  {
    id: "sales_month",
    category: "sales",
    labels: {
      en: "How much have I sold this month?",
      ur: "اس مہینے کتنی فروخت ہوئی؟",
      roman: "Is mahine kitni bikri hui?",
    },
  },
  {
    id: "top_selling_products",
    category: "sales",
    labels: {
      en: "Which products are selling the most?",
      ur: "کون سی مصنوعات سب سے زیادہ بک رہی ہیں؟",
      roman: "Kaun se products sab se zyada bik rahe hain?",
    },
  },
  {
    id: "top_customers",
    category: "sales",
    labels: {
      en: "Which customers buy the most from me?",
      ur: "کون سے گاہک مجھ سے سب سے زیادہ خریدتے ہیں؟",
      roman: "Kaun se gahak mujh se sab se zyada kharidte hain?",
    },
  },
  {
    id: "sales_trend",
    category: "sales",
    labels: {
      en: "Are my sales increasing or decreasing?",
      ur: "میری فروخت بڑھ رہی ہے یا کم ہو رہی ہے؟",
      roman: "Meri bikri barh rahi hai ya kam ho rahi hai?",
    },
  },

  // B. Customers and khata
  {
    id: "top_debtors",
    category: "customers",
    labels: {
      en: "Which customers owe me the most money?",
      ur: "کون سے گاہک مجھ سے سب سے زیادہ مقروض ہیں؟",
      roman: "Kaun se gahak mujh se sab se zyada maqrooz hain?",
    },
  },
  {
    id: "total_receivables",
    category: "customers",
    labels: {
      en: "How much money do customers owe me in total?",
      ur: "گاہک مجموعی طور پر مجھ سے کتنے پیسے دیتے ہیں؟",
      roman: "Gahak total kitna udhaar dete hain?",
    },
  },
  {
    id: "inactive_customers",
    category: "customers",
    labels: {
      en: "Which customers have not purchased recently?",
      ur: "کون سے گاہک حال ہی میں خریداری نہیں کر رہے؟",
      roman: "Kaun se gahak haal hi mein kharidari nahi kar rahe?",
    },
  },
  {
    id: "overdue_customers",
    category: "customers",
    labels: {
      en: "Which customers have overdue outstanding balances?",
      ur: "کون سے گاہکوں کی واجب الادا رقم زائد المیعاد ہے؟",
      roman: "Kaun se gahakon ka udhaar overdue hai?",
    },
  },
  {
    id: "repeat_order_customers",
    category: "customers",
    labels: {
      en: "Which customers should I contact for repeat orders?",
      ur: "دوبارہ آرڈر کے لیے کن گاہکوں سے رابطہ کروں؟",
      roman: "Dobara order ke liye kin gahakon se rabta karoon?",
    },
  },

  // C. Stock and products
  {
    id: "low_stock",
    category: "stock",
    labels: {
      en: "Which products are running low on stock?",
      ur: "کون سی مصنوعات کا اسٹاک کم ہو رہا ہے؟",
      roman: "Kaun se products ka stock kam hai?",
    },
  },
  {
    id: "highest_sales_products",
    category: "stock",
    labels: {
      en: "Which products have the highest sales?",
      ur: "کون سی مصنوعات کی فروخت سب سے زیادہ ہے؟",
      roman: "Kaun se products ki sales sab se zyada hai?",
    },
  },
  {
    id: "dead_stock",
    category: "stock",
    labels: {
      en: "Which products are not selling?",
      ur: "کون سی مصنوعات بک نہیں رہیں؟",
      roman: "Kaun se products bik nahi rahe?",
    },
  },
  {
    id: "inventory_value",
    category: "stock",
    labels: {
      en: "What is the current value of my available inventory?",
      ur: "میرے موجودہ اسٹاک کی قیمت کتنی ہے؟",
      roman: "Mere mojooda stock ki value kitni hai?",
    },
  },

  // D. Expenses and profit
  {
    id: "expenses_month",
    category: "profit",
    labels: {
      en: "How much have I spent this month?",
      ur: "اس مہینے میں نے کتنا خرچ کیا؟",
      roman: "Is mahine maine kitna kharch kiya?",
    },
  },
  {
    id: "net_profit_month",
    category: "profit",
    labels: {
      en: "What is my estimated net profit this month?",
      ur: "اس مہینے کا تخمینہ خالص منافع کتنا ہے؟",
      roman: "Is mahine ka andaza net munafa kitna hai?",
    },
  },
  {
    id: "biggest_expenses",
    category: "profit",
    labels: {
      en: "What are my biggest business expenses?",
      ur: "میرے سب سے بڑے کاروباری اخراجات کون سے ہیں؟",
      roman: "Mere sab se bade karobari kharch kaun se hain?",
    },
  },
  {
    id: "cash_vs_sales",
    category: "profit",
    labels: {
      en: "How much money have I actually received compared with my sales?",
      ur: "فروخت کے مقابلے میں مجھے واقعی کتنے پیسے ملے؟",
      roman: "Bikri ke muqable mujhe waqai kitne paise mile?",
    },
  },

  // E. Business performance
  {
    id: "business_problems",
    category: "performance",
    labels: {
      en: "What are the biggest problems in my business right now?",
      ur: "اس وقت میرے کاروبار میں سب سے بڑے مسائل کیا ہیں؟",
      roman: "Is waqt mere karobar mein sab se bade masail kya hain?",
    },
  },
  {
    id: "improvement_plan",
    category: "performance",
    labels: {
      en: "What should I do to improve my sales and business performance?",
      ur: "فروخت اور کاروبار بہتر کرنے کے لیے کیا کروں؟",
      roman: "Bikri aur karobar behtar karne ke liye kya karoon?",
    },
  },
];

export const CATEGORY_ORDER: KhataCategoryId[] = KHATA_CATEGORIES.map((c) => c.id);

export const PREPARED_QUESTION_IDS = PREPARED_QUESTIONS.map((q) => q.id);

export function isPreparedQuestionId(value: string): value is KhataQuestionId {
  return (PREPARED_QUESTION_IDS as string[]).includes(value);
}

/** UI language (en/ur) or a detected language → which label variant to use. */
export function labelLanguage(
  language: KhataLanguage | "en" | "ur",
): "en" | "ur" | "roman" {
  if (language === "ur") return "ur";
  if (language === "roman-ur") return "roman";
  return "en";
}

export function questionLabel(
  question: PreparedQuestion,
  language: KhataLanguage | "en" | "ur",
): string {
  return question.labels[labelLanguage(language)];
}

export function categoryLabel(
  category: KhataCategory,
  language: KhataLanguage | "en" | "ur",
): string {
  return category.labels[labelLanguage(language)];
}

export function questionsByCategory(
  category: KhataCategoryId,
): PreparedQuestion[] {
  return PREPARED_QUESTIONS.filter((q) => q.category === category);
}

export function getPreparedQuestion(
  id: KhataQuestionId,
): PreparedQuestion | undefined {
  return PREPARED_QUESTIONS.find((q) => q.id === id);
}
