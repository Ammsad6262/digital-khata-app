"use client";

/**
 * PlanCard — the confirmation card for a prepared write action.
 *
 * Shared by BOTH assistant products (Voice + Khata). It renders the plan the
 * server prepared and lets the owner CHANGE the parsed values before saving,
 * and add a named-but-missing customer/product/supplier in one tap.
 *
 * It never calculates a balance or invents a value; it only edits what the
 * server already produced and hands the diff back as a patch.
 */

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import type { TranslationKey } from "@/lib/i18n/translations";
import type {
  ActionKind,
  AssistantPlan,
  Candidate,
  PlanPayload,
  PlanValues,
} from "@/lib/assistant/types";

function money(value: number | undefined, symbol = "Rs.") {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${symbol} ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

type EntityKind = "customer" | "product" | "supplier";

const CANDIDATE_KEY: Record<
  "customers" | "products" | "suppliers",
  { payload: keyof PlanPayload; create: EntityKind }
> = {
  customers: { payload: "customerId", create: "customer" },
  products: { payload: "productId", create: "product" },
  suppliers: { payload: "supplierId", create: "supplier" },
};

/** Server-supplied field labels are English; map them to translation keys. */
const DISPLAY_LABEL: Record<string, TranslationKey> = {
  Customer: "plan.label.customer",
  Product: "plan.label.product",
  Supplier: "plan.label.supplier",
  Quantity: "plan.label.quantity",
  Unit: "plan.label.unit",
  "Unit price": "plan.label.unitPrice",
  Discount: "plan.label.discount",
  Total: "plan.label.total",
  "Paid now": "plan.label.paidNow",
  Amount: "plan.label.amount",
  Method: "plan.label.method",
  Expense: "plan.label.expense",
  Category: "plan.label.category",
  "Cost per unit": "plan.label.costPerUnit",
  Name: "plan.label.name",
  Phone: "plan.label.phone",
  "Selling price": "plan.label.sellingPrice",
  "Purchase price": "plan.label.purchasePrice",
  "Opening stock": "plan.label.openingStock",
  Reminder: "plan.label.reminder",
  Due: "plan.label.due",
  Priority: "plan.label.priority",
  Target: "plan.label.target",
};

const LABEL_TO_VALUE_KEY: Record<string, keyof PlanValues> = {
  Quantity: "quantity",
  Unit: "unit",
  "Unit price": "unitPrice",
  "Cost per unit": "unitCost",
  Total: "total",
  "Paid now": "paidAmount",
  Amount: "amount",
  Discount: "discountAmount",
  Name: "name",
  Phone: "phone",
  Expense: "expenseName",
  Category: "category",
  "Selling price": "sellingPrice",
  "Purchase price": "purchasePrice",
  "Opening stock": "openingStock",
  Target: "targetId",
  Reminder: "reminderTitle",
};

type Spec = { key: keyof PlanPayload & keyof PlanValues; label: TranslationKey; type: "number" | "text" };

/** Which parsed values the owner can change, per action. */
const EDITABLE: Partial<Record<ActionKind, Spec[]>> = {
  CREATE_SALE: [
    { key: "quantity", label: "plan.label.quantity", type: "number" },
    { key: "unit", label: "plan.label.unit", type: "text" },
    { key: "unitPrice", label: "plan.label.unitPrice", type: "number" },
    { key: "paidAmount", label: "plan.label.paidNow", type: "number" },
  ],
  CREATE_PURCHASE: [
    { key: "quantity", label: "plan.label.quantity", type: "number" },
    { key: "unit", label: "plan.label.unit", type: "text" },
    { key: "unitCost", label: "plan.label.costPerUnit", type: "number" },
    { key: "paidAmount", label: "plan.label.paidNow", type: "number" },
  ],
  RECORD_PAYMENT: [
    { key: "amount", label: "plan.label.amount", type: "number" },
    { key: "method", label: "plan.label.method", type: "text" },
  ],
  SUPPLIER_PAYMENT: [
    { key: "amount", label: "plan.label.amount", type: "number" },
    { key: "method", label: "plan.label.method", type: "text" },
  ],
  CREATE_EXPENSE: [
    { key: "amount", label: "plan.label.amount", type: "number" },
    { key: "expenseName", label: "plan.label.expense", type: "text" },
    { key: "category", label: "plan.label.category", type: "text" },
  ],
  ADD_STOCK: [
    { key: "quantity", label: "plan.label.quantity", type: "number" },
    { key: "unit", label: "plan.label.unit", type: "text" },
    { key: "unitCost", label: "plan.label.costPerUnit", type: "number" },
  ],
  CREATE_CUSTOMER: [
    { key: "name", label: "plan.label.name", type: "text" },
    { key: "phone", label: "plan.label.phone", type: "text" },
  ],
  CREATE_SUPPLIER: [
    { key: "name", label: "plan.label.name", type: "text" },
    { key: "phone", label: "plan.label.phone", type: "text" },
  ],
  CREATE_PRODUCT: [
    { key: "name", label: "plan.label.name", type: "text" },
    { key: "unit", label: "plan.label.unit", type: "text" },
    { key: "sellingPrice", label: "plan.label.sellingPrice", type: "number" },
    { key: "purchasePrice", label: "plan.label.purchasePrice", type: "number" },
    { key: "openingStock", label: "plan.label.openingStock", type: "number" },
  ],
  CREATE_REMINDER: [{ key: "reminderTitle", label: "plan.label.reminder", type: "text" }],
  COMPLETE_REMINDER: [{ key: "targetId", label: "plan.label.target", type: "text" }],
  VOID_SALE: [{ key: "targetId", label: "plan.label.target", type: "text" }],
  VOID_EXPENSE: [{ key: "targetId", label: "plan.label.target", type: "text" }],
  VOID_PAYMENT: [{ key: "targetId", label: "plan.label.target", type: "text" }],
};

function displayLabel(label: string, t: (k: TranslationKey) => string): string {
  const k = DISPLAY_LABEL[label];
  return k ? t(k) : label;
}

export function PlanCard({
  plan,
  busy,
  onConfirm,
  onCancel,
}: {
  plan: AssistantPlan;
  busy: boolean;
  onConfirm: (actionId: string, patch: Partial<PlanPayload>) => void;
  onCancel: (actionId: string) => void;
}) {
  const { t, tParams } = useLanguage();
  const symbol = useCurrencySymbol();
  const [patch, setPatch] = useState<Partial<PlanPayload>>({});

  const needs = new Set(plan.requires);
  const specs = EDITABLE[plan.action] ?? [];
  const wantsCreate = patch.createMissing ?? {};

  const val = (key: keyof PlanPayload & keyof PlanValues): number | string | null | undefined => {
    const p = patch[key];
    if (p !== undefined && p !== null) return p as number | string;
    return plan.values?.[key] ?? undefined;
  };
  const num = (key: keyof PlanPayload & keyof PlanValues): number | undefined => {
    const v = val(key);
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && v !== "" && v !== undefined && v !== null ? n : undefined;
  };
  const str = (key: keyof PlanPayload & keyof PlanValues): string => {
    const v = val(key);
    return v === undefined || v === null ? "" : String(v);
  };
  const setVal = (key: keyof PlanPayload, v: unknown) =>
    setPatch((prev) => ({ ...prev, [key]: v }));
  const toggleCreate = (kind: EntityKind) =>
    setPatch((prev) => ({
      ...prev,
      createMissing: { ...prev.createMissing, [kind]: !prev.createMissing?.[kind] },
    }));

  const candidateGroups = Object.entries(plan.candidates).filter(
    ([, list]) => list && list.length > 0,
  ) as Array<["customers" | "products" | "suppliers", Candidate[]]>;

  const missingEntity = (kind: EntityKind) =>
    needs.has(kind) && !patch[`${kind}Id` as keyof PlanPayload] && !wantsCreate[kind];

  // Live total for a sale so the owner sees the effect of their edits.
  const liveTotal =
    plan.action === "CREATE_SALE"
      ? (() => {
          const qty = num("quantity") ?? 0;
          const price = num("unitPrice") ?? 0;
          const discount = num("discountAmount") ?? 0;
          return qty > 0 && price > 0 ? Math.round((qty * price - discount) * 100) / 100 : undefined;
        })()
      : undefined;

  const editableKeys = new Set<string>(specs.map((s) => s.key));
  const readonlyFields = plan.fields.filter((field) => {
    const key = LABEL_TO_VALUE_KEY[field.label];
    if (key && editableKeys.has(key)) return false;
    if (plan.action === "CREATE_SALE" && field.label === "Total") return false;
    return true;
  });

  const blocked =
    missingEntity("customer") ||
    missingEntity("product") ||
    missingEntity("supplier") ||
    (needs.has("quantity") && !((num("quantity") ?? 0) > 0)) ||
    (needs.has("amount") && num("amount") === undefined) ||
    (needs.has("paidAmount") && num("paidAmount") === undefined) ||
    (needs.has("unitPrice") && num("unitPrice") === undefined && num("sellingPrice") === undefined && num("unitCost") === undefined) ||
    (needs.has("name") && !str("name") && !str("expenseName") && !str("reminderTitle")) ||
    (needs.has("targetId") && !str("targetId"));

  return (
    <div className="rounded-2xl rounded-es-sm border border-line bg-surface px-3 py-3 text-sm shadow-card">
      <p className="font-semibold text-ink">{plan.summary}</p>
      {plan.usedContext ? (
        <p className="mt-0.5 text-xs text-ink-subtle">{t("plan.usingLastCustomer")}</p>
      ) : null}

      {readonlyFields.length > 0 ? (
        <dl className="mt-2 space-y-1">
          {readonlyFields.map((field) => (
            <div key={field.label} className="flex justify-between gap-3">
              <dt className="text-ink-subtle">{displayLabel(field.label, t)}</dt>
              <dd className="text-right font-medium text-ink">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {plan.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1 rounded-lg bg-warning-soft p-2 text-xs text-warning-ink">
          {plan.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {candidateGroups.map(([group, list]) => {
        const { payload: key, create } = CANDIDATE_KEY[group];
        const selectedId = patch[key] as string | undefined;
        return (
          <div key={group} className="mt-2">
            <p className="text-xs font-medium text-ink-subtle">
              {t(
                group === "customers"
                  ? "plan.pickCustomer"
                  : group === "products"
                    ? "plan.pickProduct"
                    : "plan.pickSupplier",
              )}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {list.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() =>
                    setPatch((p) => ({
                      ...p,
                      [key]: candidate.id,
                      createMissing: { ...p.createMissing, [create]: false },
                    }))
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    selectedId === candidate.id
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-line-strong bg-surface",
                  )}
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* One-tap create for a named-but-missing entity. */}
      {plan.missing && (plan.missing.product || plan.missing.customer || plan.missing.supplier) ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {plan.missing.customer ? (
            <button
              type="button"
              onClick={() => toggleCreate("customer")}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                wantsCreate.customer ? "border-brand-600 bg-brand-600 text-white" : "border-brand-600 text-brand-700",
              )}
            >
              <Plus className="h-3 w-3" />
              {tParams("plan.createCustomer", { name: plan.missing.customer })}
            </button>
          ) : null}
          {plan.missing.product ? (
            <button
              type="button"
              onClick={() => toggleCreate("product")}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                wantsCreate.product ? "border-brand-600 bg-brand-600 text-white" : "border-brand-600 text-brand-700",
              )}
            >
              <Plus className="h-3 w-3" />
              {tParams("plan.createProduct", { name: plan.missing.product })}
            </button>
          ) : null}
          {plan.missing.supplier ? (
            <button
              type="button"
              onClick={() => toggleCreate("supplier")}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                wantsCreate.supplier ? "border-brand-600 bg-brand-600 text-white" : "border-brand-600 text-brand-700",
              )}
            >
              <Plus className="h-3 w-3" />
              {tParams("plan.createSupplier", { name: plan.missing.supplier })}
            </button>
          ) : null}
          {wantsCreate.customer || wantsCreate.product || wantsCreate.supplier ? (
            <span className="w-full text-[11px] text-ink-subtle">{t("plan.willCreate")}</span>
          ) : null}
        </div>
      ) : null}

      {/* Editable parsed values. */}
      {specs.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs font-medium text-ink-subtle">{t("plan.editValues")}</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {specs.map((spec) => (
              <label key={String(spec.key)} className="block">
                <span className="text-[11px] text-ink-subtle">{t(spec.label)}</span>
                <input
                  type={spec.type === "number" ? "number" : "text"}
                  inputMode={spec.type === "number" ? "decimal" : undefined}
                  value={str(spec.key)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (spec.type === "number") {
                      setVal(spec.key, raw === "" ? undefined : Number.isFinite(Number(raw)) ? Number(raw) : undefined);
                    } else {
                      setVal(spec.key, raw);
                    }
                  }}
                  className="mt-0.5 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {liveTotal !== undefined ? (
        <div className="mt-2 flex justify-between gap-3">
          <span className="text-ink-subtle">{t("plan.label.total")}</span>
          <span className="font-medium text-ink">{money(liveTotal, symbol)}</span>
        </div>
      ) : null}

      {needs.has("paidAmount") && !specs.some((s) => s.key === "paidAmount") ? (
        <div className="mt-2">
          <p className="text-xs font-medium text-ink-subtle">{t("plan.howMuchPaid")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {plan.suggested?.paidAmount !== undefined ? (
              <button
                type="button"
                onClick={() => setPatch((p) => ({ ...p, paidAmount: plan.suggested!.paidAmount }))}
                className="rounded-full border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-medium text-white"
              >
                {tParams("plan.fullPayment", { amount: money(plan.suggested.paidAmount, symbol) })}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPatch((p) => ({ ...p, paidAmount: 0 }))}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium",
                patch.paidAmount === 0
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-line-strong bg-surface",
              )}
            >
              {t("plan.onCredit")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy || blocked}
          onClick={() => onConfirm(plan.actionId, patch)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white",
            (busy || blocked) && "opacity-50",
          )}
        >
          <Check className="h-4 w-4" />
          {t("plan.confirm")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onCancel(plan.actionId)}
          className="rounded-xl border border-line-strong px-3 py-2 text-sm font-medium"
        >
          {t("plan.cancel")}
        </button>
      </div>
    </div>
  );
}
