"use client";

import { useCallback, useState } from "react";
import {
  AlertCircle,
  Ban,
  CalendarClock,
  Check,
  Copy,
  Crown,
  KeyRound,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { useLanguage } from "@/providers/language-provider";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import type { Entitlement, LicenseKind } from "@/lib/services/entitlement";

type AdminCode = {
  id: string;
  kind: LicenseKind;
  label: string | null;
  durationDays: number;
  maxRedemptions: number;
  redemptionCount: number;
  active: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  redemptions: { userId: string; kind: string; redeemedAt: string }[];
};

type AdminCustomer = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  entitlement: Entitlement;
  history: HistoryEntry[];
};

type HistoryEntry = {
  id: string;
  kind: LicenseKind;
  durationDays: number;
  redeemedAt: string;
  previousAccessExpiresAt: string | null;
  newAccessExpiresAt: string;
};

type Summary = {
  totalCustomers: number;
  owners: number;
  affiliates: number;
  premium: number;
  trial: number;
  regular: number;
  unactivated: number;
  expiredPremium: number;
  upcomingExpirations: number;
  affiliateCodesTotal: number;
  affiliateCodesRemaining: number;
};

type Overview = {
  codes: AdminCode[];
  customers: AdminCustomer[];
  summary: Summary;
};

type GeneratedCode = {
  code: string;
  kind: LicenseKind;
  durationDays: number;
  label: string | null;
  expiresAt: string | null;
};

type Tab = "codes" | "customers" | "subscriptions";

type Translate = ReturnType<typeof useLanguage>["t"];

function kindLabel(kind: LicenseKind, t: Translate): string {
  switch (kind) {
    case "PRODUCT":
      return t("licensing.kindProduct");
    case "PREMIUM":
      return t("licensing.kindPremium");
    case "AFFILIATE":
      return t("licensing.kindAffiliate");
  }
}

function categoryText(entitlement: Entitlement, t: Translate): string {
  switch (entitlement.category) {
    case "OWNER":
      return t("licensing.owner");
    case "AFFILIATE":
      return t("licensing.affiliate");
    case "PREMIUM":
      return t("licensing.premium");
    case "TRIAL":
      return t("licensing.trial");
    case "REGULAR":
      return t("licensing.regular");
    default:
      return t("licensing.unactivated");
  }
}

const CATEGORY_CLASS: Record<Entitlement["category"], string> = {
  OWNER: "bg-amber-100 text-amber-800",
  AFFILIATE: "bg-purple-100 text-purple-800",
  PREMIUM: "bg-brand-100 text-brand-700",
  TRIAL: "bg-sky-100 text-sky-800",
  REGULAR: "bg-slate-100 text-slate-700",
  UNACTIVATED: "bg-red-50 text-red-700",
};

