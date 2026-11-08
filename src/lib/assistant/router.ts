/**
 * Deterministic command router.
 *
 * Most wholesale commands are short and formulaic ("Ali paid me 5000",
 * "kitna udhaar hai", "aaj ka kharcha"). Resolving them with rules means:
 *   - ~0 ms of model time,
 *   - zero free-tier requests consumed,
 *   - the same answer every time.
 *
 * The router only UNDERSTANDS. It never touches the database and never
 * performs a calculation that belongs to the app (balances, stock, totals are
 * computed by the query/action layer from the real records).
 *
 * When the text is too free-form, `route()` returns null and the caller asks
 * Gemini — but even then the model only produces the same kind of structured
 * fields this router produces.
 */

import {
  extractNumbers,
  matchEntities,
  normalizeText,
  parseDateRange,
  parseRelativeDays,
  removeRanges,
  meaningfulWords,
  type EntityMatch,
} from "./nlg";
import type {
  ActionKind,
  PlanPayload,
  PlanRequirement,
  QueryKind,
  RouteAction,
  RouteMatch,
  RouteQuery,
  RouterContext,
} from "./types";

const UNIT_RE =
  /^(kg|kgs|kilo|kilos|kilogram|kilograms|gram|grams|gm|g|ton|tons|carton|cartons|box|boxes|bag|bags|bora|bori|sack|sacks|piece|pieces|pcs|pc|dozen|dozens|litre|liter|litres|liters|packet|packets|tin|tins|bottle|bottles|unit|units|roll|rolls|sheet|sheets)\b/;

const UNIT_ALIASES: Record<string, string> = {
  kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  gram: "g", grams: "g", gm: "g",
  cartons: "carton", boxes: "box", bags: "bag", bora: "bag", bori: "bag",
  sacks: "sack", pieces: "piece", pcs: "piece", pc: "piece",
  dozens: "dozen", litres: "litre", liters: "litre", liter: "litre",
  packets: "packet", tins: "tin", bottles: "bottle", units: "unit",
  rolls: "roll", sheets: "sheet", tons: "ton",
};

function canonicalUnit(raw: string): string {
  return UNIT_ALIASES[raw] ?? raw;
}

const MONEY_WORDS = /(paid|pay|gave|give|received|receive|advance|diye|diya|dya|mila|wasool|naqad|cash|deposit|jama)/;
const TOTAL_WORDS = /(total|amount|for|hua|banaya|worth|ki|ka|ke|rs|rupees|rupay|rupaye)/;
const PRICE_WORDS = /(per|rate|each|price|@|\/)/;
const DISCOUNT_WORDS = /(discount|kam kiya|kam|chhoot|rebate)/;

type NumberRole = {
  value: number;
  role: "quantity" | "unitPrice" | "paid" | "total" | "discount" | "unknown";
  unit?: string;
  raw: string;
};

function classifyNumbers(text: string): NumberRole[] {
  const numbers = extractNumbers(text);
  const roles: NumberRole[] = [];
  for (const n of numbers) {
    const before = text.slice(Math.max(0, n.start - 24), n.start);
    const after = text.slice(n.end, n.end + 24);
    let role: NumberRole["role"] = "unknown";
    let unit: string | undefined;

    let unitMatch = after.trimStart().match(UNIT_RE);
    if (!unitMatch) {
      // "20 of rice" / "20 rice"
      unitMatch = null;
    }

    if (MONEY_WORDS.test(before)) role = "paid";
    else if (DISCOUNT_WORDS.test(before)) role = "discount";
    else if (PRICE_WORDS.test(before) || /^\s*(per|rate|each|\/)/.test(after)) role = "unitPrice";
    else if (unitMatch) {
      role = "quantity";
      unit = canonicalUnit(unitMatch[1]!);
    } else if (TOTAL_WORDS.test(before)) role = "total";

    roles.push({ value: n.value, role, unit, raw: n.raw });
  }
  return roles;
}

function pick(roles: NumberRole[], role: NumberRole["role"]): NumberRole | undefined {
  return roles.find((r) => r.role === role);
}

// ────────────────────────────────────────────────────────────────────────────
// Query rules
// ────────────────────────────────────────────────────────────────────────────

type QueryRule = {
  query: QueryKind;
  test: (t: string) => boolean;
  needsEntity?: "customer" | "product" | "supplier";
};

