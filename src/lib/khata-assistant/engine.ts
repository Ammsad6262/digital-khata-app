/**
 * Khata Assistant engine.
 *
 * Runs the 20 prepared questions (plus a couple of custom intents) against the
 * owner's real records. It is strictly READ-ONLY: nothing here writes to the
 * database, and the module never imports the action layer. When a question
 * cannot be answered from records, it says so — it never invents a figure.
 */

import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { formatMoney, formatQuantity } from "@/lib/utils/money";
import { KhataFacts } from "./facts";
import { L, fill, pick } from "./phrases";
import { getPreparedQuestion } from "./questions";
import type {
  KhataAnswer,
  KhataFigure,
  KhataLanguage,
  KhataQuestionId,
  KhataRow,
} from "./types";
import type { KhataIntent } from "./ai";

type AnswerBody = Omit<
  KhataAnswer,
  "kind" | "questionId" | "question" | "language" | "generatedAt"
>;

type Handler = (facts: KhataFacts, language: KhataLanguage) => Promise<AnswerBody>;

// ────────────────────────────────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────────────────────────────────

function money(facts: KhataFacts, value: string | number | Decimal | null): string {
  return formatMoney(value, facts.symbol);
}

function quantity(value: string, unit?: string): string {
  return formatQuantity(value, unit);
}

function pct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

function sum(values: Array<string | number>): string {
  return values
    .reduce((acc: Decimal, v) => acc.plus(toDecimalOrZero(v)), new Decimal(0))
    .toString();
}

function topRows(
  items: Array<{ label: string; value?: string; meta?: string }>,
  limit = 8,
): KhataRow[] {
  return items.slice(0, limit);
}

// ────────────────────────────────────────────────────────────────────────────
// Handlers — one per prepared question
// ────────────────────────────────────────────────────────────────────────────

const salesToday: Handler = async (facts, lang) => {
  const report = await facts.report("today");
  const { billed, cashReceived, count, discounts, byCustomer } = report.sales;
  const empty = count === 0;
  return {
    headline: fill(
      pick(lang, {
        en: "Today you billed {billed} across {count} sale(s) and received {cash} in cash.",
        ur: "آج آپ نے {count} فروخت میں {billed} کی اور {cash} نقد وصول کیا۔",
        roman: "Aaj aap ne {count} bikri mein {billed} ki aur {cash} naqad wasool kiya.",
      }),
      { billed: money(facts, billed), count, cash: money(facts, cashReceived) },
    ),
    figures: [
      { label: pick(lang, L.cashReceived), value: money(facts, cashReceived) },
      { label: pick(lang, L.billed), value: money(facts, billed) },
      { label: pick(lang, L.count), value: String(count) },
      { label: pick(lang, L.discounts), value: money(facts, discounts) },
    ],
    rows: topRows(
      byCustomer.map((c) => ({
        label: c.name,
        value: money(facts, c.billed),
        meta: `${c.count}`,
      })),
    ),
    notes: empty
      ? [
          pick(lang, {
            en: "No sales have been recorded today yet.",
            ur: "آج ابھی کوئی فروخت درج نہیں ہوئی۔",
            roman: "Aaj abhi koi bikri darj nahi hui.",
          }),
        ]
      : [],
    nextStep: pick(lang, L.nextSales),
    empty,
    source: "database",
  };
};

const salesMonth: Handler = async (facts, lang) => {
  const report = await facts.report("month");
  const { billed, cashReceived, count, discounts, byCustomer } = report.sales;
  const empty = count === 0;
  return {
    headline: fill(
      pick(lang, {
        en: "This month you billed {billed} across {count} sale(s); {cash} was received in cash.",
        ur: "اس مہینے آپ نے {count} فروخت میں {billed} کی؛ {cash} نقد وصول ہوا۔",
        roman: "Is mahine aap ne {count} bikri mein {billed} ki; {cash} naqad wasool hua.",
      }),
      { billed: money(facts, billed), count, cash: money(facts, cashReceived) },
    ),
    figures: [
      { label: pick(lang, L.billed), value: money(facts, billed) },
      { label: pick(lang, L.cashReceived), value: money(facts, cashReceived) },
      { label: pick(lang, L.count), value: String(count) },
      { label: pick(lang, L.discounts), value: money(facts, discounts) },
    ],
    rows: topRows(
      byCustomer.map((c) => ({
        label: c.name,
        value: money(facts, c.billed),
        meta: `${c.count}`,
      })),
      6,
    ),
    notes: empty
      ? [
          pick(lang, {
            en: "No sales have been recorded this month yet.",
            ur: "اس مہینے ابھی کوئی فروخت درج نہیں ہوئی۔",
            roman: "Is mahine abhi koi bikri darj nahi hui.",
          }),
        ]
      : [],
    nextStep: pick(lang, L.nextSales),
    empty,
    source: "database",
  };
};

const topSellingProducts: Handler = async (facts, lang) => {
  const rows = await facts.productSales();
  const top = [...rows].sort((a, b) => Number(b.quantity) - Number(a.quantity)).slice(0, 8);
  const empty = top.length === 0;
  const totalUnits = sum(top.map((r) => r.quantity));
  return {
    headline: empty
      ? pick(lang, {
          en: "No product sales have been recorded in the last 30 days.",
          ur: "پچھلے 30 دنوں میں کسی مصنوع کی فروخت درج نہیں ہوئی۔",
          roman: "Pichhle 30 dinon mein kisi product ki bikri darj nahi hui.",
        })
      : pick(lang, {
          en: "Your fastest-moving products in the last 30 days:",
          ur: "پچھلے 30 دنوں میں سب سے زیادہ بکنے والی مصنوعات:",
          roman: "Pichhle 30 dinon mein sab se zyada bikne wale products:",
        }),
    figures: [
      { label: pick(lang, L.quantitySold), value: quantity(totalUnits) },
      {
        label: pick(lang, {
          en: "Products sold",
          ur: "فروخت شدہ مصنوعات",
          roman: "Bechay gaye products",
        }),
        value: String(rows.length),
      },
    ],
    rows: top.map((r) => ({
      label: r.name,
      value: quantity(r.quantity, r.unit),
      meta: money(facts, r.revenue),
    })),
    notes: [],
    nextStep: pick(lang, L.nextProducts),
    empty,
    source: "database",
  };
};

