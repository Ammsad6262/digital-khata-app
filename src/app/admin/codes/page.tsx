"use client";
import { useState } from "react";
import { KeyRound, Plus, Loader2, Check, Ban, Copy, AlertCircle } from "lucide-react";

export default function AdminCodesPage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [maxRedemptions, setMaxRedemptions] = useState(1);
  const [count, setCount] = useState(1);
  const [generated, setGenerated] = useState<any[]>([]);
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSecret.trim()) return;
    setLoading(true); setAuthError(null);
    try {
      const res = await fetch("/api/admin/codes", { headers: { "x-admin-secret": adminSecret } });
      if (res.ok) { setAuthenticated(true); fetchCodes(); } else { setAuthError("Invalid admin secret."); }
    } catch { setAuthError("Failed to connect."); } finally { setLoading(false); }
  };

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/codes", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret }, body: JSON.stringify({ durationDays: duration, maxRedemptions, count }) });
      const json = await res.json();
      if (json.ok) { setGenerated(json.data); fetchCodes(); } else { setError(json.error?.message || "Failed."); }
    } catch { setError("Failed to connect."); } finally { setLoading(false); }
  };

  const fetchCodes = async () => {
    try {
      const res = await fetch("/api/admin/codes", { headers: { "x-admin-secret": adminSecret } });
      const json = await res.json();
      if (json.ok) setCodes(json.data);
    } catch {}
  };

  const toggleCode = async (codeId: string, active: boolean) => {
    try { await fetch("/api/admin/codes", { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret }, body: JSON.stringify({ codeId, active }) }); fetchCodes(); } catch {}
  };

  const copyCode = (code: string) => { navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 2000); };

  if (!authenticated) {
    return (
      <div className="space-y-4">
        <div className="text-center"><div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100"><KeyRound className="h-8 w-8 text-slate-500" /></div><h2 className="text-base font-semibold text-slate-900">Admin Access</h2><p className="mt-1 text-sm text-slate-500">Enter the admin secret to manage activation codes.</p></div>
        <form onSubmit={handleLogin} className="space-y-3">
          <input type="password" value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} placeholder="Admin secret" className="w-full rounded-xl border border-slate-300 bg-white py-3 px-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" autoComplete="off" disabled={loading} aria-label="Admin secret" />
          {authError ? <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3"><AlertCircle className="h-4 w-4 shrink-0 text-red-600" /><p className="text-sm text-red-800">{authError}</p></div> : null}
          <button type="submit" disabled={!adminSecret.trim() || loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}Authenticate</button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Generate New Codes</h2>
        <div className="grid grid-cols-3 gap-2">
          <div><label className="mb-1 block text-xs text-slate-500">Duration</label><select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white py-2 px-2 text-sm"><option value={7}>7 days</option><option value={15}>15 days</option><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option></select></div>
          <div><label className="mb-1 block text-xs text-slate-500">Max uses</label><select value={maxRedemptions} onChange={(e) => setMaxRedemptions(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white py-2 px-2 text-sm"><option value={1}>1</option><option value={5}>5</option><option value={10}>10</option><option value={25}>25</option><option value={100}>100</option><option value={0}>Unlimited</option></select></div>
          <div><label className="mb-1 block text-xs text-slate-500">Count</label><select value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white py-2 px-2 text-sm"><option value={1}>1</option><option value={5}>5</option><option value={10}>10</option></select></div>
        </div>
        <button onClick={generate} disabled={loading} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Generate Codes</button>
        {error ? <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 p-2"><AlertCircle className="h-4 w-4 shrink-0 text-red-600" /><p className="text-xs text-red-800">{error}</p></div> : null}
      </div>
      {generated.length > 0 ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><h2 className="mb-2 text-sm font-semibold text-brand-900">✨ Generated Codes (save these — shown only once!)</h2><div className="space-y-2">{generated.map((code, i) => (<div key={i} className="flex items-center gap-2 rounded-lg bg-white p-2.5"><code className="flex-1 font-mono text-sm font-bold text-slate-900">{code.code}</code><span className="text-xs text-slate-500">{code.durationDays}d</span><button onClick={() => copyCode(code.code)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">{copied === code.code ? <Check className="h-4 w-4 text-brand-600" /> : <Copy className="h-4 w-4" />}</button></div>))}</div></div>
      ) : null}
      <div className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-3 text-sm font-semibold text-slate-900">All Codes</h2>{codes.length === 0 ? <p className="text-sm text-slate-400">No codes yet.</p> : (<div className="space-y-2">{codes.map((code) => (<div key={code.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium text-slate-900">{code.durationDays} days</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${code.active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>{code.active ? "Active" : "Disabled"}</span></div><p className="text-xs text-slate-500">{code.redemptionCount}/{code.maxRedemptions === 0 ? "∞" : code.maxRedemptions} used</p></div><button onClick={() => toggleCode(code.id, !code.active)} className={`rounded-lg p-1.5 ${code.active ? "text-red-500 hover:bg-red-50" : "text-brand-600 hover:bg-brand-50"}`}>{code.active ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}</button></div>))}</div>)}</div>
    </div>
  );
}
