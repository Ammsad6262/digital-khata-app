/**
 * Shared types for the application-wide assistant.
 *
 * The assistant is deliberately split into three stages:
 *   1. UNDERSTAND  — rules first, Gemini only when the rules cannot decide.
 *   2. PLAN        — resolve names → IDs and prepare a typed action.
 *   3. EXECUTE     — the user confirms; the server calls the SAME services
 *                    the normal UI calls, then verifies the result.
 *
 * The AI never gets a database handle. Its only output is a plan the server
 * validates.
 */

export type QueryKind =
  | "DASHBOARD"
  | "RECEIVABLES"
  | "PAYABLES"
  | "CUSTOMER_BALANCE"
  | "CUSTOMER_HISTORY"
  | "STOCK_LEVEL"
  | "LOW_STOCK"
  | "TODAY_SALES"
  | "TODAY_EXPENSES"
  | "SALES_SUMMARY"
  | "EXPENSES_SUMMARY"
  | "PROFIT"
  | "TOP_PRODUCTS"
  | "RECENT_SALES"
  | "RECENT_EXPENSES"
  | "RECENT_PURCHASES"
  | "SUPPLIER_BALANCE"
  | "SUPPLIER_HISTORY"
  | "REMINDERS_TODAY"
  | "REMINDERS_ALL"
  | "INACTIVE_CUSTOMERS"
  | "OVERDUE_CUSTOMERS"
  | "REORDER_CANDIDATES"
  | "CUSTOMER_LIST"
  | "PRODUCT_LIST"
  | "SUPPLIER_LIST"
  | "HELP";

export type ActionKind =
  | "CREATE_SALE"
  | "RECORD_PAYMENT"
  | "CREATE_EXPENSE"
  | "CREATE_CUSTOMER"
  | "CREATE_PRODUCT"
  | "CREATE_SUPPLIER"
  | "CREATE_PURCHASE"
  | "SUPPLIER_PAYMENT"
  | "CREATE_REMINDER"
  | "ADD_STOCK"
  | "COMPLETE_REMINDER"
  | "VOID_SALE"
  | "VOID_EXPENSE"
  | "VOID_PAYMENT";

export type DateRange = "today" | "yesterday" | "week" | "month" | "last_month" | "all";

export type PaymentMethod = "cash" | "bank" | "cheque" | "jazzcash" | "easypaisa" | "other";

export type Candidate = {
  id: string;
  name: string;
  meta?: string;
};

export type PlanRequirement =
  | "customer"
  | "product"
  | "supplier"
  | "quantity"
  | "unit"
  | "unitPrice"
  | "paidAmount"
  | "amount"
  | "name"
  | "targetId";

/** A plan warning reduced to a translation key plus parameters. */
export type PlanWarning = {
  /** Translation key. Empty when the warning could not be mapped; then use `text`. */
  key: string;
  params?: Record<string, string | number>;
  /** Original English text, the fallback. */
  text?: string;
};

export type PlanValues = {
  /** Resolved entities, so the card can preselect the real customer/product. */
  customerId?: string;
  productId?: string;
  supplierId?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  unitCost?: number;
  total?: number;
  paidAmount?: number | null;
  amount?: number;
  discountAmount?: number;
  name?: string;
  expenseName?: string;
  phone?: string;
  method?: PaymentMethod;
  sellingPrice?: number;
  purchasePrice?: number;
  openingStock?: number;
  lowStockThreshold?: number;
  sku?: string;
  targetId?: string;
  category?: string;
  reminderTitle?: string;
  customerName?: string;
  productName?: string;
  supplierName?: string;
};

export type PlanPayload = {
  action: ActionKind;
  customerId?: string;
  supplierId?: string;
  productId?: string;
  /** Names as spoken, kept so a missing entity can be created on confirm. */
  customerName?: string;
  productName?: string;
  supplierName?: string;
  /** True per entity the owner chose to create instead of picking an existing one. */
  createMissing?: { customer?: boolean; product?: boolean; supplier?: boolean };
  items?: Array<{ productId: string; quantity: number; unitPrice: number }>;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  unitCost?: number;
  total?: number;
  paidAmount?: number | null;
  discountAmount?: number;
  method?: PaymentMethod;
  date?: string;
  dueDate?: string;
  name?: string;
  phone?: string;
  address?: string;
  openingBalance?: number;
  category?: string;
  expenseName?: string;
  amount?: number;
  notes?: string;
  reminderTitle?: string;
  reminderDueAt?: string;
  reminderType?: string;
  reminderPriority?: string;
  batchName?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  openingStock?: number;
  sku?: string;
  lowStockThreshold?: number;
  targetId?: string;
  text?: string;
  /** Rendering data attached when the plan is stored. */
  display?: {
    summary: string;
    fields: Array<{ label: string; value: string }>;
    warnings: string[];
    /** Warnings as translation keys, so the card can show them in the UI language. */
    warningKeys?: PlanWarning[];
    requires: PlanRequirement[];
    candidates: { customers?: Candidate[]; products?: Candidate[]; suppliers?: Candidate[] };
    usedContext: boolean;
    /** Relevant parsed values, so the confirmation card can edit them. */
    values?: PlanValues;
    /** Named entities that were not found, so the card can offer to create them. */
    missing?: { customer?: string; product?: string; supplier?: string };
    /** Values the confirmation card can offer as one-tap choices. */
    suggested?: {
      total?: number;
      paidAmount?: number;
      quantity?: number;
      unitPrice?: number;
      amount?: number;
    };
  };
};

