"use client";

/**
 * React Query hook for backup operations.
 *
 * - useExportBackup → triggers JSON download (returns blob URL)
 * - useExportCsv     → triggers CSV download for one table
 * - useImportBackup  → mutation (validates + restores)
 */

import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/utils/api-client";

type ImportResult = {
  success: true;
  imported: {
    customers: number;
    products: number;
    sales: number;
    saleItems: number;
    payments: number;
    customerAdjustments: number;
    stockMoves: number;
    expenses: number;
    transactions: number;
    settings: number;
  };
};

/**
 * Download the full JSON backup. Browser handles the file download via
 * Content-Disposition header.
 */
export function useExportBackup() {
  const toast = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/backup/export");
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new ApiError(
          json?.error?.message ?? "Export failed.",
          json?.error?.code ?? "EXPORT_ERROR",
          res.status,
        );
      }
      // Get filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] ?? `digital-khata-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const blob = await res.blob();
      return { blob, filename };
    },
    onSuccess: ({ blob, filename }) => {
      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Backup downloaded: ${filename}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Backup export failed.");
    },
  });
}

/**
 * Download one table as CSV.
 */
export function useExportCsv() {
  const toast = useToast();

  return useMutation({
    mutationFn: async (table: string) => {
      const res = await fetch(`/api/backup/csv/${table}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new ApiError(
          json?.error?.message ?? "CSV export failed.",
          json?.error?.code ?? "EXPORT_ERROR",
          res.status,
        );
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] ?? `${table}-${new Date().toISOString().slice(0, 10)}.csv`;

      const blob = await res.blob();
      return { blob, filename, table };
    },
    onSuccess: ({ blob, filename, table }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`CSV exported: ${filename}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "CSV export failed.");
    },
  });
}

/**
 * Import (restore) a backup file.
 *
 * CRITICAL: This replaces all existing data. The UI must show a scary
 * confirmation dialog before calling this mutation.
 */
export function useImportBackup() {
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ content, confirmReplace }: { content: string; confirmReplace: boolean }) => {
      const res = await fetch("/api/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, confirmReplace }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new ApiError(
          json?.error?.message ?? "Import failed.",
          json?.error?.code ?? "IMPORT_ERROR",
          res.status,
          json?.error?.details,
        );
      }

      return json.data as ImportResult;
    },
    onSuccess: (data) => {
      const c = data.imported;
      toast.success(
        `Backup restored: ${c.customers} customers, ${c.sales} sales, ${c.payments} payments, ${c.products} products`,
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Import failed. No data was changed.");
    },
  });
}

export { ApiError };
