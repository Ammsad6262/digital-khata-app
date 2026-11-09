"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Ban,
  Check,
  Copy,
  KeyRound,
  Loader2,
  LogOut,
  Plus,
} from "lucide-react";
import { PasswordResetCard } from "@/components/admin/PasswordResetCard";
import { ScreenContent } from "@/components/layout/Screen";
import { useLanguage } from "@/providers/language-provider";

type GeneratedCode = {
  code: string;
  durationDays: number;
};

type AdminCode = {
  id: string;
  durationDays: number;
  maxRedemptions: number;
  redemptionCount: number;
  active: boolean;
};

export default function AdminCodesPage() {
  const { t } = useLanguage();
  const [adminSecret, setAdminSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [maxRedemptions, setMaxRedemptions] = useState(1);
  const [count, setCount] = useState(1);
  const [generated, setGenerated] = useState<GeneratedCode[]>([]);
  const [codes, setCodes] = useState<AdminCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adminSecret.trim()) return;
    setLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/admin/codes", {
        headers: { "x-admin-secret": adminSecret },
      });
      if (res.ok) {
        setAuthenticated(true);
        await fetchCodes();
      } else {
        setAuthError(t("admin.invalidSecret"));
      }
    } catch {
      setAuthError(t("admin.failedConnect"));
    } finally {
      setLoading(false);
    }
  };

  const fetchCodes = async () => {
    try {
      const res = await fetch("/api/admin/codes", {
        headers: { "x-admin-secret": adminSecret },
      });
      const json = await res.json();
      if (json.ok) setCodes(json.data);
    } catch {
      // The page already shows errors for the actions that matter.
    }
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        // Licensing rule: a premium code is always a 30-day period. The
        // duration is fixed server-side too; sending it here is for clarity.
        body: JSON.stringify({ durationDays: 30, maxRedemptions, count }),
      });
      const json = await res.json();
      if (json.ok) {
        setGenerated(json.data);
        await fetchCodes();
      } else {
        setError(json.error?.message || t("admin.failed"));
      }
    } catch {
      setError(t("admin.failedConnect"));
    } finally {
      setLoading(false);
    }
  };

  const toggleCode = async (codeId: string, active: boolean) => {
    try {
      await fetch("/api/admin/codes", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ codeId, active }),
      });
      await fetchCodes();
    } catch {
      // Keep the current list; the next refresh will reconcile it.
    }
  };

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const lockAdmin = () => {
    setAuthenticated(false);
    setAdminSecret("");
    setGenerated([]);
    setCodes([]);
    setError(null);
    setAuthError(null);
  };

  if (!authenticated) {
    return (
      <ScreenContent>
        <div className="mx-auto max-w-md space-y-4 py-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2">
              <KeyRound className="h-8 w-8 text-ink-subtle" />
            </div>
            <h2 className="text-base font-semibold text-ink">{t("admin.title")}</h2>
            <p className="mt-1 text-sm text-ink-subtle">{t("admin.subtitle")}</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              value={adminSecret}
              onChange={(event) => setAdminSecret(event.target.value)}
              placeholder={t("admin.secretPlaceholder")}
              className="w-full rounded-card border border-line-strong bg-surface px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              autoComplete="off"
              disabled={loading}
              aria-label={t("admin.secretPlaceholder")}
            />
            {authError ? (
              <div className="flex items-center gap-2 rounded-lg bg-danger-soft p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-danger-ink" />
                <p className="text-sm text-danger-ink">{authError}</p>
              </div>
            ) : null}
            <button
              type="submit"
              disabled={!adminSecret.trim() || loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-card disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
              {t("admin.authenticate")}
            </button>
          </form>
        </div>
      </ScreenContent>
    );
  }

  return (
    <ScreenContent>
      <div className="mx-auto max-w-2xl space-y-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-ink">{t("admin.title")}</h1>
            <p className="mt-0.5 text-xs text-ink-subtle">{t("admin.subtitle")}</p>
          </div>
<div className="flex shrink-0 items-center gap-2">
            <Link
              href="/admin/licensing"
              className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
            >
              {t("licensing.adminTitle")}
            </Link>
            <button
              type="button"
              onClick={lockAdmin}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:bg-app"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("admin.lock")}
            </button>
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface shadow-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            {t("admin.generateNew")}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <div>
<span className="mb-1 block text-xs text-ink-subtle">
                {t("admin.duration")}
              </span>
              <div className="rounded-lg border border-line bg-app px-2 py-2 text-sm text-ink-muted">
                {t("admin.premium30")}
              </div>
            </div>
            <div>
              <label
                htmlFor="admin-max-uses"
                className="mb-1 block text-xs text-ink-subtle"
              >
                {t("admin.maxUses")}
              </label>
              <select
                id="admin-max-uses"
                value={maxRedemptions}
                onChange={(event) => setMaxRedemptions(Number(event.target.value))}
                className="w-full rounded-lg border border-line-strong bg-surface px-2 py-2 text-sm"
              >
                <option value={1}>1</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={100}>100</option>
                <option value={0}>{t("admin.unlimited")}</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="admin-count"
                className="mb-1 block text-xs text-ink-subtle"
              >
                {t("admin.count")}
              </label>
              <select
                id="admin-count"
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="w-full rounded-lg border border-line-strong bg-surface px-2 py-2 text-sm"
              >
                <option value={1}>1</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("admin.generate")}
          </button>
          {error ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-danger-soft p-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-danger-ink" />
              <p className="text-xs text-danger-ink">{error}</p>
            </div>
          ) : null}
        </div>

        {generated.length > 0 ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
            <h2 className="mb-2 text-sm font-semibold text-brand-900">
              {t("admin.generatedCodes")}
            </h2>
            <div className="space-y-2">
              {generated.map((code) => (
                <div
                  key={code.code}
                  className="flex items-center gap-2 rounded-lg bg-surface p-2.5"
                >
                  <code className="flex-1 font-mono text-sm font-bold text-ink">
                    {code.code}
                  </code>
                  <span className="text-xs text-ink-subtle">{code.durationDays}d</span>
                  <button
                    type="button"
                    onClick={() => copyCode(code.code)}
                    aria-label={t("admin.copyCode")}
                    className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
                  >
                    {copied === code.code ? (
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

        <PasswordResetCard adminSecret={adminSecret} />

        <div className="rounded-card border border-line bg-surface shadow-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            {t("admin.allCodes")}
          </h2>
          {codes.length === 0 ? (
            <p className="text-sm text-ink-faint">{t("admin.noCodes")}</p>
          ) : (
            <div className="space-y-2">
              {codes.map((code) => (
                <div
                  key={code.id}
                  className="flex items-center justify-between rounded-lg border border-line p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">
                        {code.durationDays} {t("admin.days")}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          code.active
                            ? "bg-brand-100 text-brand-700"
                            : "bg-surface-2 text-ink-subtle"
                        }`}
                      >
                        {code.active ? t("admin.active") : t("admin.disabled")}
                      </span>
                    </div>
                    <p className="text-xs text-ink-subtle">
                      {code.redemptionCount}/
                      {code.maxRedemptions === 0 ? "∞" : code.maxRedemptions}{" "}
                      {t("admin.used")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleCode(code.id, !code.active)}
                    className={`rounded-lg p-1.5 ${
                      code.active
                        ? "text-danger hover:bg-danger-soft"
                        : "text-brand-600 hover:bg-brand-50"
                    }`}
                  >
                    {code.active ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScreenContent>
  );
}
