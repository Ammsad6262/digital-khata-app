"use client";

/**
 * /preview — a live style guide for the Dukhata design system.
 *
 * It renders the real presentational components with mock data so the visual
 * language can be reviewed (and screenshotted) without a database. It is a
 * developer tool, not a product surface.
 */

import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { HeroCard } from "@/components/dashboard/HeroCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { LowStockList } from "@/components/dashboard/LowStockList";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { TextArea } from "@/components/ui/TextArea";
import { BalanceBadge } from "@/components/khata/BalanceBadge";
import { CustomerRow } from "@/components/khata/CustomerRow";
import { useTheme, THEMES, type Theme } from "@/providers/theme-provider";
import { ShoppingCart, Wallet, Receipt, Users, Package, TrendingUp } from "lucide-react";
import type { RecentTransaction } from "@/lib/services/dashboard";
import type { LowStockProduct } from "@/lib/services/dashboard";
import type { CustomerSearchResult } from "@/lib/services/customers";
import { ChartFrame, LegendDot } from "@/components/charts/ChartFrame";
import { BarList } from "@/components/charts/BarList";
import { WaterfallChart, type WaterfallStep } from "@/components/charts/WaterfallChart";
import { DumbbellChart, type DumbbellRow } from "@/components/charts/DumbbellChart";

const MOCK_TX = [
  { id: "t1", type: "sale", amount: "12500", date: new Date().toISOString(), customerName: "Ahmed Traders" },
  { id: "t2", type: "payment", amount: "8000", date: new Date(Date.now() - 3600e3).toISOString(), customerName: "Bilal Store" },
  { id: "t3", type: "expense", amount: "1250", date: new Date(Date.now() - 7200e3).toISOString(), notes: "Shop electricity" },
  { id: "t4", type: "stock_move", amount: "40", date: new Date(Date.now() - 86400e3).toISOString(), productName: "Basmati Rice 5kg" },
] as unknown as RecentTransaction[];

const MOCK_LOW = [
  { id: "p1", name: "Sugar 1kg", currentStock: "3", unit: "bag", lowStockThreshold: "10" },
  { id: "p2", name: "Cooking Oil 1L", currentStock: "1", unit: "bottle", lowStockThreshold: "6" },
] as unknown as LowStockProduct[];

const MOCK_CUSTOMERS = [
  { id: "c1", name: "Ahmed Traders", phone: "0300 1234567", companyName: "Ahmed & Sons", balance: "12500" },
  { id: "c2", name: "Bilal Store", phone: "0321 7654321", balance: "-3000" },
  { id: "c3", name: "Sana Boutique", phone: "0333 1112223", balance: "0" },
] as unknown as CustomerSearchResult[];

const MOCK_WATERFALL: WaterfallStep[] = [
  { key: "revenue", label: "Sales billed", shortLabel: "Sales", display: "Rs.400k", start: 0, end: 400000, kind: "total" },
  { key: "cogs", label: "Cost of goods", shortLabel: "Cost", display: "Rs.120k", start: 400000, end: 280000, kind: "minus" },
  { key: "gross", label: "Gross profit", shortLabel: "Gross", display: "Rs.280k", start: 0, end: 280000, kind: "subtotal" },
  { key: "expenses", label: "Expenses", shortLabel: "Expenses", display: "Rs.0", start: 280000, end: 280000, kind: "minus" },
  { key: "net", label: "Net estimate", shortLabel: "Net", display: "Rs.280k", start: 0, end: 280000, kind: "net" },
];

const MOCK_DUMBBELL: DumbbellRow[] = [
  { key: "sales", label: "Sales billed", current: 120000, previous: 98000, currentDisplay: "Rs.120k", previousDisplay: "Rs.98k" },
  { key: "cash", label: "Cash received", current: 104000, previous: 91000, currentDisplay: "Rs.104k", previousDisplay: "Rs.91k" },
  { key: "purchases", label: "Purchases", current: 72000, previous: 64000, currentDisplay: "Rs.72k", previousDisplay: "Rs.64k" },
  { key: "expenses", label: "Expenses", current: 18000, previous: 22000, currentDisplay: "Rs.18k", previousDisplay: "Rs.22k" },
  { key: "net", label: "Net estimate", current: 24000, previous: -6000, currentDisplay: "Rs.24k", previousDisplay: "−Rs.6k" },
];

const MOCK_BARS = [
  { key: "rent", label: "Rent", value: 40000, display: "Rs.40k" },
  { key: "salary", label: "Salary", value: 30000, display: "Rs.30k" },
  { key: "transport", label: "Transport", value: 18000, display: "Rs.18k" },
  { key: "packaging", label: "Packaging", value: 9000, display: "Rs.9k" },
  { key: "other", label: "Other", value: 4000, display: "Rs.4k" },
];

const THEME_LABELS: Record<Theme, string> = {
  ink: "Ink",
  emerald: "Emerald",
  saffron: "Saffron",
  indigo: "Indigo",
  rose: "Rose",
};

