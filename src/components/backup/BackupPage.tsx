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
import { useLanguage } from "@/providers/language-provider";

export function BackupPage() {
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string; preview: BackupFile | null; error: string | null } | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportBackup = useExportBackup();
  const exportCsv = useExportCsv();
  const importBackup = useImportBackup();
  const { t } = useLanguage();

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
      setUploadedFile({ name: file.name, content, preview: null, error: t("backup.importError") });
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
      <section className="rounded-card border border-line bg-surface shadow-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
            <Database className="h-5 w-5 text-brand-700" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">{t("backup.fullBackup")}</h2>
            <p className="mt-0.5 text-xs text-ink-subtle">
              {t("backup.fullBackupDesc")}
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
                  {t("backup.exporting")}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {t("backup.downloadBackup")}
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Export CSV (per table) ────────────────────────────────────── */}
      <section className="rounded-card border border-line bg-surface shadow-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-soft">
            <FileSpreadsheet className="h-5 w-5 text-info-ink" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">{t("backup.exportCsv")}</h2>
            <p className="mt-0.5 text-xs text-ink-subtle">
              {t("backup.exportCsvDesc")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {EXPORTABLE_TABLES.map((tbl) => (
                <button
                  key={tbl.value}
                  type="button"
                  disabled={exportCsv.isPending}
                  onClick={() => exportCsv.mutate(tbl.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-xs",
                    "hover:bg-app active:bg-surface-2",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-info-ink" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{tbl.label}</p>
                    <p className="truncate text-[10px] text-ink-subtle">{tbl.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Import / Restore ──────────────────────────────────────────── */}
      <section className="rounded-card border border-line bg-surface shadow-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-soft">
            <Upload className="h-5 w-5 text-warning-ink" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">{t("backup.importRestore")}</h2>
            <p className="mt-0.5 text-xs text-ink-subtle">
              {t("backup.importDesc")}{" "}
              <span className="font-semibold text-danger-ink">
                {t("backup.replaceWarning")}
              </span>
            </p>

            {/* File picker */}
            <div className="mt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="block w-full text-xs text-ink-subtle file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white hover:file:bg-brand-700"
              />
            </div>

            {/* Preview */}
            {uploadedFile ? (
              <div className="mt-3 space-y-3">
                {uploadedFile.error ? (
                  <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-ink">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <p className="font-semibold">{t("backup.importError")}</p>
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
      <div className="rounded-card border border-line bg-app p-4 text-xs text-ink-muted">
        <p className="font-semibold text-ink-muted">{t("backup.tips")}</p>
        <ul className="mt-1.5 space-y-1">
          <li>• {t("backup.tip1")}</li>
          <li>• {t("backup.tip2")}</li>
          <li>• {t("backup.tip3")}</li>
          <li>• {t("backup.tip4")}</li>
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
  const { t } = useLanguage();
  const c = file.preview.counts;
  const total = c.customers + c.products + c.sales + c.saleItems + c.payments + c.customerAdjustments + c.stockMoves + c.expenses + c.transactions;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-surface p-3">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-ink-subtle" />
          <p className="truncate text-sm font-medium text-ink">{file.name}</p>
        </div>
        <p className="mt-1 text-[11px] text-ink-subtle">
          Exported: {new Date(file.preview.exportedAt).toLocaleString()}
        </p>
        <p className="text-[11px] text-ink-subtle">
          Total records: {total}
        </p>

        {/* Counts grid */}
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
          <CountCell label={t("backup.count.customers")} value={c.customers} />
          <CountCell label={t("backup.count.products")} value={c.products} />
          <CountCell label={t("backup.count.sales")} value={c.sales} />
          <CountCell label={t("backup.count.saleItems")} value={c.saleItems} />
          <CountCell label={t("backup.count.payments")} value={c.payments} />
          <CountCell label={t("backup.count.stockMoves")} value={c.stockMoves} />
          <CountCell label={t("backup.count.expenses")} value={c.expenses} />
          <CountCell label={t("backup.count.transactions")} value={c.transactions} />
          <CountCell label={t("backup.count.adjustments")} value={c.customerAdjustments} />
        </div>
      </div>

      {/* Confirm step 1: show warning + Confirm button */}
      {!confirmStep ? (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border-2 border-danger/20 bg-danger-soft px-3 py-2.5 text-xs text-danger-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{t("backup.replaceAllWarning")}</p>
              <p className="mt-0.5">
                {t("backup.replaceAllDesc")}
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
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={onConfirm}
            >
              {t("backup.understand")}
            </Button>
          </div>
        </div>
      ) : (
        /* Confirm step 2: final confirmation */
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border-2 border-danger/40 bg-danger-soft px-3 py-2.5 text-xs text-danger-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">{t("backup.finalConfirm")}</p>
              <p className="mt-0.5">
                {t("backup.finalConfirmDesc")}
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
              {t("common.cancel")}
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
                  {t("backup.restoring")}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {t("backup.yesReplace")}
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
    <div className="rounded bg-app px-2 py-1">
      <p className="text-[10px] uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="text-sm font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}