const topCustomers: Handler = async (facts, lang) => {
  const report = await facts.report("month");
  const byCustomer = report.sales.byCustomer;
  const empty = byCustomer.length === 0;
  const total = sum(byCustomer.map((c) => c.billed));
  return {
    headline: empty
      ? pick(lang, {
          en: "No customer purchases have been recorded this month.",
          ur: "اس مہینے کسی گاہک کی خریداری درج نہیں ہوئی۔",
          roman: "Is mahine kisi gahak ki kharidari darj nahi hui.",
        })
      : pick(lang, {
          en: "Your biggest customers this month:",
          ur: "اس مہینے آپ کے سب سے بڑے گاہک:",
          roman: "Is mahine aap ke sab se bade gahak:",
        }),
    figures: [
      {
        label: pick(lang, {
          en: "Top customers billed",
          ur: "بڑے گاہکوں کی فروخت",
          roman: "Bade gahakon ki bikri",
        }),
        value: money(facts, total),
      },
      { label: pick(lang, L.customers), value: String(byCustomer.length) },
    ],
    rows: topRows(
      byCustomer.map((c) => ({
        label: c.name,
        value: money(facts, c.billed),
        meta: `${c.count}`,
      })),
      8,
    ),
    notes: [],
    nextStep: pick(lang, L.nextKhata),
    empty,
    source: "database",
  };
};

const salesTrend: Handler = async (facts, lang) => {
  const trend = (await facts.insights()).salesTrend;
  const empty =
    toDecimalOrZero(trend.thisMonth).isZero() &&
    toDecimalOrZero(trend.lastMonth).isZero() &&
    toDecimalOrZero(trend.thisWeek).isZero() &&
    toDecimalOrZero(trend.lastWeek).isZero();

  let headline: string;
  if (empty) {
    headline = pick(lang, {
      en: "There are no sales records yet to compare.",
      ur: "موازنے کے لیے ابھی کوئی فروخت درج نہیں۔",
      roman: "Muqable ke liye abhi koi bikri darj nahi.",
    });
  } else if (trend.weekChangePct === null) {
    headline = fill(
      pick(lang, {
        en: "This week you billed {week}. There were no sales last week to compare.",
        ur: "اس ہفتے آپ نے {week} کی۔ پچھلے ہفتے کوئی فروخت نہیں تھی۔",
        roman: "Is hafte aap ne {week} ki. Pichhle hafte koi bikri nahi thi.",
      }),
      { week: money(facts, trend.thisWeek) },
    );
  } else if (trend.weekChangePct >= 0) {
    headline = fill(
      pick(lang, {
        en: "Sales are up: this week {week}, {pct} more than last week.",
        ur: "فروخت بڑھ رہی ہے: اس ہفتے {week}، پچھلے ہفتے سے {pct} زیادہ۔",
        roman: "Bikri barh rahi hai: is hafte {week}, pichhle hafte se {pct} zyada.",
      }),
      { week: money(facts, trend.thisWeek), pct: pct(trend.weekChangePct) },
    );
  } else {
    headline = fill(
      pick(lang, {
        en: "Sales are down: this week {week}, {pct} versus last week.",
        ur: "فروخت کم ہو رہی ہے: اس ہفتے {week}، پچھلے ہفتے کے مقابلے {pct}۔",
        roman: "Bikri kam ho rahi hai: is hafte {week}, pichhle hafte ke muqable {pct}.",
      }),
      { week: money(facts, trend.thisWeek), pct: pct(trend.weekChangePct) },
    );
  }

  return {
    headline,
    figures: [
      { label: pick(lang, L.thisWeek), value: money(facts, trend.thisWeek) },
      { label: pick(lang, L.lastWeek), value: money(facts, trend.lastWeek) },
      { label: pick(lang, L.change), value: pct(trend.weekChangePct) },
      { label: pick(lang, L.thisMonth), value: money(facts, trend.thisMonth) },
      { label: pick(lang, L.lastMonth), value: money(facts, trend.lastMonth) },
      { label: pick(lang, L.change), value: pct(trend.changePct) },
    ],
    rows: [],
    notes: [],
    nextStep: pick(lang, L.nextReports),
    empty,
    source: "database",
  };
};

const topDebtors: Handler = async (facts, lang) => {
  const outstanding = await facts.outstanding();
  const sorted = [...outstanding].sort(
    (a, b) => Number(b.balance) - Number(a.balance),
  );
  const total = sum(sorted.map((c) => c.balance));
  const empty = sorted.length === 0;
  return {
    headline: empty
      ? pick(lang, {
          en: "No customer currently owes you money.",
          ur: "اس وقت کوئی گاہک مقروض نہیں ہے۔",
          roman: "Is waqt koi gahak maqrooz nahi hai.",
        })
      : fill(
          pick(lang, {
            en: "{count} customers owe you {total} in total. The largest balances:",
            ur: "{count} گاہک مجموعی طور پر {total} دیتے ہیں۔ سب سے بڑی رقوم:",
            roman: "{count} gahak total {total} dete hain. Sab se bade balance:",
          }),
          { count: sorted.length, total: money(facts, total) },
        ),
    figures: [
      { label: pick(lang, L.receivables), value: money(facts, total) },
      { label: pick(lang, L.customers), value: String(sorted.length) },
    ],
    rows: topRows(
      sorted.map((c) => ({
        label: c.name,
        value: money(facts, c.balance),
        meta: c.phone ?? undefined,
      })),
      10,
    ),
    notes: [],
    nextStep: pick(lang, L.nextKhata),
    empty,
    source: "database",
  };
};

const totalReceivables: Handler = async (facts, lang) => {
  const [outstanding, insights] = await Promise.all([
    facts.outstanding(),
    facts.insights(),
  ]);
  const total = sum(outstanding.map((c) => c.balance));
  const empty = toDecimalOrZero(total).isZero();
  return {
    headline: empty
      ? pick(lang, {
          en: "Customers do not owe you anything right now.",
          ur: "اس وقت گاہکوں سے کچھ وصول کرنا باقی نہیں۔",
          roman: "Is waqt gahakon se kuch wasool karna baqi nahi.",
        })
      : fill(
          pick(lang, {
            en: "Customers owe you {total} in total, across {count} customers.",
            ur: "گاہک مجموعی طور پر {total} دیتے ہیں، کل {count} گاہک۔",
            roman: "Gahak total {total} dete hain, kul {count} gahak.",
          }),
          { total: money(facts, total), count: outstanding.length },
        ),
    figures: [
      { label: pick(lang, L.receivables), value: money(facts, total) },
      { label: pick(lang, L.customers), value: String(outstanding.length) },
      { label: pick(lang, L.overdue), value: money(facts, insights.overdue.total) },
      {
        label: pick(lang, {
          en: "Customers overdue",
          ur: "زائد المیعاد گاہک",
          roman: "Overdue gahak",
        }),
        value: String(insights.overdue.customersCount),
      },
    ],
    rows: [],
    notes: [],
    nextStep: pick(lang, L.nextKhata),
    empty,
    source: "database",
  };
};

