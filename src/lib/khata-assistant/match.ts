/**
 * Deterministic matching for the Khata Assistant's custom questions.
 *
 * Most free-text questions can be routed to a known data answer WITHOUT any AI
 * call — that is faster, cheaper and always available. The AI is only asked to
 * classify a question this matcher cannot place.
 *
 * Matching is weighted: a specific phrase ("expenses this month") counts for
 * more than a generic one ("this month"), so overlapping questions land on the
 * right analysis.
 */

import type { KhataIntent } from "./ai";

type Rule = { id: KhataIntent; phrases: Array<[string, number]> };

const RULES: Rule[] = [
  {
    id: "sales_today",
    phrases: [["sold today", 4], ["today", 2], ["aaj", 2], ["آج", 2], ["becha", 2], ["bechi", 2]],
  },
  {
    id: "sales_month",
    phrases: [
      ["sold this month", 4],
      ["sales this month", 4],
      ["how much have i sold", 2],
      ["this month", 1],
      ["mahine", 1],
      ["mahina", 1],
      ["مہینے", 1],
      ["مہینہ", 1],
    ],
  },
  {
    id: "top_selling_products",
    phrases: [
      ["selling the most", 5],
      ["best selling", 4],
      ["best seller", 4],
      ["top selling", 4],
      ["fast moving", 3],
      ["sab se zyada bik", 4],
      ["zyada bikne", 4],
      ["most sold", 3],
    ],
  },
  {
    id: "top_customers",
    phrases: [
      ["buy the most", 5],
      ["best customer", 4],
      ["best customers", 4],
      ["top customer", 4],
      ["top customers", 4],
      ["biggest customer", 4],
      ["biggest customers", 4],
      ["sab se zyada kharid", 4],
      ["bade gahak", 3],
    ],
  },
  {
    id: "sales_trend",
    phrases: [
      ["increasing", 4],
      ["decreasing", 4],
      ["sales trend", 4],
      ["going up", 3],
      ["going down", 3],
      ["sales down", 4],
      ["sales lower", 4],
      ["sales dropped", 4],
      ["sales declining", 4],
      ["barh rahi", 3],
      ["kam ho rahi", 3],
      ["why were my sales", 4],
    ],
  },
  {
    id: "top_debtors",
    phrases: [
      ["owe me the most", 5],
      ["biggest debtor", 4],
      ["top debtor", 4],
      ["who owes me", 3],
      ["sab se zyada maqrooz", 4],
      ["sab se zyada udhaar", 4],
      ["maqrooz", 3],
    ],
  },
  {
    id: "total_receivables",
    phrases: [
      ["customers owe", 3],
      ["total owed", 4],
      ["total outstanding", 4],
      ["total receivable", 4],
      ["total udhaar", 4],
      ["kitna udhaar", 4],
      ["should i collect", 4],
      ["collect from customers", 4],
      ["money to collect", 4],
      ["wasool karna", 3],
    ],
  },
  {
    id: "inactive_customers",
    phrases: [
      ["not purchased", 4],
      ["not bought", 4],
      ["have not purchased", 5],
      ["inactive", 4],
      ["stopped buying", 4],
      ["becoming inactive", 5],
      ["no longer buying", 4],
      ["kharidari nahi", 4],
      ["purane gahak", 3],
    ],
  },
  {
    id: "overdue_customers",
    phrases: [
      ["overdue", 4],
      ["past due", 4],
      ["late payment", 4],
      ["late payments", 4],
      ["zائد", 2],
      ["late paying", 3],
    ],
  },
  {
    id: "repeat_order_customers",
    phrases: [
      ["repeat order", 5],
      ["repeat orders", 5],
      ["follow up", 4],
      ["followup", 4],
      ["follow-up", 4],
      ["should i contact", 4],
      ["reorder", 3],
      ["dobara order", 4],
      ["rabta", 3],
      ["contact karoon", 3],
    ],
  },
  {
    id: "low_stock",
    phrases: [
      ["low stock", 4],
      ["running low", 4],
      ["running out", 4],
      ["out of stock", 4],
      ["restock", 4],
      ["purchase again", 5],
      ["buy again", 5],
      ["order again", 4],
      ["stock kam", 4],
      ["khatam ho", 3],
      ["kam stock", 4],
    ],
  },
  {
    id: "highest_sales_products",
    phrases: [
      ["highest sales", 5],
      ["most sales", 4],
      ["top sales", 4],
      ["highest selling", 4],
      ["sab se zyada sale", 4],
      ["zyada sale", 3],
      ["best products", 3],
    ],
  },
  {
    id: "dead_stock",
    phrases: [
      ["not selling", 5],
      ["not sold", 4],
      ["dead stock", 4],
      ["slow moving", 4],
      ["slow movers", 4],
      ["nonselling", 4],
      ["bik nahi", 4],
      ["nahi bik", 4],
    ],
  },
  {
    id: "inventory_value",
    phrases: [
      ["inventory value", 5],
      ["stock value", 4],
      ["value of inventory", 5],
      ["value of stock", 5],
      ["worth of inventory", 5],
      ["stock ki qeemat", 4],
      ["kitne ka maal", 4],
    ],
  },
  {
    id: "expenses_month",
    phrases: [
      ["spent", 3],
      ["spend", 2],
      ["expenses this month", 5],
      ["expense this month", 5],
      ["kharch", 3],
      ["kharche", 3],
      ["kharcha", 3],
    ],
  },
  {
    id: "net_profit_month",
    phrases: [
      ["net profit", 5],
      ["profit this month", 4],
      ["how much profit", 4],
      ["my profit", 4],
      ["munafa", 3],
      ["nafa", 3],
      ["profit margin", 4],
    ],
  },
  {
    id: "biggest_expenses",
    phrases: [
      ["biggest expenses", 5],
      ["biggest expense", 5],
      ["largest expense", 5],
      ["largest expenses", 5],
      ["main expense", 4],
      ["where is my money going", 4],
      ["kahan kharch", 3],
      ["بڑے اخراجات", 3],
    ],
  },
  {
    id: "cash_vs_sales",
    phrases: [
      ["actually received", 5],
      ["cash received", 4],
      ["cash collected", 4],
      ["received vs sales", 5],
      ["collected from customers", 4],
      ["paisa mila", 3],
      ["wasool hua", 3],
      ["naqad wasool", 4],
      ["cash in hand", 4],
    ],
  },
  {
    id: "business_problems",
    phrases: [
      ["biggest problems", 5],
      ["problems in my business", 5],
      ["problems in the business", 5],
      ["what is wrong", 4],
      ["whats wrong", 4],
      ["issues", 3],
      ["masail", 3],
      ["masle", 3],
      ["kya masla", 3],
      ["kya masail", 3],
    ],
  },
  {
    id: "improvement_plan",
    phrases: [
      ["what should i do", 5],
      ["improve", 3],
      ["improving", 3],
      ["increase sales", 4],
      ["boost sales", 4],
      ["grow my business", 4],
      ["recommend", 3],
      ["suggestions", 3],
      ["behtar", 3],
      ["kya karoon", 3],
      ["kya karna chahiye", 4],
    ],
  },
];

