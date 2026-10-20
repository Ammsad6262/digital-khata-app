"use client";

/**
 * ReminderForm — create / edit a reminder.
 *
 * Links are optional; at most one of customer / supplier / product is used.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/providers/toast-provider";
import { useLanguage } from "@/providers/language-provider";
import {
  useCreateReminder,
  useDeleteReminder,
  useReminder,
  useUpdateReminder,
} from "@/hooks/use-reminders";
import { useCustomers } from "@/hooks/use-customers";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useProducts } from "@/hooks/use-products";

const TYPES = [
  "payment_collection",
  "supplier_payment",
  "customer_followup",
  "stock_reorder",
  "custom",
] as const;

const TYPE_KEYS = {
  payment_collection: "reminderType.payment_collection",
  supplier_payment: "reminderType.supplier_payment",
  customer_followup: "reminderType.customer_followup",
  stock_reorder: "reminderType.stock_reorder",
  custom: "reminderType.custom",
} as const;

const PRIORITIES = ["low", "normal", "high"] as const;

const PRIORITY_KEYS = {
  low: "reminderPriority.low",
  normal: "reminderPriority.normal",
  high: "reminderPriority.high",
} as const;

type LinkKind = "none" | "customer" | "supplier" | "product";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalInput(value: string | Date): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function defaultDueLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d);
}

export function ReminderForm({
  mode,
  reminderId,
}: {
  mode: "create" | "edit";
  reminderId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();

  const { data: existing, isLoading } = useReminder(mode === "edit" ? reminderId : null);
  const createMutation = useCreateReminder();
  const updateMutation = useUpdateReminder(reminderId ?? "");
  const deleteMutation = useDeleteReminder();

  const { data: customers } = useCustomers();
  const { data: suppliers } = useSuppliers();
  const { data: products } = useProducts();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("custom");
  const [priority, setPriority] = useState<string>("normal");
  const [dueAt, setDueAt] = useState(defaultDueLocal);
  const [notes, setNotes] = useState("");
  const [linkKind, setLinkKind] = useState<LinkKind>("none");
  const [linkId, setLinkId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !existing) return;
    setTitle(existing.title);
    setType(existing.type);
    setPriority(existing.priority);
    setDueAt(toLocalInput(existing.dueAt));
    setNotes(existing.notes ?? "");
    if (existing.customerId) {
      setLinkKind("customer");
      setLinkId(existing.customerId);
    } else if (existing.supplierId) {
      setLinkKind("supplier");
      setLinkId(existing.supplierId);
    } else if (existing.productId) {
      setLinkKind("product");
      setLinkId(existing.productId);
    } else {
      setLinkKind("none");
      setLinkId("");
    }
  }, [mode, existing]);

  const pending = createMutation.isPending || updateMutation.isPending;

  function onLinkKindChange(kind: LinkKind) {
    setLinkKind(kind);
    setLinkId("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError(t("reminders.titleField"));
      return;
    }
    if (!dueAt) {
      setError(t("reminders.dueDate"));
      return;
    }
    if (linkKind !== "none" && !linkId) {
      setError(
        linkKind === "customer"
          ? t("reminders.pickCustomer")
          : linkKind === "supplier"
            ? t("reminders.pickSupplier")
            : t("reminders.pickProduct"),
      );
      return;
    }
    setError(null);

    const payload = {
      title: title.trim(),
      type,
      priority,
      dueAt: new Date(dueAt).toISOString(),
      notes: notes.trim() || null,
      customerId: linkKind === "customer" ? linkId : null,
      supplierId: linkKind === "supplier" ? linkId : null,
      productId: linkKind === "product" ? linkId : null,
    };

    try {
      if (mode === "create") {
        await createMutation.mutateAsync(payload);
      } else {
        await updateMutation.mutateAsync(payload);
      }
      toast.success(t("reminders.saved"));
      router.push("/more/reminders");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    }
  }

  async function onDelete() {
    if (!reminderId) return;
    try {
      await deleteMutation.mutateAsync(reminderId);
      toast.success(t("common.deleted"));
      router.push("/more/reminders");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
      setConfirmingDelete(false);
    }
  }

  if (mode === "edit" && isLoading) {
    return <p className="py-8 text-center text-sm text-slate-500">{t("common.loading")}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-6">
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <TextField
        label={t("reminders.titleField")}
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        hint={t("reminders.titlePlaceholder")}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="reminder-type" className="block text-sm font-medium text-slate-700">
            {t("reminders.type")}
          </label>
          <select
            id="reminder-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {t(TYPE_KEYS[value])}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="reminder-priority" className="block text-sm font-medium text-slate-700">
            {t("reminders.priority")}
          </label>
          <select
            id="reminder-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {t(PRIORITY_KEYS[value])}
              </option>
            ))}
          </select>
        </div>
      </div>

      <TextField
        label={t("reminders.dueDate")}
        name="dueAt"
        type="datetime-local"
        value={dueAt}
        onChange={(e) => setDueAt(e.target.value)}
        required
      />

      <div className="space-y-1">
        <label htmlFor="reminder-link-kind" className="block text-sm font-medium text-slate-700">
          {t("reminders.linkTo")}
        </label>
        <select
          id="reminder-link-kind"
          value={linkKind}
          onChange={(e) => onLinkKindChange(e.target.value as LinkKind)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        >
          <option value="none">{t("reminders.noLink")}</option>
          <option value="customer">{t("reminders.customer")}</option>
          <option value="supplier">{t("reminders.supplier")}</option>
          <option value="product">{t("reminders.product")}</option>
        </select>
      </div>

      {linkKind !== "none" ? (
        <div className="space-y-1">
          <label htmlFor="reminder-link-id" className="block text-sm font-medium text-slate-700">
            {linkKind === "customer"
              ? t("reminders.pickCustomer")
              : linkKind === "supplier"
                ? t("reminders.pickSupplier")
                : t("reminders.pickProduct")}
          </label>
          <select
            id="reminder-link-id"
            value={linkId}
            onChange={(e) => setLinkId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            <option value="">—</option>
            {linkKind === "customer"
              ? (customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              : linkKind === "supplier"
                ? (suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                : (products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="reminder-notes" className="block text-sm font-medium text-slate-700">
          {t("common.notes")}
        </label>
        <textarea
          id="reminder-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? t("common.saving") : t("common.save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          {t("common.cancel")}
        </Button>
      </div>

      {mode === "edit" ? (
        confirmingDelete ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{t("reminders.deleteWarning")}</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={onDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? t("common.deleting") : t("common.yesDelete")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmingDelete(true)}
            className="w-full text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            {t("reminders.delete")}
          </Button>
        )
      ) : null}
    </form>
  );
}