const QUERY_RULES: QueryRule[] = [
  { query: "HELP", test: (t) => /\b(help|commands|what can you do|kya kar sakte|kya kar sakti)\b/.test(t) },
  { query: "DASHBOARD", test: (t) => /\b(dashboard|business summary|summary of (my )?business|overview|how is (my )?business|kaam kaisa|business kaisa)\b/.test(t) },
  { query: "PROFIT", test: (t) => /\b(profit|munafa|net income|net profit|loss|nuksan)\b/.test(t) },
  { query: "RECEIVABLES", test: (t) => /\b(who owes me|who owe me|how much do (customers|people|parties) owe|total receivable|receivables|udhaar|udhar|baqaya|kitna lena|owes me|outstanding customers)\b/.test(t) || /ادھار/.test(t) },
  { query: "PAYABLES", test: (t) => /\b(who do i owe|whom do i owe|what do i owe|total payable|payables|kitna dena|supplier.{0,20}(owe|payable)|i owe)\b/.test(t) },
  { query: "LOW_STOCK", test: (t) => /\b(low stock|running low|out of stock|khatam|kam stock|reorder|restock|stock kam|inventory low)\b/.test(t) || /اسٹاک کم|کم اسٹاک/.test(t) },
  { query: "TOP_PRODUCTS", test: (t) => /best.?sell|top.?sell|top product|most sold|sab se zyada|best product|highest selling/.test(t) },
  { query: "INACTIVE_CUSTOMERS", test: (t) => /\b(inactive|not purchased|not bought|haven.?t purchased|haven.?t bought|stopped buying|nahi kharida|purane customer|dormant)\b/.test(t) },
  { query: "OVERDUE_CUSTOMERS", test: (t) => /\b(overdue|late payment|past due|late hai|payment late|due date.{0,20}(passed|over|cross))\b/.test(t) },
  { query: "REORDER_CANDIDATES", test: (t) => /\b(ready to (order|reorder)|reorder candidate|dobara order|may order again)\b/.test(t) },
  { query: "REMINDERS_TODAY", test: (t) => /\b(reminders?.{0,20}today|today.{0,20}reminders?|due today|aaj ke kaam|kaam due|what should i do today)\b/.test(t) },
  { query: "REMINDERS_ALL", test: (t) => /\b(reminders?|tasks?|follow.?ups?)\b/.test(t) },

  { query: "CUSTOMER_HISTORY", needsEntity: "customer", test: (t) => /\b(history|ledger|statement|hisaab|account|transactions?)\b/.test(t) },
  { query: "CUSTOMER_BALANCE", needsEntity: "customer", test: (t) => /\b(balance|owe|owes|udhaar|udhar|baqaya|baki|due)\b/.test(t) },
  { query: "SUPPLIER_BALANCE", needsEntity: "supplier", test: (t) => /\b(balance|owe|payable|baqaya|baki|due)\b/.test(t) },
  { query: "SUPPLIER_HISTORY", needsEntity: "supplier", test: (t) => /\b(purchases?|bought|kharid|history|ledger|statement|hisaab)\b/.test(t) },
  { query: "STOCK_LEVEL", needsEntity: "product", test: (t) => /\b(stock|inventory|kitna|how much|left|available|mojood)\b/.test(t) },

  { query: "TODAY_EXPENSES", test: (t) => /\b(today'?s?|aaj).{0,25}(expense|spent|spend|kharch|kharcha)|(expense|kharch|spent).{0,25}(today'?s?|aaj)\b/.test(t) || /(آج.{0,10}خرچ|خرچ.{0,10}آج)/.test(t) },
  { query: "TODAY_SALES", test: (t) => /\b(today|aaj).{0,25}(sale|sold|sell|bikri|revenue)\b/.test(t) || /\b(sale|sold|bikri).{0,25}(today|aaj)\b/.test(t) },
  { query: "SALES_SUMMARY", test: (t) => /\b(this month|is mahine|month|monthly).{0,25}(sale|sold|sell|bikri|revenue)\b/.test(t) || /\b(sale|sales|bikri).{0,25}(month|mahine|monthly)\b/.test(t) },
  { query: "EXPENSES_SUMMARY", test: (t) => /\b(this month|is mahine|month|monthly).{0,25}(expense|spent|kharch)\b/.test(t) || /\b(expense|expenses|kharch).{0,25}(month|mahine|monthly)\b/.test(t) },

  { query: "RECENT_PURCHASES", test: (t) => /\b(purchases?|kharidari|supplier bills?|bills? from)\b/.test(t) },
  { query: "RECENT_EXPENSES", test: (t) => /\b(expenses?|kharche|kharcha|spending)\b/.test(t) },
  { query: "RECENT_SALES", test: (t) => /\b(sales?|sold|bikri|invoices?)\b/.test(t) },
  { query: "CUSTOMER_LIST", test: (t) => /\b(customers?|parties|party list|khata list)\b/.test(t) },
  { query: "PRODUCT_LIST", test: (t) => /\b(products?|items?|inventory list|catalog)\b/.test(t) },
  { query: "SUPPLIER_LIST", test: (t) => /\b(suppliers?|vendors?)\b/.test(t) },
];