const THEME_DOTS: Record<Theme, string> = {
  ink: "#1C1917",
  emerald: "#059669",
  saffron: "#B45309",
  indigo: "#4F46E5",
  rose: "#E11D48",
};

export default function PreviewPage() {
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState("");

  return (
    <>
      <AppHeader title="Design preview" />
      <ScreenContent>
        <div className="space-y-5">
          {/* Theme switcher */}
          <section className="rounded-card border border-line bg-surface shadow-card p-3 shadow-card">
            <p className="eyebrow mb-2">Themes</p>
            <div className="flex flex-wrap gap-1.5">
              {THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    theme === t
                      ? "bg-ink text-surface"
                      : "bg-surface-2 text-ink-muted hover:bg-surface-3"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: THEME_DOTS[t] }}
                  />
                  {THEME_LABELS[t]}
                </button>
              ))}
            </div>
          </section>

          <HeroCard totalReceivables="48250" customersWithBalance={6} />
          <QuickActions />

          <section className="space-y-2">
            <h2 className="section-title px-1">Today</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Today's sales" value="Rs. 12,500" icon={ShoppingCart} tone="green" />
              <StatCard label="Payments" value="Rs. 8,000" icon={Wallet} tone="blue" />
              <StatCard label="Expenses" value="Rs. 1,250" icon={Receipt} tone="amber" />
              <StatCard label="Customers" value="42" icon={Users} tone="slate" />
            </div>
          </section>

          <RecentTransactions transactions={MOCK_TX} />
          <LowStockList products={MOCK_LOW} />

          <section className="space-y-2">
            <h2 className="section-title px-1">Buttons</h2>
            <div className="flex flex-wrap gap-2 rounded-card border border-line bg-surface shadow-card p-3 shadow-card">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="section-title px-1">Form fields</h2>
            <div className="space-y-3 rounded-card border border-line bg-surface shadow-card p-4 shadow-card">
              <TextField
                label="Customer name"
                placeholder="e.g. Ahmed Traders"
                value={name}
                onChange={(e) => setName(e.target.value)}
                hint="Shown on every statement"
              />
              <TextArea label="Note" placeholder="Optional note…" />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="section-title px-1">Balances</h2>
            <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface shadow-card p-3 shadow-card">
              <BalanceBadge balance="12500" />
              <BalanceBadge balance="-3000" />
              <BalanceBadge balance="0" />
              <BalanceBadge balance="12500" size="md" />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="section-title px-1">Customer rows</h2>
            <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
              {MOCK_CUSTOMERS.map((c, i) => (
                <div key={c.id} className={i > 0 ? "border-t border-line" : ""}>
                  <CustomerRow customer={c} />
                </div>
              ))}
            </div>
          </section>

          <EmptyState
            title="No customers yet"
            description="Add your first customer to start keeping their khata."
            icon={<Users className="h-6 w-6" />}
            action={<Button size="sm">Add customer</Button>}
          />

          <section className="space-y-2">
            <h2 className="section-title px-1">Charts</h2>
            <ChartFrame
              title="How profit is built"
              hint="Sales minus cost and expenses."
              legend={
                <>
                  <LegendDot colorVar="--brand-700" label="Sales" />
                  <LegendDot colorVar="--danger" label="Cost" />
                  <LegendDot colorVar="--brand-400" label="Gross" />
                  <LegendDot colorVar="--success" label="Net" />
                </>
              }
            >
              <WaterfallChart steps={MOCK_WATERFALL} symbol="Rs." caption="How profit is built" />
            </ChartFrame>
            <ChartFrame
              title="This period vs previous"
              hint="Same-length period immediately before."
              legend={
                <>
                  <LegendDot colorVar="--brand-600" label="This period" />
                  <LegendDot colorVar="--ink-faint" label="Previous" hollow />
                </>
              }
            >
              <DumbbellChart
                rows={MOCK_DUMBBELL}
                previousLabel="Previous"
                currentLabel="This period"
                caption="This period vs previous"
              />
            </ChartFrame>
            <ChartFrame title="Expenses by category" hint="Ranked, largest first.">
              <BarList items={MOCK_BARS} />
            </ChartFrame>
          </section>

          <section className="space-y-2">
            <h2 className="section-title px-1">Icons</h2>
            <div className="flex flex-wrap gap-2 rounded-card border border-line bg-surface shadow-card p-3 shadow-card">
              {[ShoppingCart, Wallet, Receipt, Users, Package, TrendingUp].map((Icon, i) => (
                <span
                  key={i}
                  className="flex h-9 w-9 items-center justify-center rounded-[0.7rem] bg-surface-2 text-ink-muted"
                >
                  <Icon className="h-4 w-4" />
                </span>
              ))}
            </div>
          </section>
        </div>
      </ScreenContent>
    </>
  );
}