export default function AdminLicensingPage() {
  const { t, tParams } = useLanguage();
  const [adminSecret, setAdminSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("codes");

  const [kind, setKind] = useState<LicenseKind>("PRODUCT");
  const [count, setCount] = useState(1);
  const [label, setLabel] = useState("");
  const [generated, setGenerated] = useState<GeneratedCode[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(
    async (secret: string) => {
      const res = await fetch("/api/admin/licensing/customers", {
        headers: { "x-admin-secret": secret },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || t("licensing.loadFailed"));
      }
      setOverview(json.data as Overview);
    },
    [t],
  );

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adminSecret.trim()) return;
    setLoading(true);
    setAuthError(null);
    try {
      await load(adminSecret);
      setAuthenticated(true);
    } catch {
      setAuthError(t("admin.invalidSecret"));
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    try {
      setError(null);
      await load(adminSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("licensing.failed"));
    }
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/licensing/codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ kind, count, label: label.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || t("licensing.failed"));
      }
      setGenerated(json.data as GeneratedCode[]);
      setLabel("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("licensing.failed"));
    } finally {
      setLoading(false);
    }
  };

  const revokeCode = async (codeId: string) => {
    setError(null);
    try {
      const res = await fetch("/api/admin/licensing/codes", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ codeId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || t("licensing.failed"));
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("licensing.failed"));
    }
  };

  const act = async (body: Record<string, unknown>) => {
    setError(null);
    try {
      const res = await fetch("/api/admin/licensing/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || t("licensing.failed"));
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("licensing.failed"));
    }
  };

  const copy = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopied(code);
    window.setTimeout(() => setCopied(null), 2000);
  };

  const lock = () => {
    setAuthenticated(false);
    setAdminSecret("");
    setOverview(null);
    setGenerated([]);
    setError(null);
    setAuthError(null);
  };

  if (!authenticated) {
    return (
      <ScreenContent>
        <div className="mx-auto max-w-md space-y-4 py-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <ShieldCheck className="h-8 w-8 text-slate-500" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              {t("licensing.adminTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("licensing.adminSubtitle")}
            </p>
          </div>
          <form onSubmit={login} className="space-y-3">
            <input
              type="password"
              value={adminSecret}
              onChange={(event) => setAdminSecret(event.target.value)}
              placeholder={t("admin.secretPlaceholder")}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              autoComplete="off"
              disabled={loading}
              aria-label={t("admin.secretPlaceholder")}
            />
            {authError ? (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <p className="text-sm text-red-800">{authError}</p>
              </div>
            ) : null}
            <button
              type="submit"
              disabled={!adminSecret.trim() || loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <KeyRound className="h-5 w-5" />
              )}
              {t("admin.authenticate")}
            </button>
          </form>
        </div>
      </ScreenContent>
    );
  }

  const summary = overview?.summary;
  const codes = overview?.codes ?? [];
  const customers = overview?.customers ?? [];
  const nameById = new Map(customers.map((c) => [c.id, c.name]));

  return (
    <ScreenContent>
      <div className="mx-auto max-w-3xl space-y-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {t("licensing.adminTitle")}
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {t("licensing.adminSubtitle")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
              aria-label={t("licensing.refresh")}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={lock}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("admin.lock")}
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        ) : null}

        {summary ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat
              label={t("licensing.ownersLabel")}
              value={`${summary.owners}/2`}
            />
            <Stat
              label={t("licensing.affiliatesLabel")}
              value={String(summary.affiliates)}
            />
            <Stat
              label={t("licensing.premiumStatLabel")}
              value={String(summary.premium)}
            />
            <Stat
              label={t("licensing.trialStatLabel")}
              value={String(summary.trial)}
            />
            <Stat
              label={t("licensing.affiliateCodes")}
              value={`${summary.affiliateCodesRemaining} ${t("licensing.remaining")}`}
            />
          </div>
        ) : null}

        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {(
            [
              ["codes", t("licensing.codesTab"), Ticket],
              ["customers", t("licensing.customersTab"), Users],
              ["subscriptions", t("licensing.subscriptionsTab"), CalendarClock],
            ] as const
          ).map(([value, text, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors",
                tab === value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {text}
            </button>
          ))}
        </div>

        {tab === "codes" ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                {t("licensing.generate")}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    {t("licensing.kind")}
                  </label>
                  <select
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as LicenseKind)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                  >
                    <option value="PRODUCT">{t("licensing.kindProduct")}</option>
                    <option value="PREMIUM">{t("licensing.kindPremium")}</option>
                    <option value="AFFILIATE">{t("licensing.kindAffiliate")}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    {t("licensing.count")}
                  </label>
                  <select
                    value={count}
                    onChange={(event) => setCount(Number(event.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                  >
                    {[1, 5, 10, 25].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-2">
                <label className="mb-1 block text-xs text-slate-500">
                  {t("licensing.label")}
                </label>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={80}
                  placeholder={t("licensing.placeholderLabel")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={loading}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t("licensing.generate")}
              </button>
              {kind === "AFFILIATE" && summary ? (
                <p className="mt-2 text-xs text-slate-500">
                  {tParams("licensing.affiliateRemainingText", {
                    remaining: summary.affiliateCodesRemaining,
                    max: 10,
                  })}
                </p>
              ) : null}
            </div>

            {generated.length > 0 ? (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
                <h2 className="mb-2 text-sm font-semibold text-brand-900">
                  {t("licensing.generated")}
                </h2>
                <p className="mb-2 text-xs text-brand-800">
                  {t("licensing.copyNowWarning")}
                </p>
                <div className="space-y-2">
                  {generated.map((entry) => (
                    <div
                      key={entry.code}
                      className="flex items-center gap-2 rounded-lg bg-white p-2.5"
                    >
                      <code className="flex-1 font-mono text-sm font-bold text-slate-900">
                        {entry.code}
                      </code>
                      <span className="text-xs text-slate-500">
                        {kindLabel(entry.kind, t)}
                      </span>
                      <button
                        type="button"
                        onClick={() => copy(entry.code)}
                        aria-label={t("licensing.copy")}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        {copied === entry.code ? (
                          <Check className="h-4 w-4 text-brand-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                {t("licensing.codesTab")}
              </h2>
              {codes.length === 0 ? (
                <p className="text-sm text-slate-400">{t("licensing.noCodes")}</p>
              ) : (
                <div className="space-y-2">
                  {codes.map((code) => (
                    <div
                      key={code.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-slate-900">
                            {kindLabel(code.kind, t)}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                              !code.active
                                ? "bg-slate-100 text-slate-500"
                                : code.redemptionCount > 0
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-brand-100 text-brand-700",
                            )}
                          >
                            {!code.active
                              ? t("licensing.statusRevoked")
                              : code.redemptionCount > 0
                                ? t("licensing.statusUsed")
                                : t("licensing.statusUnused")}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {code.label ? `${code.label} · ` : ""}
                          {tParams("licensing.usedSlashMax", {
                            used: code.redemptionCount,
                            max: code.maxRedemptions,
                          })}{" "}
                          · {formatDate(new Date(code.createdAt))}
                        </p>
                        {code.expiresAt ? (
                          <p className="text-xs text-slate-500">
                            {t("licensing.expiresOn")}{" "}
                            {formatDate(new Date(code.expiresAt))}
                          </p>
                        ) : null}
                        {code.redemptions.length > 0 ? (
                          <p className="mt-0.5 text-xs text-slate-400">
                            {code.redemptions.map((r, i) => (
                              <span key={`${r.userId}-${i}`}>
                                {i > 0 ? ", " : ""}
                                {tParams("licensing.redeemedBy", {
                                  name:
                                    nameById.get(r.userId) ??
                                    `…${r.userId.slice(-6)}`,
                                })}
                                {" · "}
                                {formatDate(new Date(r.redeemedAt))}
                              </span>
                            ))}
                          </p>
                        ) : null}
                      </div>
                      {code.active && code.redemptionCount === 0 ? (
                        <button
                          type="button"
                          onClick={() => void revokeCode(code.id)}
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                          aria-label={t("licensing.revoke")}
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}

        {tab === "customers" ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              {t("licensing.customersTab")}
            </h2>
            {customers.length === 0 ? (
              <p className="text-sm text-slate-400">
                {t("licensing.noCustomers")}
              </p>
            ) : (
              <div className="space-y-3">
                {customers.map((customer) => (
                  <CustomerRow
                    key={customer.id}
                    customer={customer}
                    onAction={act}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "subscriptions" ? (
          <SubscriptionsTab customers={customers} summary={summary} t={t} />
        ) : null}
      </div>
    </ScreenContent>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function CustomerRow({
  customer,
  onAction,
  t,
}: {
  customer: AdminCustomer;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  const e = customer.entitlement;
  const { tParams } = useLanguage();
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-slate-900">
              {customer.name}
            </span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                CATEGORY_CLASS[e.category],
              )}
            >
              {categoryText(e, t)}
            </span>
          </div>
          <p className="truncate text-xs text-slate-500">{customer.email}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {t("licensing.coreLabel")}:{" "}
            {e.core.trial
              ? e.core.active && e.core.expiresAt
                ? tParams("licensing.trialUntil", {
                    date: formatDate(new Date(e.core.expiresAt)),
                  })
                : t("licensing.trialEnded")
              : e.core.active
                ? t("licensing.permanent")
                : t("licensing.inactive")}{" "}
            · {t("licensing.premiumLabel")}:{" "}
            {e.premium.active
              ? e.premium.permanent
                ? t("licensing.permanent")
                : tParams("licensing.daysLeft", {
                    days: e.premium.remainingDays ?? 0,
                  })
              : t("licensing.inactive")}
          </p>
          {e.premium.active &&
          !e.premium.permanent &&
          e.premium.expiresAt ? (
            <p className="text-xs text-slate-500">
              {t("licensing.expiresOn")}{" "}
              {formatDate(new Date(e.premium.expiresAt))}
            </p>
          ) : null}
          {e.accessRevoked ? (
            <p className="mt-0.5 text-xs font-medium text-red-700">
              {t("licensing.revoked")}
              {e.accessRevokedReason ? `: ${e.accessRevokedReason}` : ""}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {e.isOwner ? (
          <ActionButton
            icon={<Crown className="h-3.5 w-3.5" />}
            label={t("licensing.revokeOwner")}
            tone="danger"
            onClick={() => {
              if (window.confirm(t("licensing.confirmRemoveOwner"))) {
                void onAction({
                  action: "revokeOwner",
                  userId: customer.id,
                  confirm: true,
                });
              }
            }}
          />
        ) : (
          <ActionButton
            icon={<Crown className="h-3.5 w-3.5" />}
            label={t("licensing.grantOwner")}
            onClick={() =>
              void onAction({ action: "grantOwner", userId: customer.id })
            }
          />
        )}
        {e.isAffiliate ? (
          <ActionButton
            icon={<Ban className="h-3.5 w-3.5" />}
            label={t("licensing.revokeAffiliate")}
            tone="danger"
            onClick={() => {
              if (window.confirm(t("licensing.confirmRemoveAffiliate"))) {
                void onAction({
                  action: "revokeAffiliate",
                  userId: customer.id,
                  confirm: true,
                });
              }
            }}
          />
        ) : null}
        {e.premium.active && !e.premium.permanent ? (
          <ActionButton
            icon={<Ban className="h-3.5 w-3.5" />}
            label={t("licensing.revokePremium")}
            tone="danger"
            onClick={() =>
              void onAction({
                action: "revokePremium",
                userId: customer.id,
              })
            }
          />
        ) : null}
        {e.core.active && !e.isOwner && !e.isAffiliate ? (
          <ActionButton
            icon={<Ban className="h-3.5 w-3.5" />}
            label={t("licensing.revokeCore")}
            tone="danger"
            onClick={() => {
              if (window.confirm(t("licensing.confirmRevokeCore"))) {
                void onAction({
                  action: "revokeCore",
                  userId: customer.id,
                  confirm: true,
                });
              }
            }}
          />
        ) : null}
        {e.accessRevoked ? (
          <ActionButton
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            label={t("licensing.restoreAccess")}
            onClick={() =>
              void onAction({
                action: "restoreAccess",
                userId: customer.id,
              })
            }
          />
        ) : (
          <ActionButton
            icon={<Ban className="h-3.5 w-3.5" />}
            label={t("licensing.revokeAccess")}
            tone="danger"
            onClick={() => {
              const reason = window.prompt(t("licensing.promptRevokeReason"));
              if (reason === null) return;
              void onAction({
                action: "revokeAccess",
                userId: customer.id,
                reason,
              });
            }}
          />
        )}
      </div>
      {customer.history.length > 0 ? (
        <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t("licensing.history")}
          </p>
          <div className="space-y-1">
            {customer.history.slice(0, 6).map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-slate-600">
                  {kindLabel(h.kind, t)}
                  {h.kind === "PREMIUM"
                    ? ` · ${tParams("licensing.renewalUntil", {
                        date: formatDate(new Date(h.newAccessExpiresAt)),
                      })}`
                    : ""}
                </span>
                <span className="shrink-0 text-slate-400">
                  {formatDate(new Date(h.redeemedAt))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold",
        tone === "danger"
          ? "border-red-200 text-red-700 hover:bg-red-50"
          : "border-slate-200 text-slate-700 hover:bg-slate-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SubscriptionsTab({
  customers,
  summary,
  t,
}: {
  customers: AdminCustomer[];
  summary: Summary | undefined;
  t: Translate;
}) {
  const { tParams } = useLanguage();
  const premium = customers.filter(
    (c) => c.entitlement.premium.active && !c.entitlement.premium.permanent,
  );
  const expired = customers.filter(
    (c) =>
      c.entitlement.core.active &&
      !c.entitlement.premium.active &&
      c.entitlement.premium.expiresAt,
  );
  const recent = customers
    .flatMap((c) => c.history.map((h) => ({ ...h, name: c.name })))
    .sort(
      (a, b) =>
        new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime(),
    )
    .slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label={t("licensing.activePremium")}
          value={String(premium.length)}
        />
        <Stat
          label={t("licensing.expiredPremium")}
          value={String(expired.length)}
        />
        <Stat
          label={t("licensing.expiringSoon")}
          value={String(summary?.upcomingExpirations ?? 0)}
        />
        <Stat
          label={t("licensing.unactivated")}
          value={String(summary?.unactivated ?? 0)}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          {t("licensing.activePremiumSubscriptions")}
        </h2>
        {premium.length === 0 ? (
          <p className="text-sm text-slate-400">{t("licensing.none")}</p>
        ) : (
          <div className="space-y-2">
            {premium.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {c.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">{c.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-900">
                    {tParams("licensing.days", {
                      days: c.entitlement.premium.remainingDays ?? 0,
                    })}
                  </p>
                  {c.entitlement.premium.expiresAt ? (
                    <p className="text-[11px] text-slate-500">
                      {formatDate(new Date(c.entitlement.premium.expiresAt))}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          {t("licensing.expiredCoreRetained")}
        </h2>
        {expired.length === 0 ? (
          <p className="text-sm text-slate-400">{t("licensing.none")}</p>
        ) : (
          <div className="space-y-2">
            {expired.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {c.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">{c.email}</p>
                </div>
                <p className="text-[11px] text-slate-500">
                  {t("licensing.expiredShort")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          {t("licensing.recentActivity")}
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">{t("licensing.noActivity")}</p>
        ) : (
          <div className="space-y-2">
            {recent.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {h.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {kindLabel(h.kind, t)}
                    {h.kind === "PREMIUM"
                      ? ` · ${tParams("licensing.renewalUntil", {
                          date: formatDate(new Date(h.newAccessExpiresAt)),
                        })}`
                      : ""}
                  </p>
                </div>
                <p className="shrink-0 text-[11px] text-slate-500">
                  {formatDate(new Date(h.redeemedAt))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}