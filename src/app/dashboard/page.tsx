/**
 * Dashboard page.
 *
 * Phase 3 ships a placeholder that verifies the API foundation is wired up.
 * Real dashboard UI comes in a later phase.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

type DashboardStats = {
  totalReceivables: string;
  todaysSales: string;
  todaysPayments: string;
  todaysExpenses: string;
  customerCount: number;
  lowStockProductCount: number;
  recentTransactions: Array<{
    id: string;
    type: string;
    amount: string;
    direction: string;
    date: string;
    customerId: string | null;
    productId: string | null;
  }>;
};

// Server Component — fetches initial dashboard data on the server.
async function getInitialStats(): Promise<DashboardStats | null> {
  try {
    const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/dashboard`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.ok ? (json.data as DashboardStats) : null;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const stats = await getInitialStats();

  return (
    <>
      <AppHeader title="Digital Khata" />
      <ScreenContent>
        <div className="space-y-4">
          <div className="rounded-xl bg-brand-600 p-4 text-white">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-100">
              Total Receivables
            </p>
            <p className="mt-1 text-3xl font-bold">
              {formatMoney(stats?.totalReceivables ?? "0")}
            </p>
            <p className="mt-1 text-xs text-brand-100">
              from {stats?.customerCount ?? 0} customers
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatBox label="Today's Sales" value={formatMoney(stats?.todaysSales ?? "0")} />
            <StatBox label="Today's Payments" value={formatMoney(stats?.todaysPayments ?? "0")} />
            <StatBox label="Today's Expenses" value={formatMoney(stats?.todaysExpenses ?? "0")} />
            <StatBox label="Low Stock Items" value={String(stats?.lowStockProductCount ?? 0)} />
          </div>

          <div className="space-y-2 pt-2">
            <h2 className="text-sm font-semibold text-slate-700">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg">+ New Sale</Button>
              <Button size="lg" variant="outline">+ Payment</Button>
              <Button size="lg" variant="outline">+ Customer</Button>
              <Button size="lg" variant="outline">+ Expense</Button>
            </div>
          </div>

          <div className="space-y-2 pt-4">
            <h2 className="text-sm font-semibold text-slate-700">Recent Transactions</h2>
            {stats?.recentTransactions && stats.recentTransactions.length > 0 ? (
              <ul className="space-y-1">
                {stats.recentTransactions.map((tx) => (
                  <li key={tx.id} className="card py-2 text-sm">
                    <span className="font-medium">{tx.type}</span>
                    <span className="float-right text-slate-600">
                      {formatMoney(tx.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                No transactions yet. The foundation is ready — UI coming next.
              </p>
            )}
          </div>

          <div className="space-y-2 pt-4">
            <p className="text-xs text-slate-400">
              Phase 3 — Foundation ready. Database, services, and API all wired up.
              Real UI comes in Phase 4.
            </p>
          </div>
        </div>
      </ScreenContent>
    </>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
