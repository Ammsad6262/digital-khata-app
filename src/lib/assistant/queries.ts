/**
 * Read-only business queries.
 *
 * Every number here comes from the same services the screens use. Nothing is
 * estimated and the AI is not involved.
 */

import { prisma } from "@/lib/db/prisma";
import { formatMoney, formatQuantity } from "@/lib/utils/money";
import { getDashboardStats } from "@/lib/services/dashboard";
import {
  getCustomerWithBalance,
  getCustomerHistory,
  listOutstandingCustomers,
  listAllCustomersWithBalance,
} from "@/lib/services/customers";
import { listProductsWithStock, getProductWithStock } from "@/lib/services/products";
import { listSuppliersWithBalance } from "@/lib/services/suppliers";
import { listSales } from "@/lib/services/sales";
import { getOverdueSummary } from "@/lib/services/sales";
import { listExpenses } from "@/lib/services/expenses";
import { listReminders } from "@/lib/services/reminders";
import { getReportForPreset } from "@/lib/services/reports";
import { getBusinessInsights } from "@/lib/services/insights";
import { getRecoveryData } from "@/lib/services/recovery";
import { getSettings } from "@/lib/services/settings";
import type { AnswerItem, QueryKind, RouteQuery } from "./types";

export type QueryResult = {
  text: string;
  items?: AnswerItem[];
  data?: unknown;
};

export type ResolvedEntity = {
  id: string;
  name: string;
  type: "customer" | "product" | "supplier";
};

export class NeedsEntityError extends Error {
  readonly entityType: ResolvedEntity["type"];
  constructor(entityType: ResolvedEntity["type"], message: string) {
    super(message);
    this.name = "NeedsEntityError";
    this.entityType = entityType;
  }
}

function n(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const x = typeof value === "number" ? value : Number(value as string);
  return Number.isFinite(x) ? x : 0;
}