const inactiveCustomers: Handler = async (facts, lang) => {
  const recency = await facts.customerRecency();
  const stale = recency
    .filter((c) => c.neverPurchased || (c.daysInactive ?? 0) >= 30)
    .sort((a, b) => {
      const byBalance = Number(b.balance) - Number(a.balance);
      if (byBalance !== 0) return byBalance;
      return (b.daysInactive ?? 9999) - (a.daysInactive ?? 9999);
    });
  const empty = stale.length === 0;
  return {
    headline: empty
      ? pick(lang, {
          en: "All your recorded customers have purchased in the last 30 days.",
          ur: "آپ کے تمام درج گاہکوں نے پچھلے 30 دنوں میں خریداری کی ہے۔",
          roman: "Aap ke tamam darj gahakon ne pichhle 30 dinon mein kharidari ki hai.",
        })
      : fill(
          pick(lang, {
            en: "{count} customers have not purchased in the last 30 days.",
            ur: "{count} گاہکوں نے پچھلے 30 دنوں میں خریداری نہیں کی۔",
            roman: "{count} gahakon ne pichhle 30 dinon mein kharidari nahi ki.",
          }),
          { count: stale.length },
        ),
    figures: [
      { label: pick(lang, L.customers), value: String(stale.length) },
      {
        label: pick(lang, L.receivables),
        value: money(facts, sum(stale.map((c) => c.balance))),
      },
    ],
    rows: topRows(
      stale.map((c) => ({
        label: c.name,
        value: c.balance !== "0" ? money(facts, c.balance) : undefined,
        meta: c.neverPurchased
          ? pick(lang, L.neverPurchased)
          : fill(
              pick(lang, {
                en: "{days} days since last purchase",
                ur: "{days} دن آخری خریداری سے",
                roman: "{days} din aakhri kharidari se",
              }),
              { days: c.daysInactive ?? 0 },
            ),
      })),
      10,
    ),
    notes: [],
    nextStep: pick(lang, L.nextKhata),
    empty,
    source: "database",
  };
};

const overdueCustomers: Handler = async (facts, lang) => {
  const recovery = await facts.recovery("overdue");
  const candidates = [...recovery.candidates].sort(
    (a, b) =>
      Number(b.overdueOutstanding) - Number(a.overdueOutstanding),
  );
  const empty = candidates.length === 0;
  return {
    headline: empty
      ? pick(lang, {
          en: "No customer has an overdue balance right now.",
          ur: "اس وقت کسی گاہک کی رقم زائد المیعاد نہیں۔",
          roman: "Is waqt kisi gahak ka udhaar overdue nahi.",
        })
      : fill(
          pick(lang, {
            en: "{count} customers are overdue on {total} of payments.",
            ur: "{count} گاہکوں کی {total} ادائیگیاں زائد المیعاد ہیں۔",
            roman: "{count} gahakon ki {total} adayegian overdue hain.",
          }),
          {
            count: recovery.summary.overdueCustomersCount,
            total: money(facts, recovery.summary.overdueOutstanding),
          },
        ),
    figures: [
      {
        label: pick(lang, L.overdue),
        value: money(facts, recovery.summary.overdueOutstanding),
      },
      {
        label: pick(lang, {
          en: "Customers overdue",
          ur: "زائد المیعاد گاہک",
          roman: "Overdue gahak",
        }),
        value: String(recovery.summary.overdueCustomersCount),
      },
      {
        label: pick(lang, {
          en: "Oldest overdue",
          ur: "سب سے پرانا زائد المیعاد",
          roman: "Sab se purana overdue",
        }),
        value: fill(
          pick(lang, { en: "{days} days", ur: "{days} دن", roman: "{days} din" }),
          { days: recovery.summary.oldestOverdueDays },
        ),
      },
    ],
    rows: topRows(
      candidates.map((c) => ({
        label: c.customerName,
        value: money(facts, c.overdueOutstanding),
        meta: fill(
          pick(lang, { en: "{days} days overdue", ur: "{days} دن زائد المیعاد", roman: "{days} din overdue" }),
          { days: c.daysOverdue },
        ),
      })),
      10,
    ),
    notes: [],
    nextStep: pick(lang, L.nextRecovery),
    empty,
    source: "database",
  };
};

const repeatOrderCustomers: Handler = async (facts, lang) => {
  const recency = await facts.customerRecency();
  const due = recency
    .filter(
      (c) =>
        !c.neverPurchased &&
        c.daysInactive !== null &&
        c.daysInactive >= 14 &&
        c.daysInactive <= 60,
    )
    .sort((a, b) => Number(b.balance) - Number(a.balance));
  const empty = due.length === 0;
  return {
    headline: empty
      ? pick(lang, {
          en: "No customers are currently due for a repeat order.",
          ur: "اس وقت کوئی گاہک دوبارہ آرڈر کے لیے تیار نہیں۔",
          roman: "Is waqt koi gahak dobara order ke liye tayyar nahi.",
        })
      : fill(
          pick(lang, {
            en: "{count} customers bought before but have not ordered in 2-8 weeks. Good follow-up candidates:",
            ur: "{count} گاہکوں نے پہلے خریدا لیکن 2-8 ہفتوں سے آرڈر نہیں دیا۔ فالو اپ کے لیے موزوں:",
            roman: "{count} gahakon ne pehle kharida lekin 2-8 hafton se order nahi diya. Follow-up ke liye mozoon:",
          }),
          { count: due.length },
        ),
    figures: [
      {
        label: pick(lang, {
          en: "Follow-up candidates",
          ur: "فالو اپ امیدوار",
          roman: "Follow-up candidates",
        }),
        value: String(due.length),
      },
      {
        label: pick(lang, L.receivables),
        value: money(facts, sum(due.map((c) => c.balance))),
      },
    ],
    rows: topRows(
      due.map((c) => ({
        label: c.name,
        value: fill(
          pick(lang, { en: "{days} days since order", ur: "{days} دن پرانا آرڈر", roman: "{days} din purana order" }),
          { days: c.daysInactive ?? 0 },
        ),
        meta: c.balance !== "0" ? money(facts, c.balance) : undefined,
      })),
      10,
    ),
    notes: [],
    nextStep: pick(lang, L.nextRecovery),
    empty,
    source: "database",
  };
};

const lowStock: Handler = async (facts, lang) => {
  const products = await facts.products();
  const low = products
    .filter((p) => p.isLowStock)
    .sort((a, b) => Number(a.currentStock) - Number(b.currentStock));
  const empty = low.length === 0;
  return {
    headline: empty
      ? pick(lang, {
          en: "No product is below its low-stock level right now.",
          ur: "اس وقت کوئی مصنوع اپنی کم اسٹاک حد سے نیچے نہیں۔",
          roman: "Is waqt koi product apni low-stock had se neeche nahi.",
        })
      : fill(
          pick(lang, {
            en: "{count} products are at or below their low-stock level.",
            ur: "{count} مصنوعات اپنی کم اسٹاک حد پر یا نیچے ہیں۔",
            roman: "{count} products apni low-stock had par ya neeche hain.",
          }),
          { count: low.length },
        ),
    figures: [
      {
        label: pick(lang, {
          en: "Low-stock products",
          ur: "کم اسٹاک مصنوعات",
          roman: "Kam stock products",
        }),
        value: String(low.length),
      },
      {
        label: pick(lang, {
          en: "Products tracked",
          ur: "کل مصنوعات",
          roman: "Kul products",
        }),
        value: String(products.length),
      },
    ],
    rows: topRows(
      low.map((p) => ({
        label: p.name,
        value: quantity(p.currentStock, p.unit),
        meta: `${pick(lang, L.threshold)}: ${p.lowStockThreshold}`,
      })),
      10,
    ),
    notes: [],
    nextStep: pick(lang, L.nextProducts),
    empty,
    source: "database",
  };
};

