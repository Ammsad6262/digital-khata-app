"use client";

/**
 * /admin/diagnostics — developer-only AI diagnostics.
 *
 * This is where the Gemini model ids, per-model request counters, cooldowns,
 * and recent assistant failures live. Business owners never see this; it is
 * reachable only with the `ADMIN_SECRET`.
 */

import { useCallback, useState } from "react";
import { AlertCircle, KeyRound, Loader2, LogOut, RefreshCw } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";

type Diagnostics = {
  rotation: {
    day: string;
    models: Array<{
      id: string;
      used: number;
      limit: number;
      remaining: number;
      cooldownUntil: string | null;
      healthy: boolean;
    }>;
    total: { used: number; limit: number; remaining: number };
  };
  config: {
    attemptTimeoutMs: number;
    deadlineMs: number;
    httpTimeoutMs: number;
    apiKeyConfigured: boolean;
  };
  recentFailures: Array<{ action: string; error: string | null; at: string }>;
};

export default function AdminDiagnosticsPage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Diagnostics | null>(null);

  const load = useCallback(
    async (secret: string) => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/diagnostics", {
          headers: { "x-admin-secret": secret },
          cache: "no-store",
        });
        if (!res.ok) {
          setAuthError("Invalid admin secret.");
          setAuthenticated(false);
          return false;
        }
        const json = (await res.json()) as { ok?: boolean; data?: Diagnostics };
        setData(json.data ?? null);
        return true;
      } catch {
        setAuthError("Could not reach the server.");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adminSecret.trim()) return;
    setAuthError(null);
    const ok = await load(adminSecret);
    if (ok) setAuthenticated(true);
  };

  if (!authenticated) {
    return (
      <ScreenContent>
        <div className="mx-auto max-w-md space-y-4 py-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <KeyRound className="h-8 w-8 text-slate-500" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">AI Diagnostics</h2>
            <p className="mt-1 text-sm text-slate-500">
              Developer area. Enter the admin secret to view model health.
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              value={adminSecret}
              onChange={(event) => setAdminSecret(event.target.value)}
              placeholder="Admin secret"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              autoComplete="off"
              disabled={loading}
              aria-label="Admin secret"
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
              Unlock
            </button>
          </form>
        </div>
      </ScreenContent>
    );
  }

  const total = data?.rotation.total;

  return (
    <ScreenContent>
      <div className="mx-auto max-w-2xl space-y-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">AI Diagnostics</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Developer only · {data?.rotation.day ?? "—"} · free Gemini rotation
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void load(adminSecret)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthenticated(false);
                setAdminSecret("");
                setData(null);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Lock
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Model rotation</h2>
          <div className="space-y-2">
            {data?.rotation.models.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      model.healthy ? "bg-emerald-500" : "bg-red-400"
                    }`}
                  />
                  <code className="font-mono text-sm text-slate-900">{model.id}</code>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <span>
                    {model.used}/{model.limit} used · {model.remaining} left
                  </span>
                  {model.cooldownUntil ? (
                    <span className="ml-2 text-amber-600">
                      cooling until {new Date(model.cooldownUntil).toLocaleTimeString()}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {total ? (
            <p className="mt-3 text-xs text-slate-500">
              Total: {total.used}/{total.limit} used · {total.remaining} requests left today
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Runtime config</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">API key configured</dt>
              <dd className="font-medium text-slate-900">
                {data?.config.apiKeyConfigured ? "yes" : "no"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Per-attempt timeout</dt>
              <dd className="font-medium text-slate-900">{data?.config.attemptTimeoutMs} ms</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Whole-call deadline</dt>
              <dd className="font-medium text-slate-900">{data?.config.deadlineMs} ms</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">HTTP timeout</dt>
              <dd className="font-medium text-slate-900">{data?.config.httpTimeoutMs} ms</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent failed actions</h2>
          {!data?.recentFailures.length ? (
            <p className="text-sm text-slate-400">None recorded.</p>
          ) : (
            <div className="space-y-2">
              {data.recentFailures.map((failure, index) => (
                <div key={index} className="rounded-lg border border-slate-100 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-medium text-slate-700">
                      {failure.action}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(failure.at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-red-700">{failure.error ?? "Unknown error"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScreenContent>
  );
}