export async function runQuery(
  userId: string,
  query: RouteQuery,
  entity: ResolvedEntity | null,
): Promise<QueryResult> {
  const settings = await getSettings(userId);
  const symbol = settings.currencySymbol || "Rs.";
  const tz = settings.timezone || "Asia/Karachi";
  const money = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, symbol);

  switch (query.query) {
    case "HELP":
      return {
        text: [
          "I can run the whole khata for you. Try:",
          "• “Ali bought 20 cartons of rice, paid 15,000”",
          "• “received 5,000 from Ali”",
          "• “paid the rice mill 10,000”",
          "• “spent 500 on electricity”",
          "• “add customer Imran”",
          "• “add 50 kg rice stock at 900”",
          "• “who owes me money?”",
          "• “how much stock of rice?”",
          "• “what were my best-selling products this month?”",
          "• “remind me to call Ali tomorrow”",
        ].join("\n"),
        data: { commands: true },
      };

    case "DASHBOARD": {
      const d = await getDashboardStats(userId, tz);
      return {
        text: [
          `Today: sales ${money(d.todaysSales)}, payments ${money(d.todaysPayments)}, expenses ${money(d.todaysExpenses)}.`,
          `Receivables ${money(d.totalReceivables)} from ${d.customersWithBalance} customer(s).`,
          d.lowStockProducts.length
            ? `${d.lowStockProducts.length} product(s) are low on stock.`
            : "No products are low on stock.",
        ].join(" "),
        data: d,
        items: [
          { label: "Receivables", value: money(d.totalReceivables), href: "/khata" },
          { label: "Today's sales", value: money(d.todaysSales), href: "/sales" },
          { label: "Today's expenses", value: money(d.todaysExpenses), href: "/expenses" },
          ...d.lowStockProducts.slice(0, 5).map((p) => ({
            label: `Low stock: ${p.name}`,
            value: formatQuantity(p.currentStock, p.unit),
            href: `/more/products/${p.id}`,
          })),
        ],
      };
    }

    case "RECEIVABLES": {
      const rows = await listOutstandingCustomers(userId);
      const total = rows.reduce((s, r) => s + n(r.balance), 0);
      return {
        text: rows.length
          ? `Customers owe you ${money(total)} in total. ${rows.length} customer(s) have an outstanding balance.`
          : "No customer owes you anything right now.",
        items: rows.slice(0, 12).map((r) => ({
          label: r.name,
          value: money(r.balance),
          href: `/khata/${r.id}`,
        })),
        data: { total: String(total), count: rows.length },
      };
    }

    case "PAYABLES": {
      const rows = (await listSuppliersWithBalance(userId)).filter((s) => n(s.balance) > 0);
      const total = rows.reduce((s, r) => s + n(r.balance), 0);
      return {
        text: rows.length
          ? `You owe suppliers ${money(total)}. ${rows.length} supplier(s) have a payable balance.`
          : "You do not owe any supplier right now.",
        items: rows.slice(0, 12).map((r) => ({
          label: r.name,
          value: money(r.balance),
          href: `/suppliers/${r.id}`,
        })),
        data: { total: String(total), count: rows.length },
      };
    }

    case "CUSTOMER_BALANCE": {
      if (!entity || entity.type !== "customer") {
        throw new NeedsEntityError("customer", "Which customer?");
      }
      const c = await getCustomerWithBalance(entity.id, userId);
      const balance = n(c.balance);
      const text =
        balance > 0
          ? `${c.name} owes you ${money(balance)}.`
          : balance < 0
            ? `${c.name} has an advance of ${money(Math.abs(balance))}.`
            : `${c.name}'s account is settled.`;
      return {
        text,
        items: [
          { label: c.name, value: money(balance), href: `/khata/${c.id}` },
          { label: "Total sales", value: money(c.totalPurchases) },
          { label: "Total payments", value: money(c.totalPayments) },
        ],
        data: c,
      };
    }

    case "CUSTOMER_HISTORY": {
      if (!entity || entity.type !== "customer") {
        throw new NeedsEntityError("customer", "Whose ledger?");
      }
      const h = await getCustomerHistory(entity.id, userId);
      const recent = h.transactions.slice(-8).reverse();
      return {
        text: `${h.customer.name}: balance ${money(h.customer.balance)} across ${h.transactions.length} transaction(s).`,
        items: recent.map((t) => ({
          label: `${t.type === "sale" ? "Sale" : t.type === "payment" ? "Payment" : "Adjustment"} · ${t.date.toISOString().slice(0, 10)}`,
          value: money(t.amount),
          meta: `balance after: ${money(t.runningBalance)}`,
          href: `/khata/${h.customer.id}`,
        })),
        data: h,
      };
    }

    case "STOCK_LEVEL": {
      if (!entity || entity.type !== "product") {
        throw new NeedsEntityError("product", "Which product?");
      }
      const p = await getProductWithStock(entity.id, userId);
      return {
        text: `${p.name}: ${formatQuantity(p.currentStock, p.unit)} in stock${p.isLowStock ? " (low)" : ""}. Selling price ${money(p.sellingPrice)} per ${p.unit}.`,
        items: [
          { label: p.name, value: formatQuantity(p.currentStock, p.unit), href: `/more/products/${p.id}` },
          { label: "Selling price", value: `${money(p.sellingPrice)} / ${p.unit}` },
          { label: "Purchase price", value: `${money(p.purchasePrice)} / ${p.unit}` },
        ],
        data: p,
      };
    }

    case "LOW_STOCK": {
      const products = (await listProductsWithStock(userId)).filter((p) => p.isLowStock);
      return {
        text: products.length
          ? `${products.length} product(s) are low on stock.`
          : "No products are below their low-stock threshold.",
        items: products.slice(0, 15).map((p) => ({
          label: p.name,
          value: formatQuantity(p.currentStock, p.unit),
          meta: `threshold ${p.lowStockThreshold}`,
          href: `/more/products/${p.id}`,
        })),
        data: products,
      };
    }

    case "TOP_PRODUCTS": {
      const insights = await getBusinessInsights(userId);
      return {
        text: insights.topProducts.length
          ? `Best-selling products in the last ${insights.rangeDays} days:`
          : "No sales in the last 30 days, so there is no best-seller yet.",
        items: insights.topProducts.slice(0, 10).map((p) => ({
          label: p.name,
          value: money(p.revenue),
          meta: `${formatQuantity(p.quantity, p.unit)} sold`,
          href: `/more/products/${p.id}`,
        })),
        data: insights.topProducts,
      };
    }

    case "TODAY_SALES":
    case "SALES_SUMMARY": {
      const preset = query.range === "month" || query.query === "SALES_SUMMARY" ? "month" : "today";
      const r = await getReportForPreset(userId, preset, tz);
      return {
        text: `${preset === "today" ? "Today" : "This month"}: billed ${money(r.sales.billed)} across ${r.sales.count} sale(s); cash received ${money(r.sales.cashReceived)}.`,
        items: [
          { label: "Billed", value: money(r.sales.billed) },
          { label: "Cash received", value: money(r.sales.cashReceived) },
          { label: "Discounts", value: money(r.sales.discounts) },
          ...r.sales.byCustomer.slice(0, 5).map((c) => ({ label: c.name, value: money(c.billed) })),
        ],
        data: r.sales,
      };
    }

    case "TODAY_EXPENSES":
    case "EXPENSES_SUMMARY": {
      const preset = query.range === "month" || query.query === "EXPENSES_SUMMARY" ? "month" : "today";
      const r = await getReportForPreset(userId, preset, tz);
      return {
        text: `${preset === "today" ? "Today" : "This month"}: expenses ${money(r.expenses.total)} across ${r.expenses.count} record(s).`,
        items: r.expenses.byCategory.slice(0, 8).map((c) => ({
          label: c.category,
          value: money(c.amount),
        })),
        data: r.expenses,
      };
    }

    case "PROFIT": {
      const preset = query.range === "all" ? "all" : query.range === "today" ? "today" : "month";
      const r = await getReportForPreset(userId, preset, tz);
      const p = r.profit;
      return {
        text: `${preset === "today" ? "Today" : preset === "all" ? "All time" : "This month"}: revenue ${money(p.revenue)}, cost of goods ${money(p.cogs)}, gross profit ${money(p.grossProfit)}, expenses ${money(p.expenses)}, net profit ${money(p.netProfit)} (${p.profitMargin}% margin).`,
        items: [
          { label: "Revenue", value: money(p.revenue) },
          { label: "Cost of goods sold", value: money(p.cogs) },
          { label: "Gross profit", value: money(p.grossProfit) },
          { label: "Expenses", value: money(p.expenses) },
          { label: "Net profit", value: money(p.netProfit) },
        ],
        data: p,
      };
    }

    case "RECENT_SALES": {
      const rows = await listSales(10, userId);
      return {
        text: rows.length ? "Most recent sales:" : "No sales recorded yet.",
        items: rows.map((s) => ({
          label: s.customerName,
          value: money(s.totalAmount),
          meta: `${s.date.toISOString().slice(0, 10)} · ${n(s.outstanding) > 0 ? `due ${money(s.outstanding)}` : "paid"}`,
          href: `/sales/${s.id}`,
        })),
        data: rows,
      };
    }

    case "RECENT_EXPENSES": {
      const rows = await listExpenses(10, userId);
      return {
        text: rows.length ? "Most recent expenses:" : "No expenses recorded yet.",
        items: rows.map((e) => ({
          label: e.name,
          value: money(e.amount),
          meta: `${e.date.toISOString().slice(0, 10)} · ${e.category}`,
          href: `/expenses/${e.id}`,
        })),
        data: rows,
      };
    }

    case "RECENT_PURCHASES": {
      const rows = await prisma.purchase.findMany({
        where: { userId, voidedAt: null },
        include: { supplier: true, items: true },
        orderBy: { date: "desc" },
        take: 10,
      });
      return {
        text: rows.length ? "Most recent purchases:" : "No purchases recorded yet.",
        items: rows.map((p) => ({
          label: p.supplier.name,
          value: money(p.totalAmount),
          meta: `${p.date.toISOString().slice(0, 10)} · due ${money(p.outstanding)}`,
          href: `/suppliers/${p.supplierId}`,
        })),
        data: rows,
      };
    }

    case "SUPPLIER_BALANCE": {
      if (!entity || entity.type !== "supplier") {
        throw new NeedsEntityError("supplier", "Which supplier?");
      }
      const row = (await listSuppliersWithBalance(userId)).find((s) => s.id === entity.id);
      if (!row) throw new NeedsEntityError("supplier", "Which supplier?");
      const balance = n(row.balance);
      return {
        text:
          balance > 0
            ? `You owe ${row.name} ${money(balance)}.`
            : balance < 0
              ? `${row.name} has an advance of ${money(Math.abs(balance))}.`
              : `${row.name}'s account is settled.`,
        items: [
          { label: row.name, value: money(balance), href: `/suppliers/${row.id}` },
          { label: "Total purchases", value: money(row.totalPurchases) },
          { label: "Total payments", value: money(row.totalPayments) },
        ],
        data: row,
      };
    }

    case "SUPPLIER_HISTORY": {
      if (!entity || entity.type !== "supplier") {
        throw new NeedsEntityError("supplier", "Which supplier?");
      }
      const rows = await prisma.purchase.findMany({
        where: { supplierId: entity.id, userId, voidedAt: null },
        include: { items: true },
        orderBy: { date: "desc" },
        take: 10,
      });
      return {
        text: rows.length
          ? `Recent purchases from ${entity.name}:`
          : `No purchases recorded from ${entity.name}.`,
        items: rows.map((p) => ({
          label: p.date.toISOString().slice(0, 10),
          value: money(p.totalAmount),
          meta: `due ${money(p.outstanding)}`,
          href: `/suppliers/${entity.id}`,
        })),
        data: rows,
      };
    }

    case "REMINDERS_TODAY": {
      const rows = await listReminders("today", userId, tz);
      return {
        text: rows.length ? `${rows.length} reminder(s) due today.` : "Nothing is due today.",
        items: rows.map((r) => ({
          label: r.title,
          value: r.dueAt.toISOString().slice(0, 10),
          meta: r.priority,
          href: "/reminders",
        })),
        data: rows,
      };
    }

    case "REMINDERS_ALL": {
      const rows = await listReminders("all", userId, tz);
      return {
        text: rows.length ? `${rows.length} open reminder(s).` : "No open reminders.",
        items: rows.slice(0, 15).map((r) => ({
          label: r.title,
          value: r.dueAt.toISOString().slice(0, 10),
          meta: r.priority,
          href: "/reminders",
        })),
        data: rows,
      };
    }

    case "INACTIVE_CUSTOMERS": {
      const insights = await getBusinessInsights(userId);
      return {
        text: insights.inactiveCustomers.length
          ? `${insights.inactiveCustomers.length} customer(s) have not purchased recently.`
          : "Every customer has purchased recently.",
        items: insights.inactiveCustomers.slice(0, 12).map((c) => ({
          label: c.name,
          value: c.balance ? money(c.balance) : undefined,
          meta: c.daysInactive == null ? "no purchases yet" : `${c.daysInactive} days inactive`,
          href: `/khata/${c.id}`,
        })),
        data: insights.inactiveCustomers,
      };
    }

    case "REORDER_CANDIDATES": {
      const recovery = await getRecoveryData(userId, "all");
      return {
        text: recovery.candidates.length
          ? `${recovery.candidates.length} customer(s) may be ready to order again.`
          : "No reorder candidates right now.",
        items: recovery.candidates.slice(0, 12).map((c) => ({
          label: c.customerName,
          value: money(c.outstanding),
          meta: c.oldestDueDate ? `oldest due ${c.oldestDueDate}` : undefined,
          href: `/khata/${c.customerId}`,
        })),
        data: recovery.candidates,
      };
    }

    case "OVERDUE_CUSTOMERS": {
      const summary = await getOverdueSummary(userId);
      return {
        text: n(summary.total) > 0
          ? `${summary.customersCount} customer(s) are past their due date, owing ${money(summary.total)} across ${summary.salesCount} sale(s).`
          : "No customer payment is overdue.",
        data: summary,
      };
    }

    case "CUSTOMER_LIST": {
      const rows = await listAllCustomersWithBalance(userId);
      return {
        text: `${rows.length} customer(s).`,
        items: rows.slice(0, 20).map((c) => ({
          label: c.name,
          value: money(c.balance),
          href: `/khata/${c.id}`,
        })),
        data: rows,
      };
    }

    case "PRODUCT_LIST": {
      const rows = await listProductsWithStock(userId);
      return {
        text: `${rows.length} product(s).`,
        items: rows.slice(0, 20).map((p) => ({
          label: p.name,
          value: formatQuantity(p.currentStock, p.unit),
          meta: `${money(p.sellingPrice)} / ${p.unit}`,
          href: `/more/products/${p.id}`,
        })),
        data: rows,
      };
    }

    case "SUPPLIER_LIST": {
      const rows = await listSuppliersWithBalance(userId);
      return {
        text: `${rows.length} supplier(s).`,
        items: rows.slice(0, 20).map((s) => ({
          label: s.name,
          value: money(s.balance),
          href: `/suppliers/${s.id}`,
        })),
        data: rows,
      };
    }

    default:
      return { text: "I do not have an answer for that yet." };
  }
}