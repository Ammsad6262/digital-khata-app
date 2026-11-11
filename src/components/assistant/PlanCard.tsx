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

import { useEffect, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import type { TranslationKey } from "@/lib/i18n/translations";
import type {
  ActionKind,
  AssistantPlan,
  PaymentMethod,
  PlanPayload,
  PlanValues,
} from "@/lib/assistant/types";

function money(value: number | undefined, symbol = "Rs.") {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${symbol} ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

type EntityKind = "customer" | "product" | "supplier";

const ENTITY_GROUP: Record<EntityKind, "customers" | "products" | "suppliers"> = {
  customer: "customers",
  product: "products",
  supplier: "suppliers",
};

const ENTITY_ID_KEY: Record<EntityKind, "customerId" | "productId" | "supplierId"> = {
  customer: "customerId",
  product: "productId",
  supplier: "supplierId",
};

const ENTITY_NAME_KEY: Record<EntityKind, "customerName" | "productName" | "supplierName"> = {
  customer: "customerName",
  product: "productName",
  supplier: "supplierName",
};

const ENTITY_LABEL: Record<EntityKind, TranslationKey> = {
  customer: "plan.label.customer",
  product: "plan.label.product",
  supplier: "plan.label.supplier",
};

/** Field label used by the server for the resolved entity's display name. */
const ENTITY_FIELD: Record<EntityKind, string> = {
  customer: "Customer",
  product: "Product",
  supplier: "Supplier",
};

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "bank", "cheque", "jazzcash", "easypaisa", "other"];

/** Actions that always involve an entity, even when it already resolved. */
const ENTITY_ACTIONS: Record<EntityKind, ActionKind[]> = {
  customer: ["CREATE_SALE", "RECORD_PAYMENT"],
  product: ["CREATE_SALE", "CREATE_PURCHASE", "ADD_STOCK"],
  supplier: ["CREATE_PURCHASE", "SUPPLIER_PAYMENT"],
};

type EntityOption = {
  id: string;
  name: string;
  unit?: string;
  phone?: string | null;
  sellingPrice?: string | number | null;
  purchasePrice?: string | number | null;
};
type EntityOptions = {
  customers: EntityOption[];
  products: EntityOption[];
  suppliers: EntityOption[];
};
const EMPTY_OPTIONS: EntityOptions = { customers: [], products: [], suppliers: [] };

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

type Spec = { key: keyof PlanPayload & keyof PlanValues; label: TranslationKey; type: "number" | "text" | "method" };

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
    { key: "method", label: "plan.label.method", type: "method" },
  ],
  SUPPLIER_PAYMENT: [
    { key: "amount", label: "plan.label.amount", type: "number" },
    { key: "method", label: "plan.label.method", type: "method" },
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
  const { t, tParams, lang } = useLanguage();
  const symbol = useCurrencySymbol();
  const [patch, setPatch] = useState<Partial<PlanPayload>>({});

  // Rule-built summaries are English; show a localised heading instead when the
  // owner is reading the app in another language. The values below are fields.
  const heading = lang === "en" ? plan.summary : t(`plan.title.${plan.action}` as TranslationKey);

  const needs = new Set(plan.requires);
  const specs = EDITABLE[plan.action] ?? [];
  const wantsCreate = patch.createMissing ?? {};

  // A cleared field stores "" (a sentinel) rather than undefined, so it does not
  // silently fall back to the value the server first parsed.
  const val = (key: keyof PlanPayload & keyof PlanValues): number | string | null | undefined => {
    const p = patch[key];
    if (p !== undefined && p !== null) return p as number | string;
    return plan.values?.[key] ?? undefined;
  };
  const num = (key: keyof PlanPayload & keyof PlanValues): number | undefined => {
    const v = val(key);
    if (v === "" || v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const str = (key: keyof PlanPayload & keyof PlanValues): string => {
    const v = val(key);
    return v === undefined || v === null ? "" : String(v);
  };
  const setVal = (key: keyof PlanPayload, v: unknown) =>
    setPatch((prev) => ({ ...prev, [key]: v }));
  const toggleCreate = (kind: EntityKind) =>
    setPatch((prev) => {
      const on = !prev.createMissing?.[kind];
      return {
        ...prev,
        // "" clears the resolved id on the server (creating instead); when the
        // chip is turned off, undefined falls back to the resolved entity.
        [ENTITY_ID_KEY[kind]]: on ? "" : undefined,
        createMissing: { ...prev.createMissing, [kind]: on },
      };
    });

  const entityKinds = (["customer", "product", "supplier"] as EntityKind[]).filter(
    (kind) =>
      ENTITY_ACTIONS[kind].includes(plan.action) ||
      needs.has(kind) ||
      Boolean(plan.values?.[ENTITY_ID_KEY[kind]]) ||
      Boolean(plan.missing?.[kind]) ||
      (plan.candidates[ENTITY_GROUP[kind]]?.length ?? 0) > 0,
  );

  const [options, setOptions] = useState<EntityOptions>(EMPTY_OPTIONS);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [optionsVersion, setOptionsVersion] = useState(0);

  // One request per plan gives every existing customer/product/supplier, so the
  // owner changes the entity with a picker instead of retyping a name.
  useEffect(() => {
    if (entityKinds.length === 0) return;
    let alive = true;
    setOptionsFailed(false);
    fetch("/api/assistant/options", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: { data?: Partial<EntityOptions> } | null) => {
        if (!alive) return;
        setOptions({
          customers: json?.data?.customers ?? [],
          products: json?.data?.products ?? [],
          suppliers: json?.data?.suppliers ?? [],
        });
      })
      .catch(() => {
        if (alive) setOptionsFailed(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.actionId, optionsVersion]);

  const selectedId = (kind: EntityKind): string =>
    (patch[ENTITY_ID_KEY[kind]] as string | undefined) ??
    plan.values?.[ENTITY_ID_KEY[kind]] ??
    "";
  const entityName = (kind: EntityKind): string =>
    str(ENTITY_NAME_KEY[kind]) || plan.missing?.[kind] || "";
  const entitySatisfied = (kind: EntityKind): boolean => {
    if (selectedId(kind)) return true;
    if (wantsCreate[kind]) return entityName(kind).trim().length > 0;
    return false;
  };
  // A required entity is satisfied by an id or by an explicit create + name.
  const missingEntity = (kind: EntityKind): boolean =>
    entityKinds.includes(kind) && !entitySatisfied(kind);

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
    // The picker below shows the current choice; keep the stale parsed name out
    // of the read-only list so changing the customer/product is not confusing.
    if (
      (field.label === "Customer" && entityKinds.includes("customer")) ||
      (field.label === "Product" && entityKinds.includes("product")) ||
      (field.label === "Supplier" && entityKinds.includes("supplier"))
    ) {
      return false;
    }
    return true;
  });

  const paidNow = num("paidAmount");
  // After the owner edits quantity/price, "Full payment" must mean the new
  // total, not the one parsed before the edit.
  const fullPaymentAmount = liveTotal ?? plan.suggested?.paidAmount;
  // Whatever "Paid now" shows is what the owner is confirming. Send it
  // explicitly so an untouched default (the full sale total) is not lost, and
  // so editing quantity/price cannot silently change the paid amount after the
  // screen showed a different number.
  const confirmPatch: Partial<PlanPayload> = { ...patch };
  if (paidNow !== undefined && confirmPatch.paidAmount === undefined) {
    confirmPatch.paidAmount = paidNow;
  }

  const blocked =
    missingEntity("customer") ||
    missingEntity("product") ||
    missingEntity("supplier") ||
    (needs.has("quantity") && !((num("quantity") ?? 0) > 0)) ||
    (needs.has("amount") && !((num("amount") ?? 0) > 0)) ||
    (needs.has("paidAmount") && (paidNow === undefined || paidNow < 0)) ||
    (needs.has("unitPrice") &&
      num("unitPrice") === undefined &&
      num("sellingPrice") === undefined &&
      num("unitCost") === undefined) ||
    (needs.has("name") && !str("name") && !str("expenseName") && !str("reminderTitle")) ||
    (needs.has("targetId") && !str("targetId")) ||
    (plan.action === "CREATE_SALE" &&
      liveTotal !== undefined &&
      paidNow !== undefined &&
      paidNow > liveTotal);

  return (
    <div
      key={plan.actionId}
      className="rounded-2xl rounded-es-sm border border-line bg-surface px-3 py-3 text-sm shadow-card"
    >
      <p className="break-words font-semibold text-ink">{heading}</p>
      {plan.usedContext ? (
        <p className="mt-0.5 text-xs text-ink-subtle">{t("plan.usingLastCustomer")}</p>
      ) : null}

      {readonlyFields.length > 0 ? (
        <dl className="mt-2 space-y-1">
          {readonlyFields.map((field) => (
            <div key={field.label} className="flex justify-between gap-3">
              <dt className="text-ink-subtle">{displayLabel(field.label, t)}</dt>
              <dd className="min-w-0 break-words text-right font-medium text-ink">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {plan.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1 rounded-lg bg-warning-soft p-2 text-xs text-warning-ink">
          {plan.warnings.map((warning, index) => {
            const entry = plan.warningKeys?.[index];
            const text =
              entry && entry.key
                ? tParams(entry.key as TranslationKey, entry.params ?? {})
                : (entry?.text ?? warning);
            return <li key={index}>{text}</li>;
          })}
        </ul>
      ) : null}

      {/* Customer / product / supplier pickers. Every existing record is in the
          list, so changing an entity never means retyping its name. */}
      {entityKinds.length > 0 ? (
        <div className="mt-2 space-y-2">
          {entityKinds.map((kind) => {
            const group = ENTITY_GROUP[kind];
            const list = options[group];
            // Put the server's candidates at the top of the dropdown; the rest
            // stay available for a manual change.
            const candidateIds = new Set(
              (plan.candidates[group] ?? []).map((candidate) => candidate.id),
            );
            const ordered = [...list].sort(
              (a, b) =>
                Number(candidateIds.has(b.id)) - Number(candidateIds.has(a.id)) ||
                a.name.localeCompare(b.name),
            );
            const id = selectedId(kind);
            const creating = !!wantsCreate[kind];
            const spoken = plan.missing?.[kind] ?? entityName(kind);
            const resolvedName = id
              ? (list.find((option) => option.id === id)?.name ??
                plan.candidates[group]?.find((candidate) => candidate.id === id)?.name ??
                plan.fields.find((field) => field.label === ENTITY_FIELD[kind])?.value ??
                "")
              : "";

            return (
              <div key={kind}>
                <label className="block">
                  <span className="text-xs font-medium text-ink-subtle">
                    {t(ENTITY_LABEL[kind])}
                  </span>
                  <div className="relative mt-0.5">
                    <select
                      value={creating ? "__new__" : id}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "__new__") {
                          setPatch((p) => ({
                            ...p,
                            [ENTITY_ID_KEY[kind]]: "",
                            createMissing: { ...p.createMissing, [kind]: true },
                          }));
                        } else if (value === "") {
                          setPatch((p) => ({ ...p, [ENTITY_ID_KEY[kind]]: "" }));
                        } else {
                          const picked = list.find((option) => option.id === value);
                          setPatch((p) => {
                            const next: Partial<PlanPayload> = {
                              ...p,
                              [ENTITY_ID_KEY[kind]]: value,
                              createMissing: { ...p.createMissing, [kind]: false },
                            };
                            // Choosing a different product brings its catalog
                            // unit and price, so the card does not keep the
                            // previous product's rate.
                            if (kind === "product" && picked) {
                              const selling =
                                picked.sellingPrice != null ? Number(picked.sellingPrice) : NaN;
                              const purchase =
                                picked.purchasePrice != null ? Number(picked.purchasePrice) : NaN;
                              if (Number.isFinite(selling) && selling > 0) next.unitPrice = selling;
                              if (Number.isFinite(purchase) && purchase > 0) next.unitCost = purchase;
                              if (picked.unit) next.unit = picked.unit;
                            }
                            return next;
                          });
                        }
                      }}
                      className="w-full appearance-none rounded-lg border border-line-strong bg-surface px-2 py-1.5 pe-8 text-sm"
                    >
                      {!id && !creating ? (
                        <option value="">{t("plan.chooseEntity")}</option>
                      ) : null}
                      {id && !list.some((option) => option.id === id) ? (
                        <option value={id}>{resolvedName || "—"}</option>
                      ) : null}
                      {ordered.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                          {option.phone ? ` · ${option.phone}` : ""}
                          {option.unit ? ` · ${option.unit}` : ""}
                        </option>
                      ))}
                      <option value="__new__">
                        {spoken
                          ? tParams("plan.createNewNamed", { name: spoken })
                          : t("plan.createNew")}
                      </option>
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
                      aria-hidden
                    />
                  </div>
                </label>
                {creating ? (
                  <input
                    type="text"
                    dir="auto"
                    value={entityName(kind)}
                    onChange={(e) => {
                      const name = e.target.value;
                      setPatch((p) => ({
                        ...p,
                        [ENTITY_NAME_KEY[kind]]: name,
                        createMissing: { ...p.createMissing, [kind]: name.trim().length > 0 },
                      }));
                    }}
                    placeholder={t("plan.newEntityName")}
                    className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm"
                  />
                ) : null}
              </div>
            );
          })}
          {optionsFailed ? (
            <button
              type="button"
              onClick={() => setOptionsVersion((version) => version + 1)}
              className="text-[11px] font-medium text-brand-700 underline"
            >
              {t("plan.optionsFailed")}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* One-tap create for a named-but-missing entity. */}
      {plan.missing && (plan.missing.product || plan.missing.customer || plan.missing.supplier) ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {plan.missing.customer ? (
            <button
              type="button"
              aria-pressed={!!wantsCreate.customer}
              onClick={() => toggleCreate("customer")}
              className={cn(
                "flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-1 text-xs font-medium",
                wantsCreate.customer ? "border-brand-600 bg-brand-600 text-white" : "border-brand-600 text-brand-700",
              )}
            >
              <Plus className="h-3 w-3 shrink-0" />
              {tParams("plan.createCustomer", { name: plan.missing.customer })}
            </button>
          ) : null}
          {plan.missing.product ? (
            <button
              type="button"
              aria-pressed={!!wantsCreate.product}
              onClick={() => toggleCreate("product")}
              className={cn(
                "flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-1 text-xs font-medium",
                wantsCreate.product ? "border-brand-600 bg-brand-600 text-white" : "border-brand-600 text-brand-700",
              )}
            >
              <Plus className="h-3 w-3 shrink-0" />
              {tParams("plan.createProduct", { name: plan.missing.product })}
            </button>
          ) : null}
          {plan.missing.supplier ? (
            <button
              type="button"
              aria-pressed={!!wantsCreate.supplier}
              onClick={() => toggleCreate("supplier")}
              className={cn(
                "flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-1 text-xs font-medium",
                wantsCreate.supplier ? "border-brand-600 bg-brand-600 text-white" : "border-brand-600 text-brand-700",
              )}
            >
              <Plus className="h-3 w-3 shrink-0" />
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
          <div className="mt-1 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
            {specs.map((spec) => (
              <label key={String(spec.key)} className="block">
                <span className="text-[11px] text-ink-subtle">{t(spec.label)}</span>
                {spec.type === "method" ? (
                  <select
                    value={str(spec.key) || "cash"}
                    onChange={(e) => setVal(spec.key, e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {t(`method.${method}` as TranslationKey)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={spec.type === "number" ? "number" : "text"}
                    inputMode={spec.type === "number" ? "decimal" : undefined}
                    dir={spec.type === "number" ? "ltr" : "auto"}
                    value={str(spec.key)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (spec.type === "number") {
                        setVal(spec.key, raw === "" ? "" : Number.isFinite(Number(raw)) ? Number(raw) : "");
                      } else {
                        setVal(spec.key, raw);
                      }
                    }}
                    className="mt-0.5 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm"
                  />
                )}
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

      {/* One-tap payment amount for the two actions that carry money. */}
      {plan.action === "CREATE_SALE" || plan.action === "CREATE_PURCHASE" ? (
        <div className="mt-2">
          <p className="text-xs font-medium text-ink-subtle">{t("plan.howMuchPaid")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {fullPaymentAmount !== undefined ? (
              <button
                type="button"
                aria-pressed={paidNow === fullPaymentAmount}
                onClick={() => setPatch((p) => ({ ...p, paidAmount: fullPaymentAmount }))}
                className="rounded-full border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-medium text-white"
              >
                {tParams("plan.fullPayment", { amount: money(fullPaymentAmount, symbol) })}
              </button>
            ) : null}
            <button
              type="button"
              aria-pressed={paidNow === 0}
              onClick={() => setPatch((p) => ({ ...p, paidAmount: 0 }))}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium",
                paidNow === 0 ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-surface",
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
          onClick={() => onConfirm(plan.actionId, confirmPatch)}
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