export type Timings = {
  totalMs: number;
  ruleMs?: number;
  aiMs?: number;
  executeMs?: number;
};

export type AnswerItem = {
  label: string;
  value?: string;
  href?: string;
  meta?: string;
};

export type AssistantAnswer = {
  kind: "answer";
  text: string;
  /** Localised sentence parts; preferred over `text` when present. */
  textKeys?: Array<{ key: string; params?: Record<string, string | number> }>;
  items?: AnswerItem[];
  data?: unknown;
  source: "database" | "ai";
  model?: string;
  requestsUsed: number;
  timings: Timings;
};

export type AssistantPlan = {
  kind: "plan";
  actionId: string;
  action: ActionKind;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  warnings: string[];
  /** Warnings as translation keys; preferred over the English `warnings`. */
  warningKeys?: PlanWarning[];
  requires: PlanRequirement[];
  candidates: {
    customers?: Candidate[];
    products?: Candidate[];
    suppliers?: Candidate[];
  };
  /** True when a pronoun was resolved from the previous turn. */
  usedContext: boolean;
  /** Relevant parsed values, so the card can offer editable inputs. */
  values?: PlanValues;
  /** Named entities that were not found, so the card can offer to create them. */
  missing?: { customer?: string; product?: string; supplier?: string };
  /** One-tap values for the confirmation card. */
  suggested?: {
    total?: number;
    paidAmount?: number;
    quantity?: number;
    unitPrice?: number;
    amount?: number;
  };
  source: "rules" | "ai";
  model?: string;
  requestsUsed: number;
  timings: Timings;
};

export type AssistantClarify = {
  kind: "clarify";
  text: string;
  options?: Candidate[];
  /** What to ask for, so the UI can render the right input. */
  field?: PlanRequirement | "entity" | "intent";
  pending?: {
    action?: ActionKind;
    query?: QueryKind;
    entity?: string;
  };
  source: "rules" | "ai";
  model?: string;
  requestsUsed: number;
  timings: Timings;
};

export type AssistantError = {
  kind: "error";
  code:
    | "AI_UNAVAILABLE"
    | "AI_EXHAUSTED"
    | "AI_SLOW"
    | "NOT_UNDERSTOOD"
    | "INVALID_INPUT"
    | "SERVER";
  text: string;
  /** The user's command, preserved so they can retry without repeating it. */
  preservedText: string;
  retryAt?: string;
  requestsUsed: number;
  timings: Timings;
};

export type AssistantReply =
  | AssistantAnswer
  | AssistantPlan
  | AssistantClarify
  | AssistantError;

export type RouteQuery = {
  type: "query";
  query: QueryKind;
  entity?: string;
  range?: DateRange;
  confidence: number;
  matched: string;
};

export type RouteAction = {
  type: "action";
  action: ActionKind;
  fields: Partial<PlanPayload> & {
    customerName?: string;
    supplierName?: string;
    productName?: string;
    expenseName?: string;
  };
  confidence: number;
  missing: PlanRequirement[];
  matched: string;
};

export type RouteMatch = RouteQuery | RouteAction;

/** Compact entity index the rule engine matches names against. */
export type RouterContext = {
  customers: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; unit: string; sellingPrice: string }>;
  suppliers: Array<{ id: string; name: string }>;
  thread: ThreadContext;
};

export type ThreadContext = {
  lastCustomerId?: string;
  lastCustomerName?: string;
  lastProductId?: string;
  lastProductName?: string;
  lastSupplierId?: string;
  lastSupplierName?: string;
  lastActionId?: string;
  lastSaleId?: string;
  lastQuery?: QueryKind;
  updatedAt?: string;
};