type Entities = {
  customers: EntityMatch<RouterContext["customers"][number]>[];
  products: EntityMatch<RouterContext["products"][number]>[];
  suppliers: EntityMatch<RouterContext["suppliers"][number]>[];
};

function matchAll(text: string, ctx: RouterContext): Entities {
  return {
    customers: matchEntities(text, ctx.customers),
    products: matchEntities(text, ctx.products),
    suppliers: matchEntities(text, ctx.suppliers),
  };
}

function detectQuery(text: string, entities: Entities): RouteQuery | null {
  for (const rule of QUERY_RULES) {
    if (!rule.test(text)) continue;

    if (rule.needsEntity === "customer" && entities.customers.length === 0) continue;
    if (rule.needsEntity === "product" && entities.products.length === 0) continue;
    if (rule.needsEntity === "supplier" && entities.suppliers.length === 0) continue;

    // "stock of rice" must not be swallowed by the generic sales rule.
    if (rule.query === "RECENT_SALES" && entities.products.length > 0 && /\bstock\b/.test(text)) {
      continue;
    }

    const range = parseDateRange(text);
    return {
      type: "query",
      query: rule.query,
      range,
      entity:
        entities.customers[0]?.entity.name ??
        entities.products[0]?.entity.name ??
        entities.suppliers[0]?.entity.name,
      confidence: 0.85,
      matched: rule.query,
    };
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Action rules
// ────────────────────────────────────────────────────────────────────────────

const CREATE_CUSTOMER_RE = /\b(add|create|make|new|naya|nai|nawa)\b.{0,12}\b(customer|party|khata)\b|\b(customer|party)\b.{0,12}\b(add|create|named|called|naam)\b/;
const CREATE_SUPPLIER_RE = /\b(add|create|make|new|naya|nai)\b.{0,12}\b(supplier|vendor)\b|\b(supplier|vendor)\b.{0,12}\b(add|create|named|called|naam)\b/;
const CREATE_PRODUCT_RE = /\b(add|create|make|new|naya|nai)\b.{0,12}\b(product|item)\b|\b(product|item)\b.{0,12}\b(add|create|named|called|naam)\b/;
const REMINDER_RE = /\b(remind|reminder|yaad dila|yaad dilana|follow.?up|task)\b/;
const VOID_RE = /\b(void|cancel|delete|reverse|hatao|radd)\b/;

function action(
  kind: ActionKind,
  fields: RouteAction["fields"],
  missing: PlanRequirement[],
  matched: string,
  confidence = 0.8,
): RouteAction {
  return { type: "action", action: kind, fields, missing, confidence, matched };
}

function wordsAfter(text: string, re: RegExp): string {
  const m = text.match(re);
  if (!m || m.index === undefined) return "";
  return text.slice(m.index + m[0].length).trim();
}

function cleanName(raw: string, maxWords = 4): string | null {
  const words = meaningfulWords(raw)
    .filter((w) => !/^(named|called|naam|karo|kar|do|please|ji|sahab|bhai)$/.test(w))
    .slice(0, maxWords);
  if (words.length === 0) return null;
  // Prefer a Title-Cased rendering for display only; the DB match is case-insensitive.
  return words
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function guessCustomerName(text: string, entities: Entities): string | null {
  if (entities.customers[0]) return entities.customers[0].entity.name;
  const beforeBought = text.match(/^(.+?)\s+(?:bought|purchased|took|ne|ko)\b/);
  if (beforeBought) {
    const candidate = cleanName(beforeBought[1]!, 3);
    if (candidate) return candidate;
  }
  const afterTo = wordsAfter(text, /\b(?:to|ko)\s+/);
  if (afterTo) {
    const candidate = cleanName(afterTo, 3);
    if (candidate) return candidate;
  }
  return null;
}

function guessProductName(text: string, entities: Entities): string | null {
  if (entities.products[0]) return entities.products[0].entity.name;
  const of = text.match(/\bof\s+([a-z\p{L}][\p{L}\s]{1,40})/u);
  if (of) {
    const candidate = cleanName(of[1]!, 3);
    if (candidate) return candidate;
  }
  return null;
}

function detectAction(text: string, entities: Entities, ctx: RouterContext): RouteAction | null {
  const numbers = classifyNumbers(text);
  const qty = pick(numbers, "quantity");
  const unitPrice = pick(numbers, "unitPrice");
  const paid = pick(numbers, "paid");
  const total = pick(numbers, "total");
  const discount = pick(numbers, "discount");

  // ── Repeat / follow-up: "he paid another 5000" ──────────────────────────
  if (/\b(another|more|aur|dobara)\b/.test(text) && paid && ctx.thread.lastCustomerId && entities.customers.length === 0) {
    return action(
      "RECORD_PAYMENT",
      {
        customerId: ctx.thread.lastCustomerId,
        customerName: ctx.thread.lastCustomerName,
        amount: paid.value,
        method: detectMethod(text),
      },
      [],
      "follow-up payment",
      0.9,
    );
  }

  // ── Reminders ───────────────────────────────────────────────────────────
  if (REMINDER_RE.test(text) && !/reminders?\b.*\b(today|show|list|what|kaunse)/.test(text)) {
    const days = parseRelativeDays(text) ?? 1;
    const due = new Date();
    due.setDate(due.getDate() + days);
    due.setHours(9, 0, 0, 0);
    const entity =
      entities.customers[0]?.entity.name ??
      entities.suppliers[0]?.entity.name ??
      entities.products[0]?.entity.name;
    const rawTitle = text
      .replace(/\b(remind me|reminder|to|that|please|yaad dila(na)?|karo|kar)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const title = (entity ? `${rawTitle}` : rawTitle) || "Follow up";
    return action(
      "CREATE_REMINDER",
      {
        reminderTitle: capitalize(title).slice(0, 120),
        reminderDueAt: due.toISOString(),
        reminderPriority: /\b(urgent|jaldi|abhi|important|high)\b/.test(text) ? "high" : "normal",
        reminderType: entities.customers[0]
          ? "customer_followup"
          : entities.suppliers[0]
            ? "supplier_payment"
            : "custom",
        customerId: entities.customers[0]?.entity.id,
        supplierId: entities.suppliers[0]?.entity.id,
      },
      [],
      "reminder",
    );
  }

  // ── Add / create people & products ──────────────────────────────────────
  if (CREATE_CUSTOMER_RE.test(text) && entities.customers.length === 0) {
    const name =
      cleanName(wordsAfter(text, /\b(?:named|called|naam|karo|kar)\b/), 4) ??
      cleanName(
        text
          .replace(/\b(add|create|make|new|naya|nai|nawa|customer|party|khata|named|called|naam|karo|kar|please)\b/g, " ")
          .trim(),
        4,
      );
    const phone = text.match(/\b(0\d{3,4}[\s-]?\d{6,8}|\+?\d{10,13})\b/)?.[1];
    return action(
      "CREATE_CUSTOMER",
      { name: name ?? undefined, phone: phone ?? undefined },
      name ? [] : ["name"],
      "create customer",
    );
  }

  if (CREATE_SUPPLIER_RE.test(text) && entities.suppliers.length === 0) {
    const name =
      cleanName(wordsAfter(text, /\b(?:named|called|naam|karo|kar)\b/), 4) ??
      cleanName(
        text
          .replace(/\b(add|create|make|new|naya|nai|supplier|vendor|named|called|naam|karo|kar|please)\b/g, " ")
          .trim(),
        4,
      );
    return action("CREATE_SUPPLIER", { name: name ?? undefined }, name ? [] : ["name"], "create supplier");
  }

  if (CREATE_PRODUCT_RE.test(text) && entities.products.length === 0) {
    const name = cleanName(
      text
        .replace(/\b(add|create|make|new|naya|nai|product|item|named|called|naam|karo|kar|please)\b/g, " ")
        .replace(/\b\d+(\.\d+)?\b/g, " ")
        .replace(/\b(rs|rupees|rupay|rupaye|per|kg|kilo|piece|box|bag|carton|each|rate|price|selling|purchase|cost)\b/g, " ")
        .trim(),
      3,
    );
    const selling = unitPrice ?? total;
    return action(
      "CREATE_PRODUCT",
      {
        name: name ?? undefined,
        unit: qty?.unit ?? detectUnitWord(text) ?? undefined,
        sellingPrice: selling?.value,
        purchasePrice: undefined,
        openingStock: qty?.value,
      },
      [
        ...(name ? [] : ["name" as const]),
        ...(selling ? [] : ["unitPrice" as const]),
      ],
      "create product",
    );
  }

  // ── Void / cancel ───────────────────────────────────────────────────────
  if (VOID_RE.test(text)) {
    if (/\b(payment|received|diye)\b/.test(text)) {
      return action("VOID_PAYMENT", { targetId: extractId(text) }, ["targetId"], "void payment", 0.6);
    }
    if (/\b(expense|kharch)\b/.test(text)) {
      return action("VOID_EXPENSE", { targetId: extractId(text) }, ["targetId"], "void expense", 0.6);
    }
    if (/\b(sale|invoice|bill|bikri)\b/.test(text)) {
      return action("VOID_SALE", { targetId: extractId(text) }, ["targetId"], "void sale", 0.6);
    }
  }

  // ── Supplier payment vs customer payment ────────────────────────────────
  const mentionsSupplier = entities.suppliers.length > 0;
  const mentionsCustomer = entities.customers.length > 0;

  const paidMe = /\b(paid me|pay me|gave me|given me|received|receive|mila|wasool|se paise|ne \d+.*diye)\b/.test(text);
  const iPaid = /^\s*(i\s+)?(paid|pay)\b|\bpaid\s+\w+\s+(rs|rupees|\d)/.test(text);

  if (mentionsSupplier && (/\b(paid|pay|diya|diye|de diye|ko)\b/.test(text) || iPaid)) {
    const supplier = entities.suppliers[0]!.entity;
    return action(
      "SUPPLIER_PAYMENT",
      {
        supplierId: supplier.id,
        supplierName: supplier.name,
        amount: paid?.value ?? total?.value,
        method: detectMethod(text),
        date: dateForText(text),
      },
      paid || total ? [] : ["amount"],
      "supplier payment",
    );
  }

  if (mentionsCustomer && paidMe) {
    const customer = entities.customers[0]!.entity;
    return action(
      "RECORD_PAYMENT",
      {
        customerId: customer.id,
        customerName: customer.name,
        amount: paid?.value ?? total?.value,
        method: detectMethod(text),
        date: dateForText(text),
      },
      paid || total ? [] : ["amount"],
      "customer payment",
    );
  }

  // "Record 10,000 received from Ali" (no "paid me" wording but has received)
  if (mentionsCustomer && /\b(received|receive|got|jama|wasool|record)\b/.test(text) && paid) {
    const customer = entities.customers[0]!.entity;
    return action(
      "RECORD_PAYMENT",
      {
        customerId: customer.id,
        customerName: customer.name,
        amount: paid.value,
        method: detectMethod(text),
        date: dateForText(text),
      },
      [],
      "customer payment",
    );
  }

  // ── Purchases (supplier named) ──────────────────────────────────────────
  const buying = /\b(bought|buy|purchased|purchase|kharida|kharide|kharidna|liya|liye)\b/.test(text);
  const fromSupplier = /\b(from|se)\b/.test(text) || mentionsSupplier;

  if (buying && mentionsSupplier && fromSupplier && !mentionsCustomer) {
    const supplier = entities.suppliers[0]!.entity;
    const product = entities.products[0]?.entity;
    const unitCost = unitPrice?.value ?? total?.value;
    return action(
      "CREATE_PURCHASE",
      {
        supplierId: supplier.id,
        supplierName: supplier.name,
        productId: product?.id,
        productName: product?.name ?? guessProductName(text, entities) ?? undefined,
        quantity: qty?.value,
        unit: qty?.unit,
        unitCost,
        paidAmount: paid?.value ?? null,
        date: dateForText(text),
      },
      [
        ...(product ? [] : ["product" as const]),
        ...(qty ? [] : ["quantity" as const]),
        ...(unitCost ? [] : ["unitPrice" as const]),
      ],
      "purchase",
    );
  }

  // ── Sales ───────────────────────────────────────────────────────────────
  const selling = /\b(sold|sell|sale|bikri|bought|took|liya|liye|diya|de diya)\b/.test(text);
  if (selling && (mentionsCustomer || /\b(bought|sold|liya|liye)\b/.test(text))) {
    const customer = entities.customers[0]?.entity;
    const product = entities.products[0]?.entity;
    return action(
      "CREATE_SALE",
      {
        customerId: customer?.id,
        customerName: customer?.name ?? guessCustomerName(text, entities) ?? undefined,
        productId: product?.id,
        productName: product?.name ?? guessProductName(text, entities) ?? undefined,
        quantity: qty?.value,
        unit: qty?.unit ?? product?.unit,
        unitPrice: unitPrice?.value ?? (product ? Number(product.sellingPrice) : undefined),
        total: total?.value,
        paidAmount: paid?.value ?? (/credit|udhaar|baad mein|remaining/.test(text) ? 0 : null),
        discountAmount: discount?.value,
        date: dateForText(text),
      },
      [
        ...(customer ? [] : ["customer" as const]),
        ...(product ? [] : ["product" as const]),
        ...(qty ? [] : ["quantity" as const]),
      ],
      "sale",
    );
  }

  // ── Stock intake (no supplier) ──────────────────────────────────────────
  // Accepts either an explicit stock phrase ("add 10 kg rice to stock") or a
  // plain top-up of the product just discussed ("add 10 boxes of this
  // product"), which resolves against the conversation context.
  const addWord = /\b(add|increase|update|dal|daal|shamil)\b/.test(text);
  const pronounProduct = /\b(this|that|same|iss|isi|usi|ye|yeh|wo|wahi)\b/.test(text);
  const stockIntake =
    (/\b(stock|inventory|godown)\b/.test(text) && (buying || addWord)) ||
    (addWord && Boolean(qty) && !mentionsCustomer && !mentionsSupplier);

  if (stockIntake) {
    const explicitProduct = entities.products[0]?.entity;
    const productId =
      explicitProduct?.id ??
      (pronounProduct ? ctx.thread.lastProductId : undefined);
    const productName =
      explicitProduct?.name ??
      (pronounProduct ? ctx.thread.lastProductName : undefined) ??
      guessProductName(text, entities) ??
      undefined;

    return action(
      "ADD_STOCK",
      {
        productId,
        productName,
        quantity: qty?.value,
        unit: qty?.unit,
        unitCost: unitPrice?.value ?? total?.value,
        date: dateForText(text),
      },
      [
        ...(productId || productName ? [] : ["product" as const]),
        ...(qty ? [] : ["quantity" as const]),
      ],
      "stock intake",
    );
  }

  // ── Expenses ────────────────────────────────────────────────────────────
  const spending =
    /\b(spent|spend|expense|kharch|kharcha|paid|diya|diye|bought|kharida)\b/.test(text);
  if (spending && !mentionsCustomer && !mentionsSupplier) {
    const amount = total?.value ?? paid?.value ?? unitPrice?.value ?? largestNumber(numbers);
    if (amount) {
      const expenseName =
        cleanName(
          wordsAfter(text, /\b(?:on|for|pe|par|ki|ka|of)\b/),
          3,
        ) ??
        cleanName(
          text
            .replace(/\b(i|we|spent|spend|paid|pay|bought|buy|on|for|the|a|an|rs|rupees|rupay|rupaye|expense|kharch|kharcha|diya|diye|kharida|ka|ki|ke)\b/g, " ")
            .replace(/\b\d+(\.\d+)?\b/g, " ")
            .trim(),
          3,
        ) ??
        "General expense";
      return action(
        "CREATE_EXPENSE",
        {
          expenseName,
          amount,
          category: detectExpenseCategory(`${expenseName} ${text}`),
          date: dateForText(text),
        },
        [],
        "expense",
        0.75,
      );
    }
  }

  return null;
}

function largestNumber(roles: ReturnType<typeof classifyNumbers>): number | undefined {
  if (roles.length === 0) return undefined;
  return roles.reduce((max, r) => (r.value > max ? r.value : max), 0) || undefined;
}

function detectUnitWord(text: string): string | undefined {
  const m = text.match(/\b(kg|kilo|kilos|carton|cartons|box|boxes|bag|bags|piece|pieces|dozen|litre|liter|packet|packets)\b/);
  return m ? canonicalUnit(m[1]!) : undefined;
}

function detectMethod(text: string): "cash" | "bank" | "cheque" | "jazzcash" | "easypaisa" | "other" {
  if (/\b(easypaisa|easy paisa)\b/.test(text)) return "easypaisa";
  if (/\b(jazzcash|jazz cash)\b/.test(text)) return "jazzcash";
  if (/\b(cheque|check)\b/.test(text)) return "cheque";
  if (/\b(bank|account|transfer|online)\b/.test(text)) return "bank";
  return "cash";
}

function detectExpenseCategory(text: string): string {
  if (/\b(petrol|diesel|fuel|transport|rickshaw|fare|truck|loading|unloading)\b/.test(text)) return "transport";
  // No trailing word boundary: "electricity" must match "electric".
  if (/\b(electric|bijli|wapda|gas|water|utility)/.test(text)) return "electricity";
  if (/\b(salary|wages|tankha|mazdoor|staff)\b/.test(text)) return "salary";
  if (/\b(rent|kiraya|shop rent)\b/.test(text)) return "rent";
  if (/\b(packing|packaging|bag|carton|wrap)\b/.test(text)) return "packaging";
  if (/\b(tea|chai|food|khana|lunch|shop|store|stationery|cleaning)\b/.test(text)) return "shop";
  return "other";
}

function dateForText(text: string): string | undefined {
  if (/\b(yesterday|kal|guzishta kal)\b/.test(text) && !/\b(tomorrow)\b/.test(text)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  }
  return undefined;
}

function extractId(text: string): string | undefined {
  const m = text.match(/\b(?:#|id\s*)?([a-z0-9]{20,})\b/);
  return m?.[1];
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

export function route(rawText: string, ctx: RouterContext): RouteMatch | null {
  const text = normalizeText(rawText);
  if (!text) return null;

  const entities = matchAll(text, ctx);

  // Queries first: "show me today's expenses" must not be read as an expense
  // creation because of the word "expenses".
  const query = detectQuery(text, entities);
  const actionMatch = detectAction(text, entities, ctx);

  if (query && actionMatch) {
    // "add customer Imran" contains the word "customer" (a list-query trigger)
    // but is plainly an instruction. An imperative opening verb wins.
    if (/^(add|create|new|make|record|note|set|start|log|enter|register|delete|cancel|void|do)\b/.test(text)) {
      return actionMatch;
    }
    // A question mark or question word strongly implies a query.
    if (/\?|^(how|what|which|who|when|where|kitna|kitne|kaun|kya|kab)\b/.test(text)) {
      return query;
    }
    // "remind me..." is an action, not a query.
    if (actionMatch.action === "CREATE_REMINDER") return actionMatch;
    // Both matched and there is no question wording: treat it as an
    // instruction ("bought 10 bags cement from Cement House at 550").
    return actionMatch;
  }
  if (actionMatch) return actionMatch;
  if (query) return query;
  return null;
}

/** True when the text plausibly refers to business data at all. */
export function looksLikeBusinessCommand(rawText: string): boolean {
  const text = normalizeText(rawText);
  // Any Urdu/Arabic script is treated as a business command so it reaches the
  // AI, whose prompt supports Urdu. Without this, Urdu text would be rejected
  // before the model ever saw it.
  if (/[\u0600-\u06FF]/.test(text)) return true;
  return /\b(sale|sales|sell|sold|bikri|buy|bought|purchase|kharid|customer|supplier|party|product|item|stock|inventory|expense|kharch|payment|paid|pay|udhaar|udhar|baqaya|balance|owe|profit|munafa|report|reminder|task|khata|account|ledger|hisaab|dashboard|order|delivery|discount|rate|price|quantity|unit|kg|carton|box|bag|piece|dozen|payment)\b/.test(text);
}