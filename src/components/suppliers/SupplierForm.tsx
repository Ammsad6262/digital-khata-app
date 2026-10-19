"use client";

/**
 * SupplierForm — create / edit a supplier.
 *
 * Opening balance is only editable on create (set once, then corrections
 * should go through an explicit adjustment — same rule as customers).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/providers/toast-provider";
import { useLanguage } from "@/providers/language-provider";
import { useCreateSupplier, useSupplier, useUpdateSupplier } from "@/hooks/use-suppliers";

export function SupplierForm({
  mode,
  supplierId,
}: {
  mode: "create" | "edit";
  supplierId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();

  const { data: existing, isLoading } = useSupplier(mode === "edit" ? supplierId : null);
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier(supplierId ?? "");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mode === "edit" && existing) {
      setName(existing.name);
      setPhone(existing.phone ?? "");
      setEmail(existing.email ?? "");
      setAddress(existing.address ?? "");
      setNotes(existing.notes ?? "");
      setOpeningBalance(existing.openingBalance);
    }
  }, [mode, existing]);

  const pending = createMutation.isPending || updateMutation.isPending;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t("common.required");
    if (mode === "create") {
      const n = Number(openingBalance);
      if (!Number.isFinite(n)) next.openingBalance = t("common.error");
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = t("common.error");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      if (mode === "create") {
        await createMutation.mutateAsync({
          ...payload,
          openingBalance: Number(openingBalance) || 0,
        });
        toast.success(t("supplier.newSupplier"));
      } else {
        await updateMutation.mutateAsync(payload);
        toast.success(t("supplier.editSupplier"));
      }
      router.push("/more/suppliers");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    }
  }

  if (mode === "edit" && isLoading) {
    return <p className="py-8 text-center text-sm text-slate-500">{t("common.loading")}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <TextField
        label={t("supplier.name")}
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        required
      />
      <TextField
        label={t("common.phone")}
        name="phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="tel"
      />
      <TextField
        label={t("supplier.email")}
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <TextField
        label={t("supplier.address")}
        name="address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      {mode === "create" ? (
        <TextField
          label={t("supplier.openingBalance")}
          name="openingBalance"
          type="number"
          inputMode="decimal"
          step="0.01"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
          error={errors.openingBalance}
          hint={t("supplier.openingBalanceHint")}
        />
      ) : null}
      <div className="space-y-1">
        <label htmlFor="supplier-notes" className="block text-sm font-medium text-slate-700">
          {t("common.notes")}
        </label>
        <textarea
          id="supplier-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      <div className="flex gap-3 pt-2">
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
    </form>
  );
}
