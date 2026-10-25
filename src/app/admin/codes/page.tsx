"use client";

import { useState } from "react";
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
  const [duration, setDuration] = useState(30);
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
        body: JSON.stringify({ durationDays: duration, maxRedemptions, count }),
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
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <KeyRound className="h-8 w-8 text-slate-500" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">{t("admin.title")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("admin.subtitle")}</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
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
            <h1 className="text-lg font-bold text-slate-900">{t("admin.title")}</h1>
            <p className="mt-0.5 text-xs text-slate-500">{t("admin.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={lockAdmin}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t("admin.lock")}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            {t("admin.generateNew")}
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label
                htmlFor="admin-duration"
                className="mb-1 block text-xs text-slate-500"
              >
                {t("admin.duration")}
              </label>
              <select
                id="admin-duration"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
              >
                {[7, 15, 30, 60, 90, 180, 365].map((days) => (
                  <option key={days} value={days}>
                    {days} {t("admin.days")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="admin-max-uses"
                className="mb-1 block text-xs text-slate-500"
              >
                {t("admin.maxUses")}
              </label>
              <select
                id="admin-max-uses"
                value={maxRedemptions}
                onChange={(event) => setMaxRedemptions(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
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
                className="mb-1 block text-xs text-slate-500"
              >
                {t("admin.count")}
              </label>
              <select
                id="admin-count"
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
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
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("admin.generate")}
          </button>
          {error ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 p-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <p className="text-xs text-red-800">{error}</p>
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
                  className="flex items-center gap-2 rounded-lg bg-white p-2.5"
                >
                  <code className="flex-1 font-mono text-sm font-bold text-slate-900">
                    {code.code}
                  </code>
                  <span className="text-xs text-slate-500">{code.durationDays}d</span>
                  <button
                    type="button"
                    onClick={() => copyCode(code.code)}
                    aria-label={t("admin.copyCode")}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            {t("admin.allCodes")}
          </h2>
          {codes.length === 0 ? (
            <p className="text-sm text-slate-400">{t("admin.noCodes")}</p>
          ) : (
            <div className="space-y-2">
              {codes.map((code) => (
                <div
                  key={code.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {code.durationDays} {t("admin.days")}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          code.active
                            ? "bg-brand-100 text-brand-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {code.active ? t("admin.active") : t("admin.disabled")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
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
                        ? "text-red-500 hover:bg-red-50"
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
