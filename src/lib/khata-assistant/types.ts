/**
 * Types for the KHATA ASSISTANT — the business-intelligence product.
 *
 * This is deliberately separate from the Universal Voice Assistant
 * (`src/lib/assistant/*`). The Voice Assistant *acts* on the business; the
 * Khata Assistant *explains* it. They share no conversation, no endpoint and
 * no responsibility.
 *
 * Every number in a KhataAnswer is computed from the authenticated owner's own
 * records. The only place an LLM is involved is phrasing an explanation, and it
 * is given the facts — it is never asked to produce a figure.
 */

/** Languages the assistant can answer in. `mixed` falls back to English prose. */
export type KhataLanguage = "en" | "ur" | "roman-ur" | "mixed";

export type KhataCategoryId =
  | "sales"
  | "customers"
  | "stock"
  | "profit"
  | "performance";

/** The exact 20 prepared questions. */
export type KhataQuestionId =
  // A. Sales and revenue
  | "sales_today"
  | "sales_month"
  | "top_selling_products"
  | "top_customers"
  | "sales_trend"
  // B. Customers and khata
  | "top_debtors"
  | "total_receivables"
  | "inactive_customers"
  | "overdue_customers"
  | "repeat_order_customers"
  // C. Stock and products
  | "low_stock"
  | "highest_sales_products"
  | "dead_stock"
  | "inventory_value"
  // D. Expenses and profit
  | "expenses_month"
  | "net_profit_month"
  | "biggest_expenses"
  | "cash_vs_sales"
  // E. Business performance
  | "business_problems"
  | "improvement_plan";

export type KhataFigure = {
  label: string;
  value: string;
  hint?: string;
};

export type KhataRow = {
  label: string;
  value?: string;
  meta?: string;
  href?: string;
};

/** A short, period-agnostic comparison used by custom questions too. */
export type KhataPeriod = "today" | "week" | "month" | "lastMonth" | "all";

export type KhataAnswer = {
  kind: "answer";
  questionId: KhataQuestionId | null;
  /** The question as it was asked (localized label or the user's own words). */
  question: string;
  language: KhataLanguage;
  /** One short sentence with the headline figure (always computed, never AI). */
  headline: string;
  /**
   * Optional AI re-wording of the same facts, shown BELOW the deterministic
   * headline. The headline and figures stay authoritative even when this is
   * present, so an LLM can never become the primary source of a number.
   */
  explanation?: string;
  figures: KhataFigure[];
  rows: KhataRow[];
  /** Limitations, empty-data explanations and warnings. Never a fake number. */
  notes: string[];
  /** A concrete next step the owner can take in the app. */
  nextStep?: string;
  /** True when the business simply has no records for this question. */
  empty: boolean;
  source: "database" | "database+ai";
  generatedAt: string;
};

export type KhataErrorCode = "SERVER" | "INVALID_INPUT" | "AI_UNAVAILABLE";

export type KhataError = {
  kind: "error";
  code: KhataErrorCode;
  message: string;
  /** The owner's question, preserved so the UI can offer a retry. */
  preservedText?: string;
  retryAt?: string;
};

export type KhataReply = KhataAnswer | KhataError;

export type PreparedQuestion = {
  id: KhataQuestionId;
  category: KhataCategoryId;
  labels: { en: string; ur: string; roman: string };
};

export type KhataCategory = {
  id: KhataCategoryId;
  labels: { en: string; ur: string; roman: string };
};

/** Body accepted by POST /api/khata-assistant/ask. */
export type KhataAskInput = {
  questionId?: string;
  text?: string;
  language?: string;
};