const highestSalesProducts: Handler = async (facts, lang) => {
  const rows = await facts.productSales();
  const top = rows.slice(0, 8);
  const empty = top.length === 0;
  const total = sum(rows.map((r) => r.revenue));
  return {
    headline: empty
      ? pick(lang, {
          en: "No product sales have been recorded in the last 30 days.",
          ur: "پچھلے 30 دنوں میں کسی مصنوع کی فروخت درج نہیں ہوئی۔",
          roman: "Pichhle 30 dinon mein kisi product ki bikri darj nahi hui.",
        })
      : pick(lang, {
          en: "Products with the highest sales value in the last 30 days:",
          ur: "پچھلے 30 دنوں میں سب سے زیادہ فروخت والی مصنوعات:",
          roman: "Pichhle 30 dinon mein sab se zyada sales value wale products:",
        }),
    figures: [
      {
        label: pick(lang, {
          en: "Product sales (30 days)",
          ur: "مصنوعات کی فروخت (30 دن)",
          roman: "Products ki sales (30 din)",
        }),
        value: money(facts, total),
      },
      {
        label: pick(lang, {
          en: "Products sold",
          ur: "فروخت شدہ مصنوعات",
          roman: "Bechay gaye products",
        }),
        value: String(rows.length),
      },
    ],
    rows: top.map((r) => ({
      label: r.name,
      value: money(facts, r.revenue),
      meta: quantity(r.quantity, r.unit),
    })),
    notes: [],
    nextStep: pick(lang, L.nextProducts),
    empty,
    source: "database",
  };
};

const deadStock: Handler = async (facts, lang) => {
  const dead = await facts.deadStock();
  const empty = dead.length === 0;
  const value = sum(dead.map((d) => d.stockValue));
  return {
    headline: empty
      ? pick(lang, {
          en: "Every product with stock has sold in the last 30 days.",
          ur: "اسٹاک والی ہر مصنوع پچھلے 30 دنوں میں بکی ہے۔",
          roman: "Stock wale har product ne pichhle 30 dinon mein bik gaya.",
        })
      : fill(
          pick(lang, {
            en: "{count} products have stock but have not sold in the last 30 days.",
            ur: "{count} مصنوعات کا اسٹاک ہے مگر پچھلے 30 دنوں میں نہیں بکیں۔",
            roman: "{count} products ka stock hai magar pichhle 30 dinon mein nahi bike.",
          }),
          { count: dead.length },
        ),
    figures: [
      {
        label: pick(lang, {
          en: "Not selling (30 days)",
          ur: "نہ بکنے والی (30 دن)",
          roman: "Na bikne wali (30 din)",
        }),
        value: String(dead.length),
      },
      { label: pick(lang, L.stockValue), value: money(facts, value) },
    ],
    rows: topRows(
      dead.map((d) => ({
        label: d.name,
        value: quantity(d.currentStock, d.unit),
        meta: money(facts, d.stockValue),
      })),
      10,
    ),
    notes: [],
    nextStep: pick(lang, L.nextProducts),
    empty,
    source: "database",
  };
};

const inventoryValue: Handler = async (facts, lang) => {
  const [report, products] = await Promise.all([
    facts.report("month"),
    facts.products(),
  ]);
  const { stockValue, stockProducts, stockNotValued } = report.position;
  const empty = stockProducts === 0;
  const byValue = products
    .map((p) => ({
      name: p.name,
      unit: p.unit,
      stock: p.currentStock,
      value: toDecimalOrZero(p.currentStock).times(
        toDecimalOrZero(p.purchasePrice),
      ),
    }))
    .filter((p) => p.value.greaterThan(0))
    .sort((a, b) => b.value.minus(a.value).toNumber())
    .slice(0, 8);

  const notes: string[] = [];
  if (stockNotValued > 0) {
    notes.push(
      fill(
        pick(lang, {
          en: "{count} products have stock but no purchase price, so they are not included in the value.",
          ur: "{count} مصنوعات کا اسٹاک ہے مگر خرید قیمت نہیں، اس لیے وہ قیمت میں شامل نہیں۔",
          roman: "{count} products ka stock hai magar kharid qeemat nahi, is liye wo value mein shamil nahi.",
        }),
        { count: stockNotValued },
      ),
    );
  }

  return {
    headline: empty
      ? pick(lang, {
          en: "There is no stock on hand to value right now.",
          ur: "اس وقت قیمت لگانے کے لیے کوئی اسٹاک موجود نہیں۔",
          roman: "Is waqt qeemat lagane ke liye koi stock mojood nahi.",
        })
      : fill(
          pick(lang, {
            en: "Your available inventory is worth about {value} across {count} products.",
            ur: "آپ کا موجودہ اسٹاک تقریباً {value} کا ہے، {count} مصنوعات میں۔",
            roman: "Aap ka mojooda stock taqreeban {value} ka hai, {count} products mein.",
          }),
          { value: money(facts, stockValue), count: stockProducts },
        ),
    figures: [
      { label: pick(lang, L.stockValue), value: money(facts, stockValue) },
      {
        label: pick(lang, {
          en: "Products with stock",
          ur: "اسٹاک والی مصنوعات",
          roman: "Stock wale products",
        }),
        value: String(stockProducts),
      },
      {
        label: pick(lang, {
          en: "Not valued",
          ur: "قیمت کے بغیر",
          roman: "Value ke baghair",
        }),
        value: String(stockNotValued),
      },
    ],
    rows: topRows(
      byValue.map((p) => ({
        label: p.name,
        value: money(facts, p.value),
        meta: quantity(p.stock, p.unit),
      })),
      8,
    ),
    notes,
    nextStep: pick(lang, L.nextProducts),
    empty,
    source: "database",
  };
};