const ACTION_VERBS = new Set([
  "add",
  "create",
  "record",
  "save",
  "new",
  "update",
  "edit",
  "change",
  "delete",
  "remove",
  "void",
  "cancel",
  "make",
  "enter",
  "likho",
  "banao",
  "addkaro",
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contains(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${phrase} `);
}

/** True when the sentence is an instruction to change data, not a question. */
export function detectActionRequest(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;
  const first = normalized.split(" ")[0] ?? "";
  return ACTION_VERBS.has(first);
}

/**
 * Route a free-text question to a known intent. Returns null when nothing
 * scores — the caller may then ask the model to classify it.
 */
export function matchCustomQuestion(text: string): KhataIntent | null {
  const normalized = normalize(text);
  if (!normalized) return null;

  // "Compare A with B" is unambiguous and takes priority over shared words
  // like "this month".
  const wantsCompare =
    contains(normalized, "compare") ||
    contains(normalized, "muqabla") ||
    contains(normalized, "vs") ||
    contains(normalized, "versus") ||
    contains(normalized, "compared to last") ||
    contains(normalized, "compared with last");
  if (wantsCompare) return "compare_periods";

  let best: KhataIntent | null = null;
  let bestScore = 0;
  for (const rule of RULES) {
    let score = 0;
    for (const [phrase, weight] of rule.phrases) {
      if (contains(normalized, phrase)) score += weight;
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule.id;
    }
  }
  return bestScore > 0 ? best : null;
}
