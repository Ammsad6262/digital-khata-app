"use client";

/**
 * BackupPage — full backup/export/import UI.
 *
 * Sections:
 *   1. Export Full Backup (JSON) — one click, downloads a timestamped .json file
 *      that can be restored later. Preserves ALL relationships.
 *   2. Export CSV (per table) — quick Excel-friendly exports, one per table
 *   3. Import / Restore — upload a JSON backup file, preview its contents,
 *      confirm the destructive replace action
 *
 * Safety:
 *   - Import requires a 2-step confirmation (file picker → preview → scary confirm)
 *   - The API requires confirmReplace: true
 *   - On any error, NO data is changed (transaction rolls back)
 */

import { useState, useRef } from "react";
import {
  Download,
  Upload,
  FileJson,
  FileSpreadsheet,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  useExportBackup,
  useExportCsv,
  useImportBackup,
} from "@/hooks/use-backup";
import {
  EXPORTABLE_TABLES,
  type BackupFile,
} from "@/lib/services/backup";
import { cn } from "@/lib/utils/cn";

export function BackupPage() {
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string; preview: BackupFile | null; error: string | null } | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportBackup = useExportBackup();
  const exportCsv = useExportCsv();
  const importBackup = useImportBackup();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    setConfirmStep(false);

    // Preview the file client-side first (basic structure check)
    try {
      const parsed = JSON.parse(content) as BackupFile;
      if (typeof parsed.version !== "number") {
        setUploadedFile({ name: file.name, content, preview: null, error: "Missing 'version' field — not a valid backup file." });
        return;
      }
      if (parsed.version !== 1) {
        setUploadedFile({ name: file.name, content, preview: null, error: `Backup version ${parsed.version} not supported (expected version 1).` });
        return;
      }
      if (!parsed.data || typeof parsed.data !== "object") {
        setUploadedFile({ name: file.name, content, preview: null, error: "Missing 'data' object." });
        return;
      }
      setUploadedFile({ name: file.name, content, preview: parsed, error: null });
    } catch {
      setUploadedFile({ name: file.name, content, preview: null, error: "File is not valid JSON." });
    }
  };

  const handleImport = () => {
    if (!uploadedFile || !uploadedFile.preview) return;
    importBackup.mutate(
      { content: uploadedFile.content, confirmReplace: true },
      {
        onSuccess: () => {
          setUploadedFile(null);
          setConfirmStep(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      {/* ── Export Full Backup (JSON) ─────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
            <Database className="h-5 w-5 text-brand-700" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">Full Backup (JSON)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Download everything — customers, products, sales, payments, stock, expenses.
              Can be restored later. Preserves all relationships.
            </p>
            <Button
              type="button"
              variant="primary"
              size="md"
              className="mt-3"
              disabled={exportBackup.isPending}
              onClick={() => exportBackup.mutate()}
            >
              {exportBackup.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download Backup
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Export CSV (per table) ────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <FileSpreadsheet className="h-5 w-5 text-blue-700" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">Export CSV (per table)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Download individual tables as CSV files for opening in Excel/Google Sheets.
              Useful for reports or sharing with an accountant.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {EXPORTABLE_TABLES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={exportCsv.isPending}
                  onClick={() => exportCsv.mutate(t.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs",
                    "hover:bg-slate-50 active:bg-slate-100",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{t.label}</p>
                    <p className="truncate text-[10px] text-slate-500">{t.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Import / Restore ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
            <Upload className="h-5 w-5 text-amber-700" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">Import / Restore</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Restore from a previously-downloaded JSON backup.{" "}
              <span className="font-semibold text-red-700">
                This replaces ALL current data.
              </span>
            </p>

            {/* File picker */}
            <div className="mt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white hover:file:bg-brand-700"
              />
            </div>

            {/* Preview */}
            {uploadedFile ? (
              <div className="mt-3 space-y-3">
                {uploadedFile.error ? (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Cannot import this file</p>
                      <p className="mt-0.5">{uploadedFile.error}</p>
                    </div>
                  </div>
                ) : uploadedFile.preview ? (
                  <FilePreview
                    file={{ name: uploadedFile.name, preview: uploadedFile.preview }}
                    onConfirm={() => setConfirmStep(true)}
                    confirmStep={confirmStep}
                    onConfirmImport={handleImport}
                    isPending={importBackup.isPending}
                    onCancel={() => {
                      setUploadedFile(null);
                      setConfirmStep(false);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Help text ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">Tips</p>
        <ul className="mt-1.5 space-y-1">
          <li>• Download a JSON backup weekly for safety. Store it somewhere safe.</li>
          <li>• CSV exports are for viewing in Excel — they cannot be re-imported.</li>
          <li>• Importing replaces ALL data. Use it only for restores or moving to a new device.</li>
          <li>• All imports are atomic — if any record fails, nothing is changed.</li>
        </ul>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// File preview + confirm
// ────────────────────────────────────────────────────────────────────────────

function FilePreview({
  file,
  onConfirm,
  confirmStep,
  onConfirmImport,
  isPending,
  onCancel,
}: {
  file: { name: string; preview: BackupFile };
  onConfirm: () => void;
  confirmStep: boolean;
  onConfirmImport: () => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const c = file.preview.counts;
  const total = c.customers + c.products + c.sales + c.saleItems + c.payments + c.customerAdjustments + c.stockMoves + c.expenses + c.transactions;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-slate-500" />
          <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Exported: {new Date(file.preview.exportedAt).toLocaleString()}
        </p>
        <p className="text-[11px] text-slate-500">
          Total records: {total}
        </p>

        {/* Counts grid */}
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
          <CountCell label="Customers" value={c.customers} />
          <CountCell label="Products" value={c.products} />
          <CountCell label="Sales" value={c.sales} />
          <CountCell label="Sale Items" value={c.saleItems} />
          <CountCell label="Payments" value={c.payments} />
          <CountCell label="Stock Moves" value={c.stockMoves} />
          <CountCell label="Expenses" value={c.expenses} />
          <CountCell label="Transactions" value={c.transactions} />
          <CountCell label="Adjustments" value={c.customerAdjustments} />
        </div>
      </div>

      {/* Confirm step 1: show warning + Confirm button */}
      {!confirmStep ? (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">This will replace ALL current data.</p>
              <p className="mt-0.5">
                Every customer, sale, payment, product, and expense currently in the app
                will be deleted and replaced with the contents of this backup file.
                This cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={onConfirm}
            >
              I understand — proceed
            </Button>
          </div>
        </div>
      ) : (
        /* Confirm step 2: final confirmation */
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border-2 border-red-300 bg-red-100 px-3 py-2.5 text-xs text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">Final confirmation</p>
              <p className="mt-0.5">
                Are you absolutely sure? The restore will begin immediately.
                All existing data will be lost.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={onCancel}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={onConfirmImport}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Yes, replace all data
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CountCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-slate-50 px-2 py-1">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