const expensesMonth: Handler = async (facts, lang) => {
  const report = await facts.report("month");
  const { total, count, byCategory } = report.expenses;
  const empty = count === 0;
  const sorted = [...byCategory].sort(
    (a, b) => Number(b.amount) - Number(a.amount),
  );
  return {
    headline: empty
      ? pick(lang, {
          en: "No expenses have been recorded this month.",
          ur: "اس مہینے کوئی خرچ درج نہیں ہوا۔",
          roman: "Is mahine koi kharch darj nahi hua.",
        })
      : fill(
          pick(lang, {
            en: "This month you spent {total} across {count} expense(s).",
            ur: "اس مہینے آپ نے {count} اخراجات میں {total} خرچ کیا۔",
            roman: "Is mahine aap ne {count} kharchon mein {total} kharch kiya.",
          }),
          { total: money(facts, total), count },
        ),
    figures: [
      { label: pick(lang, L.expenses), value: money(facts, total) },
      {
        label: pick(lang, {
          en: "Expense count",
          ur: "اخراجات کی تعداد",
          roman: "Kharchon ki tadaad",
        }),
        value: String(count),
      },
    ],
    rows: topRows(
      sorted.map((c) => ({
        label: c.category,
        value: money(facts, c.amount),
        meta: `${c.count}`,
      })),
      8,
    ),
    notes: [],
    nextStep: pick(lang, L.nextExpenses),
    empty,
    source: "database",
  };
};

const netProfitMonth: Handler = async (facts, lang) => {
  const report = await facts.report("month");
  const { profit, sales, position } = report;
  const empty =
    toDecimalOrZero(profit.revenue).isZero() &&
    toDecimalOrZero(profit.expenses).isZero();
  const notes: string[] = [];
  if (!empty) {
    notes.push(
      pick(lang, {
        en: "This is an estimate from recorded sales and expenses; it is not money in your pocket.",
        ur: "یہ درج فروخت اور اخراجات سے ایک تخمینہ ہے؛ یہ آپ کی جیب میں موجود رقم نہیں۔",
        roman: "Yeh darj bikri aur kharch se ek andaza hai; yeh aap ki jaib mein mojood raqam nahi.",
      }),
    );
    notes.push(
      fill(
        pick(lang, {
          en: "Cash actually received this month is {cash}; {owed} is still owed by customers.",
          ur: "اس مہینے اصل نقد وصولی {cash} ہے؛ گاہکوں سے {owed} ابھی وصول کرنا ہے۔",
          roman: "Is mahine asal naqad wasooli {cash} hai; gahakon se {owed} abhi wasool karna hai.",
        }),
        { cash: money(facts, sales.cashReceived), owed: money(facts, position.receivables) },
      ),
    );
    if (toDecimalOrZero(profit.cogs).isZero() && !toDecimalOrZero(profit.revenue).isZero()) {
      notes.push(
        pick(lang, {
          en: "Cost of goods is zero because those products have no purchase price on record, so the real profit may be lower.",
          ur: "اشیا کی لاگت صفر ہے کیونکہ ان مصنوعات کی خرید قیمت درج نہیں، اس لیے اصل منافع کم ہو سکتا ہے۔",
          roman: "Maal ki lagat zero hai kyunke un products ki kharid qeemat darj nahi, is liye asal munafa kam ho sakta hai.",
        }),
      );
    }
  }

  return {
    headline: empty
      ? pick(lang, {
          en: "There are no sales or expenses recorded this month, so profit cannot be estimated yet.",
          ur: "اس مہینے کوئی فروخت یا خرچ درج نہیں، اس لیے منافع کا اندازہ نہیں لگایا جا سکتا۔",
          roman: "Is mahine koi bikri ya kharch darj nahi, is liye munafa ka andaza nahi lagaya ja sakta.",
        })
      : fill(
          pick(lang, {
            en: "Estimated net profit this month is {net}: revenue {revenue} minus cost of goods {cogs} and expenses {expenses}.",
            ur: "اس مہینے کا تخمینہ خالص منافع {net} ہے: آمدنی {revenue} میں سے اشیا کی لاگت {cogs} اور اخراجات {expenses} نکال کر۔",
            roman: "Is mahine ka andaza net munafa {net} hai: aamdani {revenue} mein se maal ki lagat {cogs} aur kharch {expenses} nikaal kar.",
          }),
          {
            net: money(facts, profit.netProfit),
            revenue: money(facts, profit.revenue),
            cogs: money(facts, profit.cogs),
            expenses: money(facts, profit.expenses),
          },
        ),
    figures: [
      { label: pick(lang, L.revenue), value: money(facts, profit.revenue) },
      { label: pick(lang, L.cogs), value: money(facts, profit.cogs) },
      { label: pick(lang, L.grossProfit), value: money(facts, profit.grossProfit) },
      { label: pick(lang, L.expenses), value: money(facts, profit.expenses) },
      { label: pick(lang, L.netProfit), value: money(facts, profit.netProfit) },
      { label: pick(lang, L.margin), value: `${profit.profitMargin}%` },
    ],
    rows: [],
    notes,
    nextStep: pick(lang, L.nextReports),
    empty,
    source: "database",
  };
};

const biggestExpenses: Handler = async (facts, lang) => {
  const report = await facts.report("month");
  const sorted = [...report.expenses.byCategory].sort(
    (a, b) => Number(b.amount) - Number(a.amount),
  );
  const empty = sorted.length === 0;
  return {
    headline: empty
      ? pick(lang, {
          en: "No expenses have been recorded this month to rank.",
          ur: "درجہ بندی کے لیے اس مہینے کوئی خرچ درج نہیں۔",
          roman: "Ranking ke liye is mahine koi kharch darj nahi.",
        })
      : pick(lang, {
          en: "Your biggest business expenses this month:",
          ur: "اس مہینے آپ کے سب سے بڑے کاروباری اخراجات:",
          roman: "Is mahine aap ke sab se bade karobari kharch:",
        }),
    figures: [
      { label: pick(lang, L.expenses), value: money(facts, report.expenses.total) },
      {
        label: pick(lang, {
          en: "Categories",
          ur: "اقسام",
          roman: "Categories",
        }),
        value: String(sorted.length),
      },
    ],
    rows: topRows(
      sorted.map((c) => ({
        label: c.category,
        value: money(facts, c.amount),
        meta: `${c.count}`,
      })),
      8,
    ),
    notes: [
      pick(lang, {
        en: "Based on this month's recorded expenses.",
        ur: "اس مہینے کے درج اخراجات کی بنیاد پر۔",
        roman: "Is mahine ke darj kharch ki bunyad par.",
      }),
    ],
    nextStep: pick(lang, L.nextExpenses),
    empty,
    source: "database",
  };
};

