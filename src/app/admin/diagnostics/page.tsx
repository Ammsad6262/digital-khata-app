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
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2">
              <KeyRound className="h-8 w-8 text-ink-subtle" />
            </div>
            <h2 className="text-base font-semibold text-ink">AI Diagnostics</h2>
            <p className="mt-1 text-sm text-ink-subtle">
              Developer area. Enter the admin secret to view model health.
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              value={adminSecret}
              onChange={(event) => setAdminSecret(event.target.value)}
              placeholder="Admin secret"
              className="w-full rounded-card border border-line-strong bg-surface px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              autoComplete="off"
              disabled={loading}
              aria-label="Admin secret"
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
            <h1 className="text-lg font-bold text-ink">AI Diagnostics</h1>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Developer only · {data?.rotation.day ?? "—"} · free Gemini rotation
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void load(adminSecret)}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:bg-app"
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
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:bg-app"
            >
              <LogOut className="h-3.5 w-3.5" />
              Lock
            </button>
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface shadow-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Model rotation</h2>
          <div className="space-y-2">
            {data?.rotation.models.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between rounded-lg border border-line p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      model.healthy ? "bg-success" : "bg-danger"
                    }`}
                  />
                  <code className="font-mono text-sm text-ink">{model.id}</code>
                </div>
                <div className="text-right text-xs text-ink-subtle">
                  <span>
                    {model.used}/{model.limit} used · {model.remaining} left
                  </span>
                  {model.cooldownUntil ? (
                    <span className="ml-2 text-warning-ink">
                      cooling until {new Date(model.cooldownUntil).toLocaleTimeString()}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {total ? (
            <p className="mt-3 text-xs text-ink-subtle">
              Total: {total.used}/{total.limit} used · {total.remaining} requests left today
            </p>
          ) : null}
        </div>

        <div className="rounded-card border border-line bg-surface shadow-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Runtime config</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-subtle">API key configured</dt>
              <dd className="font-medium text-ink">
                {data?.config.apiKeyConfigured ? "yes" : "no"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-subtle">Per-attempt timeout</dt>
              <dd className="font-medium text-ink">{data?.config.attemptTimeoutMs} ms</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-subtle">Whole-call deadline</dt>
              <dd className="font-medium text-ink">{data?.config.deadlineMs} ms</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-subtle">HTTP timeout</dt>
              <dd className="font-medium text-ink">{data?.config.httpTimeoutMs} ms</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-card border border-line bg-surface shadow-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Recent failed actions</h2>
          {!data?.recentFailures.length ? (
            <p className="text-sm text-ink-faint">None recorded.</p>
          ) : (
            <div className="space-y-2">
              {data.recentFailures.map((failure, index) => (
                <div key={index} className="rounded-lg border border-line p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-medium text-ink-muted">
                      {failure.action}
                    </span>
                    <span className="text-[11px] text-ink-faint">
                      {new Date(failure.at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-danger-ink">{failure.error ?? "Unknown error"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScreenContent>
  );
}
