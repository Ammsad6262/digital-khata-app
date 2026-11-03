/**
 * Lazily-loaded, per-request facts for the Khata Assistant.
 *
 * Every loader returns data owned by the authenticated user only — the userId
 * is threaded through to the same services the screens use, so the Khata
 * Assistant can never see another business's records.
 *
 * Loaders are memoized inside the store, so asking one question runs only the
 * queries that question actually needs, and asking two questions that share
 * data does not repeat the work.
 */

import { prisma } from "@/lib/db/prisma";
import { getSettings, type SettingView } from "@/lib/services/settings";
import {
  getReportForPreset,
  type ReportData,
  type ReportPreset,
} from "@/lib/services/reports";
import {
  getBusinessInsights,
  type BusinessInsights,
} from "@/lib/services/insights";
import {
  listOutstandingCustomers,
  listAllCustomersWithBalance,
  type OutstandingCustomer,
  type CustomerSearchResult,
} from "@/lib/services/customers";
import {
  listProductsWithStock,
  type ProductWithStock,
} from "@/lib/services/products";
import { getRecoveryData, type RecoveryResult } from "@/lib/services/recovery";
import { getProfitLossStats, type ProfitLossStats } from "@/lib/services/profit-loss";
import { toDecimalOrZero } from "@/lib/utils/decimal";

const RANGE_DAYS = 30;

export type ProductSalesRow = {
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  revenue: string;
};

export type CustomerRecencyRow = {
  customerId: string;
  name: string;
  balance: string;
  lastSaleAt: Date | null;
  daysInactive: number | null;
  /** True when there is not a single recorded sale for this customer. */
  neverPurchased: boolean;
};

export class KhataFacts {
  private readonly memo = new Map<string, Promise<unknown>>();

  constructor(
    readonly userId: string,
    readonly settings: SettingView,
  ) {}

  get symbol(): string {
    return this.settings.currencySymbol || "Rs.";
  }

  get timezone(): string {
    return this.settings.timezone || "Asia/Karachi";
  }

  private once<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = this.memo.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = loader();
    this.memo.set(key, promise);
    return promise;
  }

  report(preset: ReportPreset): Promise<ReportData> {
    return this.once(`report:${preset}`, () =>
      getReportForPreset(this.userId, preset, this.timezone),
    );
  }

  insights(): Promise<BusinessInsights> {
    return this.once("insights", () => getBusinessInsights(this.userId));
  }

  profitLoss(): Promise<ProfitLossStats> {
    return this.once("profitLoss", () =>
      getProfitLossStats(this.userId, this.timezone),
    );
  }

  outstanding(): Promise<OutstandingCustomer[]> {
    return this.once("outstanding", () =>
      listOutstandingCustomers(this.userId),
    );
  }

  products(): Promise<ProductWithStock[]> {
    return this.once("products", () =>
      listProductsWithStock(this.userId),
    );
  }

  recovery(filter: "all" | "overdue" | "due_soon" | "no_due_date" = "all"): Promise<RecoveryResult> {
    return this.once(`recovery:${filter}`, () =>
      getRecoveryData(this.userId, filter),
    );
  }

  /** Sales per product over the trailing 30 days (not sliced). */
  productSales(): Promise<ProductSalesRow[]> {
    return this.once("productSales", async () => {
      const rangeStart = new Date(Date.now() - RANGE_DAYS * 86_400_000);
      const [soldGroups, products] = await Promise.all([
        prisma.saleItem.groupBy({
          by: ["productId"],
          _sum: { quantity: true, total: true },
          where: {
            sale: { userId: this.userId, voidedAt: null, date: { gte: rangeStart } },
          },
        }),
        this.products(),
      ]);
      const productMap = new Map(products.map((p) => [p.id, p]));
      return soldGroups
        .map((g) => ({
          productId: g.productId,
          name: productMap.get(g.productId)?.name ?? "—",
          unit: productMap.get(g.productId)?.unit ?? "",
          quantity: toDecimalOrZero(g._sum.quantity).toString(),
          revenue: toDecimalOrZero(g._sum.total).toString(),
        }))
        .sort((a, b) => Number(b.revenue) - Number(a.revenue));
    });
  }

  /** When each customer last bought, across ALL customers (not only debtors). */
  customerRecency(): Promise<CustomerRecencyRow[]> {
    return this.once("customerRecency", async () => {
      const rangeStart = new Date(Date.now() - RANGE_DAYS * 86_400_000);
      const [customers, lastSales] = await Promise.all([
        listAllCustomersWithBalance(this.userId),
        prisma.sale.groupBy({
          by: ["customerId"],
          _max: { date: true },
          where: { userId: this.userId, voidedAt: null },
        }),
      ]);
      const lastByCustomer = new Map(
        lastSales.map((row) => [row.customerId, row._max.date ?? null]),
      );
      const now = Date.now();
      return customers.map((c: CustomerSearchResult) => {
        const lastSaleAt = lastByCustomer.get(c.id) ?? null;
        const daysInactive =
          lastSaleAt === null
            ? null
            : Math.max(0, Math.floor((now - lastSaleAt.getTime()) / 86_400_000));
        return {
          customerId: c.id,
          name: c.name,
          balance: c.balance,
          lastSaleAt,
          daysInactive,
          neverPurchased: lastSaleAt === null,
        };
      });
    });
  }

  /** Products with stock but no sale in the last 30 days, with their value. */
  deadStock(): Promise<Array<{ id: string; name: string; unit: string; currentStock: string; stockValue: string }>> {
    return this.once("deadStock", async () => {
      const rangeStart = new Date(Date.now() - RANGE_DAYS * 86_400_000);
      const [soldGroups, products] = await Promise.all([
        prisma.saleItem.groupBy({
          by: ["productId"],
          where: {
            sale: { userId: this.userId, voidedAt: null, date: { gte: rangeStart } },
          },
        }),
        this.products(),
      ]);
      const sold = new Set(soldGroups.map((g) => g.productId));
      return products
        .filter((p) => !sold.has(p.id) && toDecimalOrZero(p.currentStock).greaterThan(0))
        .map((p) => {
          const stock = toDecimalOrZero(p.currentStock);
          const value = stock.times(toDecimalOrZero(p.purchasePrice));
          return {
            id: p.id,
            name: p.name,
            unit: p.unit,
            currentStock: stock.toString(),
            stockValue: value.toString(),
          };
        })
        .sort((a, b) => Number(b.stockValue) - Number(a.stockValue));
    });
  }
}

export async function loadKhataFacts(userId: string): Promise<KhataFacts> {
  const settings = await getSettings(userId);
  return new KhataFacts(userId, settings);
}