const cashVsSales: Handler = async (facts, lang) => {
  const report = await facts.report("month");
  const { billed, cashReceived, count, discounts } = report.sales;
  const { receivables } = report.position;
  const methods = report.collections.byMethod;
  const empty = count === 0 && toDecimalOrZero(cashReceived).isZero();
  const billedDec = toDecimalOrZero(billed);
  const collectedPct = billedDec.isZero()
    ? null
    : Number(
        toDecimalOrZero(cashReceived).div(billedDec).times(100).toDecimalPlaces(1),
      );
  return {
    headline: empty
      ? pick(lang, {
          en: "There are no sales or collections recorded this month.",
          ur: "اس مہینے کوئی فروخت یا وصولی درج نہیں۔",
          roman: "Is mahine koi bikri ya wasooli darj nahi.",
        })
      : fill(
          pick(lang, {
            en: "This month you billed {billed} and actually received {cash}. Customers still owe {owed} overall.",
            ur: "اس مہینے آپ نے {billed} کی اور اصل {cash} وصول کیا۔ گاہکوں سے مجموعی طور پر {owed} ابھی وصول کرنا ہے۔",
            roman: "Is mahine aap ne {billed} ki aur asal {cash} wasool kiya. Gahakon se total {owed} abhi wasool karna hai.",
          }),
          {
            billed: money(facts, billed),
            cash: money(facts, cashReceived),
            owed: money(facts, receivables),
          },
        ),
    figures: [
      { label: pick(lang, L.billed), value: money(facts, billed) },
      { label: pick(lang, L.cashReceived), value: money(facts, cashReceived) },
      {
        label: pick(lang, {
          en: "Collected vs billed",
          ur: "وصولی بمقابلہ فروخت",
          roman: "Wasooli vs bikri",
        }),
        value: collectedPct === null ? "—" : `${collectedPct}%`,
      },
      { label: pick(lang, L.receivables), value: money(facts, receivables) },
      { label: pick(lang, L.discounts), value: money(facts, discounts) },
    ],
    rows: topRows(
      methods.map((m) => ({
        label: m.method,
        value: money(facts, m.amount),
        meta: `${m.count}`,
      })),
      6,
    ),
    notes: [
      pick(lang, {
        en: "Cash received is money collected from customers in this period; it is not the same as revenue, because some sales are on credit.",
        ur: "وصول شدہ رقم اس عرصے میں گاہکوں سے ملی؛ یہ آمدنی کے برابر نہیں، کیونکہ کچھ فروخت ادھار ہے۔",
        roman: "Wasool shuda raqam is arse mein gahakon se mili; yeh aamdani ke barabar nahi, kyunke kuch bikri udhaar hai.",
      }),
    ],
    nextStep: pick(lang, L.nextKhata),
    empty,
    source: "database",
  };
};

// ── Performance handlers build on the same facts ────────────────────────────

type Problem = { label: string; amount: string; severity: "high" | "medium" | "low" };

async function analyseProblems(facts: KhataFacts, lang: KhataLanguage) {
  const [insights, report, dead] = await Promise.all([
    facts.insights(),
    facts.report("month"),
    facts.deadStock(),
  ]);
  const problems: Problem[] = [];

  const overdue = toDecimalOrZero(insights.overdue.total);
  if (overdue.greaterThan(0)) {
    problems.push({
      label: fill(
        pick(lang, {
          en: "Overdue customer payments from {count} customers",
          ur: "{count} گاہکوں کی زائد المیعاد ادائیگیاں",
          roman: "{count} gahakon ki overdue adayegian",
        }),
        { count: insights.overdue.customersCount },
      ),
      amount: money(facts, overdue),
      severity: "high",
    });
  }

  const overduePayables = toDecimalOrZero(insights.overduePayables.total);
  if (overduePayables.greaterThan(0)) {
    problems.push({
      label: pick(lang, {
        en: "Overdue payments to suppliers",
        ur: "سپلائرز کو زائد المیعاد ادائیگیاں",
        roman: "Suppliers ko overdue adayegian",
      }),
      amount: money(facts, overduePayables),
      severity: "high",
    });
  }

  const net = toDecimalOrZero(report.profit.netProfit);
  if (net.lessThan(0)) {
    problems.push({
      label: pick(lang, {
        en: "This month's expenses are larger than gross profit",
        ur: "اس مہینے اخراجات مجموعی منافع سے زیادہ ہیں",
        roman: "Is mahine kharch majmooi munafe se zyada hain",
      }),
      amount: money(facts, net.abs()),
      severity: "high",
    });
  }

  const weekChange = insights.salesTrend.weekChangePct;
  if (weekChange !== null && weekChange < 0) {
    problems.push({
      label: fill(
        pick(lang, {
          en: "Sales fell {pct} versus last week",
          ur: "فروخت پچھلے ہفتے سے {pct} کم ہوئی",
          roman: "Bikri pichhle hafte se {pct} kam hui",
        }),
        { pct: `${Math.abs(weekChange)}%` },
      ),
      amount: money(facts, insights.salesTrend.thisWeek),
      severity: "medium",
    });
  }

  const lowCount = insights.lowStock.length;
  if (lowCount > 0) {
    problems.push({
      label: fill(
        pick(lang, {
          en: "{count} products are low on stock",
          ur: "{count} مصنوعات کا اسٹاک کم ہے",
          roman: "{count} products ka stock kam hai",
        }),
        { count: lowCount },
      ),
      amount: String(lowCount),
      severity: "medium",
    });
  }

  const deadValue = toDecimalOrZero(sum(dead.map((d) => d.stockValue)));
  if (deadValue.greaterThan(0)) {
    problems.push({
      label: fill(
        pick(lang, {
          en: "{count} products ({value}) have not sold in 30 days",
          ur: "{count} مصنوعات ({value}) 30 دنوں میں نہیں بکیں",
          roman: "{count} products ({value}) 30 dinon mein nahi bike",
        }),
        { count: dead.length, value: money(facts, deadValue) },
      ),
      amount: money(facts, deadValue),
      severity: "low",
    });
  }

  const sevRank = { high: 0, medium: 1, low: 2 } as const;
  problems.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
  return { problems, insights, report, dead, deadValue };
}

