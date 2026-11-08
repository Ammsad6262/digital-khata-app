"use client";

/**
 * PlanCard — the confirmation card for a prepared write action.
 *
 * Shared by BOTH assistant products (Voice + Khata). It only renders the plan
 * the server prepared and the fields the server says are required; it never
 * calculates a balance or invents a value.
 */

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { AssistantPlan, Candidate, PlanPayload } from "@/lib/assistant/types";

function money(value: number | undefined, symbol = "Rs.") {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${symbol} ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

const CANDIDATE_KEY: Record<"customers" | "products" | "suppliers", keyof PlanPayload> = {
  customers: "customerId",
  products: "productId",
  suppliers: "supplierId",
};

function labelFor(key: string): string {
  switch (key) {
    case "amount":
      return "Amount";
    case "quantity":
      return "Quantity";
    case "unitPrice":
      return "Price";
    case "name":
      return "Name";
    case "unit":
      return "Unit";
    case "targetId":
      return "Record ID";
    default:
      return key;
  }
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
  const [patch, setPatch] = useState<Partial<PlanPayload>>({});
  const [customAmount, setCustomAmount] = useState("");

  const needs = new Set(plan.requires);
  const candidateGroups = Object.entries(plan.candidates).filter(
    ([, list]) => list && list.length > 0,
  ) as Array<["customers" | "products" | "suppliers", Candidate[]]>;

  const blocked =
    (needs.has("customer") && !patch.customerId) ||
    (needs.has("product") && !patch.productId) ||
    (needs.has("supplier") && !patch.supplierId) ||
    (needs.has("paidAmount") && patch.paidAmount === undefined) ||
    (needs.has("amount") && patch.amount === undefined) ||
    (needs.has("quantity") && patch.quantity === undefined) ||
    (needs.has("name") && !patch.name) ||
    (needs.has("targetId") && !patch.targetId);

  return (
    <div className="rounded-2xl rounded-bl-sm border border-line bg-surface px-3 py-3 text-sm shadow-card">
      <p className="font-semibold text-ink">{plan.summary}</p>
      {plan.usedContext ? (
        <p className="mt-0.5 text-xs text-ink-subtle">Using your last customer</p>
      ) : null}

      <dl className="mt-2 space-y-1">
        {plan.fields.map((field) => (
          <div key={field.label} className="flex justify-between gap-3">
            <dt className="text-ink-subtle">{field.label}</dt>
            <dd className="text-right font-medium text-ink">{field.value}</dd>
          </div>
        ))}
      </dl>

      {plan.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1 rounded-lg bg-warning-soft p-2 text-xs text-warning-ink">
          {plan.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {candidateGroups.map(([group, list]) => {
        const key = CANDIDATE_KEY[group];
        const selectedId = patch[key] as string | undefined;
        return (
          <div key={group} className="mt-2">
            <p className="text-xs font-medium text-ink-subtle">Pick {group.slice(0, -1)}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {list.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setPatch((p) => ({ ...p, [key]: candidate.id }))}
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

      {needs.has("paidAmount") ? (
        <div className="mt-2">
          <p className="text-xs font-medium text-ink-subtle">How much did they pay?</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {plan.suggested?.paidAmount !== undefined ? (
              <button
                type="button"
                onClick={() => setPatch((p) => ({ ...p, paidAmount: plan.suggested!.paidAmount }))}
                className="rounded-full border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-medium text-white"
              >
                Full payment ({money(plan.suggested.paidAmount)})
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
              On credit
            </button>
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={customAmount}
            placeholder="Or type an amount"
            onChange={(e) => {
              setCustomAmount(e.target.value);
              const value = Number(e.target.value);
              setPatch((p) => ({ ...p, paidAmount: Number.isFinite(value) ? value : undefined }));
            }}
            className="mt-1 w-full rounded-lg border border-line-strong px-2 py-1.5 text-sm"
          />
        </div>
      ) : null}

      {(["amount", "quantity", "unitPrice"] as const)
        .filter((key) => needs.has(key))
        .map((key) => (
          <div key={key} className="mt-2">
            <p className="text-xs font-medium text-ink-subtle">{labelFor(key)}</p>
            <input
              type="number"
              inputMode="decimal"
              onChange={(e) => {
                const value = Number(e.target.value);
                setPatch((p) => ({ ...p, [key]: Number.isFinite(value) ? value : undefined }));
              }}
              className="mt-1 w-full rounded-lg border border-line-strong px-2 py-1.5 text-sm"
            />
          </div>
        ))}

      {(["name", "unit", "targetId"] as const)
        .filter((key) => needs.has(key))
        .map((key) => (
          <div key={key} className="mt-2">
            <p className="text-xs font-medium text-ink-subtle">{labelFor(key)}</p>
            <input
              type="text"
              onChange={(e) => setPatch((p) => ({ ...p, [key]: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-line-strong px-2 py-1.5 text-sm"
            />
          </div>
        ))}

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
          Confirm
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onCancel(plan.actionId)}
          className="rounded-xl border border-line-strong px-3 py-2 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