const businessProblems: Handler = async (facts, lang) => {
  const { problems, insights, report, dead, deadValue } = await analyseProblems(
    facts,
    lang,
  );
  const hasAnyData =
    problems.length > 0 ||
    !toDecimalOrZero(report.sales.billed).isZero() ||
    report.sales.count > 0;
  const empty = problems.length === 0;

  return {
    headline: empty
      ? pick(lang, {
          en: hasAnyData
            ? "I did not find a pressing problem in your records right now."
            : "There are not enough records yet to analyse problems.",
          ur: hasAnyData
            ? "اس وقت آپ کے ریکارڈ میں کوئی فوری مسئلہ نہیں ملا۔"
            : "تجزیے کے لیے ابھی کافی ریکارڈز نہیں۔",
          roman: hasAnyData
            ? "Is waqt aap ke record mein koi fori masla nahi mila."
            : "Tajziye ke liye abhi kaafi records nahi.",
        })
      : fill(
          pick(lang, {
            en: "I found {count} things worth your attention.",
            ur: "مجھے {count} باتیں توجہ کے قابل ملیں۔",
            roman: "Mujhe {count} baatein tawajjo ke qabil mili.",
          }),
          { count: problems.length },
        ),
    figures: [
      {
        label: pick(lang, L.overdue),
        value: money(facts, insights.overdue.total),
      },
      {
        label: pick(lang, {
          en: "Low-stock products",
          ur: "کم اسٹاک مصنوعات",
          roman: "Kam stock products",
        }),
        value: String(insights.lowStock.length),
      },
      {
        label: pick(lang, L.stockValue),
        value: money(facts, deadValue),
      },
      {
        label: pick(lang, {
          en: "Not selling (30 days)",
          ur: "نہ بکنے والی (30 دن)",
          roman: "Na bikne wali (30 din)",
        }),
        value: String(dead.length),
      },
    ],
    rows: problems.map((p) => ({
      label: p.label,
      value: p.amount,
      meta: pick(lang, {
        en: p.severity,
        ur: { high: "اہم", medium: "درمیانہ", low: "معمولی" }[p.severity],
        roman: { high: "Aham", medium: "Darmiyana", low: "Mamooli" }[p.severity],
      }),
    })),
    notes: empty
      ? []
      : [
          pick(lang, {
            en: "Based on your current records. Figures update as you add sales, payments and expenses.",
            ur: "آپ کے موجودہ ریکارڈ کی بنیاد پر۔ فروخت، ادائیگی اور اخراجات شامل کرنے پر اعداد و شمار بدلتے ہیں۔",
            roman: "Aap ke mojooda record ki bunyad par. Bikri, adayegi aur kharch shamil karne par figures badalte hain.",
          }),
        ],
    nextStep: pick(lang, L.nextReports),
    empty,
    source: "database",
  };
};

const improvementPlan: Handler = async (facts, lang) => {
  const { problems, insights, dead, deadValue } = await analyseProblems(facts, lang);
  const steps: Array<{ label: string; value?: string; meta?: string }> = [];

  if (toDecimalOrZero(insights.overdue.total).greaterThan(0)) {
    steps.push({
      label: fill(
        pick(lang, {
          en: "Collect overdue payments ({count} customers)",
          ur: "زائد المیعاد ادائیگیاں وصول کریں ({count} گاہک)",
          roman: "Overdue adayegian wasool karein ({count} gahak)",
        }),
        { count: insights.overdue.customersCount },
      ),
      value: money(facts, insights.overdue.total),
      meta: pick(lang, L.nextKhata),
    });
  }

  if (toDecimalOrZero(insights.payables.total).greaterThan(0)) {
    steps.push({
      label: pick(lang, {
        en: "Plan payment for what you owe suppliers",
        ur: "سپلائرز کو واجب الادا رقم کی ادائیگی کا منصوبہ بنائیں",
        roman: "Suppliers ko wajib ul ada raqam ki adayegi ka mansooba banayein",
      }),
      value: money(facts, insights.payables.total),
    });
  }

  if (insights.lowStock.length > 0) {
    steps.push({
      label: fill(
        pick(lang, {
          en: "Restock {count} low products so you do not miss sales",
          ur: "{count} کم اسٹاک مصنوعات دوبارہ منگوائیں تاکہ فروخت ضائع نہ ہو",
          roman: "{count} kam stock products dobara mangwayein taake bikri zaya na ho",
        }),
        { count: insights.lowStock.length },
      ),
      value: insights.lowStock
        .slice(0, 3)
        .map((p) => p.name)
        .join(", "),
    });
  }

  if (toDecimalOrZero(deadValue).greaterThan(0)) {
    steps.push({
      label: fill(
        pick(lang, {
          en: "Discount or bundle {count} slow products to free up cash",
          ur: "{count} سست مصنوعات پر رعایت دیں تاکہ رقم آزاد ہو",
          roman: "{count} sust products par riyayat dein taake raqam azaad ho",
        }),
        { count: dead.length },
      ),
      value: money(facts, deadValue),
    });
  }

  const weekChange = insights.salesTrend.weekChangePct;
  if (weekChange !== null && weekChange < 0) {
    steps.push({
      label: pick(lang, {
        en: "Follow up with recent customers to recover this week's sales",
        ur: "اس ہفتے کی فروخت بہتر کرنے کے لیے حالیہ گاہکوں سے رابطہ کریں",
        roman: "Is hafte ki bikri behtar karne ke liye halia gahakon se rabta karein",
      }),
      value: `${Math.abs(weekChange)}%`,
    });
  }

  const top = (await facts.productSales())[0];
  if (top) {
    steps.push({
      label: fill(
        pick(lang, {
          en: "Keep {name} well stocked — it is your top seller",
          ur: "{name} کا اسٹاک برقرار رکھیں — یہ سب سے زیادہ بکتا ہے",
          roman: "{name} ka stock barqarar rakhein — yeh sab se zyada bikta hai",
        }),
        { name: top.name },
      ),
    });
  }

  const empty = problems.length === 0 && steps.length === 0;

  return {
    headline: empty
      ? pick(lang, {
          en: "There are not enough records yet to suggest improvements.",
          ur: "بہتری کی تجاویز کے لیے ابھی کافی ریکارڈز نہیں۔",
          roman: "Behtari ki tajaveez ke liye abhi kaafi records nahi.",
        })
      : pick(lang, {
          en: "Here is what I would do next, based on your numbers:",
          ur: "آپ کے اعداد و شمار کی بنیاد پر میں یہ کرتا:",
          roman: "Aap ke figures ki bunyad par main yeh karta:",
        }),
    figures: [],
    rows: steps.map((s) => ({
      label: s.label,
      value: s.value,
      meta: s.meta,
    })),
    notes: empty
      ? []
      : [
          pick(lang, {
            en: "These are suggestions drawn from your own figures — not investment, tax or legal advice.",
            ur: "یہ آپ کے اپنے اعداد سے نکالی گئی تجاویز ہیں — سرمایہ کاری، ٹیکس یا قانونی مشورہ نہیں۔",
            roman: "Yeh aap ke apne figures se nikali gayi tajaveez hain — sarmayakari, tax ya qanooni mashwara nahi.",
          }),
        ],
    nextStep: pick(lang, L.nextReports),
    empty,
    source: "database",
  };
};

const comparePeriods: Handler = async (facts, lang) => {
  const [month, lastMonth] = await Promise.all([
    facts.report("month"),
    facts.report("lastMonth"),
  ]);
  const salesNow = toDecimalOrZero(month.sales.billed);
  const salesPrev = toDecimalOrZero(lastMonth.sales.billed);
  const changePct = salesPrev.isZero()
    ? null
    : Number(salesNow.minus(salesPrev).div(salesPrev).times(100).toDecimalPlaces(1));
  const empty = salesNow.isZero() && salesPrev.isZero();

  return {
    headline: empty
      ? pick(lang, {
          en: "There are no comparable sales for this month and last month.",
          ur: "اس اور پچھلے مہینے کے لیے موازنے والی فروخت نہیں۔",
          roman: "Is aur pichhle mahine ke liye muqable wali bikri nahi.",
        })
      : fill(
          pick(lang, {
            en: "This month you billed {now}; last month {prev} ({change}).",
            ur: "اس مہینے آپ نے {now} کی؛ پچھلے مہینے {prev} ({change})۔",
            roman: "Is mahine aap ne {now} ki; pichhle mahine {prev} ({change}).",
          }),
          {
            now: money(facts, month.sales.billed),
            prev: money(facts, lastMonth.sales.billed),
            change: pct(changePct),
          },
        ),
    figures: [
      { label: pick(lang, L.thisMonth), value: money(facts, month.sales.billed) },
      { label: pick(lang, L.lastMonth), value: money(facts, lastMonth.sales.billed) },
      { label: pick(lang, L.change), value: pct(changePct) },
      {
        label: pick(lang, {
          en: "Expenses this month",
          ur: "اس مہینے کے اخراجات",
          roman: "Is mahine ke kharch",
        }),
        value: money(facts, month.expenses.total),
      },
      {
        label: pick(lang, {
          en: "Expenses last month",
          ur: "پچھلے مہینے کے اخراجات",
          roman: "Pichhle mahine ke kharch",
        }),
        value: money(facts, lastMonth.expenses.total),
      },
      { label: pick(lang, L.netProfit), value: money(facts, month.profit.netProfit) },
    ],
    rows: [],
    notes: [],
    nextStep: pick(lang, L.nextReports),
    empty,
    source: "database",
  };
};

const HANDLERS: Record<KhataIntent, Handler | undefined> = {
  sales_today: salesToday,
  sales_month: salesMonth,
  top_selling_products: topSellingProducts,
  top_customers: topCustomers,
  sales_trend: salesTrend,
  top_debtors: topDebtors,
  total_receivables: totalReceivables,
  inactive_customers: inactiveCustomers,
  overdue_customers: overdueCustomers,
  repeat_order_customers: repeatOrderCustomers,
  low_stock: lowStock,
  highest_sales_products: highestSalesProducts,
  dead_stock: deadStock,
  inventory_value: inventoryValue,
  expenses_month: expensesMonth,
  net_profit_month: netProfitMonth,
  biggest_expenses: biggestExpenses,
  cash_vs_sales: cashVsSales,
  business_problems: businessProblems,
  improvement_plan: improvementPlan,
  compare_periods: comparePeriods,
  unknown: undefined,
};

// ────────────────────────────────────────────────────────────────────────────
// Public entry
// ────────────────────────────────────────────────────────────────────────────

export function buildAnswer(
  intent: KhataIntent,
  question: string,
  language: KhataLanguage,
  body: AnswerBody,
): KhataAnswer {
  const questionId = (
    getPreparedQuestion(intent as KhataQuestionId) ? intent : null
  ) as KhataQuestionId | null;
  return {
    kind: "answer",
    questionId,
    question,
    language,
    generatedAt: new Date().toISOString(),
    ...body,
  };
}

export async function runIntent(
  facts: KhataFacts,
  intent: KhataIntent,
  question: string,
  language: KhataLanguage,
): Promise<KhataAnswer> {
  const handler = HANDLERS[intent];
  if (!handler) {
    return guidanceAnswer(language, question);
  }
  const body = await handler(facts, language);
  return buildAnswer(intent, question, language, body);
}

// ────────────────────────────────────────────────────────────────────────────
// Guidance (never invents data)
// ────────────────────────────────────────────────────────────────────────────

export function guidanceAnswer(
  language: KhataLanguage,
  question: string,
): KhataAnswer {
  return {
    kind: "answer",
    questionId: null,
    question,
    language,
    headline: pick(language, {
      en: "I could not match that to your business data. Try one of the prepared questions, or ask about sales, customers, stock, expenses or profit.",
      ur: "میں اسے آپ کے کاروباری ڈیٹا سے نہیں جوڑ سکا۔ تیار سوالات میں سے کوئی آزمائیں، یا فروخت، گاہک، اسٹاک، اخراجات یا منافع کے بارے میں پوچھیں۔",
      roman: "Main ise aap ke karobari data se nahi jor saka. Tayyar sawalat mein se koi azmayein, ya bikri, gahak, stock, kharch ya munafa ke baare mein poochein.",
    }),
    figures: [],
    rows: [
      {
        label: pick(language, { en: "Sales", ur: "فروخت", roman: "Bikri" }),
        meta: pick(language, {
          en: "How much have I sold this month?",
          ur: "اس مہینے کتنی فروخت ہوئی؟",
          roman: "Is mahine kitni bikri hui?",
        }),
      },
      {
        label: pick(language, { en: "Customers", ur: "گاہک", roman: "Gahak" }),
        meta: pick(language, {
          en: "Which customers owe me the most?",
          ur: "کون سے گاہک سب سے زیادہ مقروض ہیں؟",
          roman: "Kaun se gahak sab se zyada maqrooz hain?",
        }),
      },
      {
        label: pick(language, { en: "Stock", ur: "اسٹاک", roman: "Stock" }),
        meta: pick(language, {
          en: "Which products are running low?",
          ur: "کون سی مصنوعات کم ہو رہی ہیں؟",
          roman: "Kaun se products kam ho rahe hain?",
        }),
      },
      {
        label: pick(language, { en: "Profit", ur: "منافع", roman: "Munafa" }),
        meta: pick(language, {
          en: "What is my estimated net profit this month?",
          ur: "اس مہینے کا تخمینہ خالص منافع کتنا ہے؟",
          roman: "Is mahine ka andaza net munafa kitna hai?",
        }),
      },
    ],
    notes: [],
    empty: false,
    source: "database",
    generatedAt: new Date().toISOString(),
  };
}

export function actionGuidanceAnswer(
  language: KhataLanguage,
  question: string,
): KhataAnswer {
  return {
    kind: "answer",
    questionId: null,
    question,
    language,
    headline: pick(language, {
      en: "I only explain your business — I do not create or change records. Use the Universal Voice Assistant (tap the microphone) or the matching screen to record it.",
      ur: "میں صرف آپ کے کاروبار کی وضاحت کرتا ہوں — ریکارڈ بناتا یا بدلتا نہیں۔ درج کرنے کے لیے یونیورسل وائس اسسٹنٹ (مائیک دبائیں) یا متعلقہ اسکرین استعمال کریں۔",
      roman: "Main sirf aap ke karobar ki wazahat karta hoon — record banata ya badalta nahi. Darj karne ke liye Universal Voice Assistant (mic dabayein) ya mutaliqa screen istemal karein.",
    }),
    figures: [],
    rows: [],
    notes: [],
    empty: false,
    source: "database",
    generatedAt: new Date().toISOString(),
  };
}
