"use client";

/**
 * NewSaleForm — the multi-product sale entry form.
 *
 * Flow:
 *   1. Pick customer (search by name/phone)
 *   2. Add products (search by name/SKU, tap to add to cart)
 *   3. For each line item: quantity + unit price (auto-calc total)
 *   4. See grand total
 *   5. Enter paid amount (defaults to total)
 *   6. See outstanding (total - paid)
 *   7. Save → atomic create (Sale + SaleItems + Payment + Transaction ledger)
 *
 * Validation:
 *   - Customer required
 *   - At least 1 line item required
 *   - Quantity > 0
 *   - Unit price ≥ 0
 *   - Paid amount ≥ 0 and ≤ totalAmount
 *   - Warn (but allow) if selling more than available stock
 *
 * On success: toast + redirect to the new sale's detail page.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { Trash2, AlertTriangle, ShoppingCart } from "lucide-react";
import { CustomerPicker, type SelectedCustomer } from "@/components/sales/CustomerPicker";
import { ProductPicker } from "@/components/sales/ProductPicker";
import { StickyFormActions } from "@/components/ui/StickyFormActions";
import { Money } from "@/components/shared/Money";
import { useCreateSale } from "@/hooks/use-sales";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/utils/api-client";
import { Decimal } from "@/lib/utils/decimal";
import { formatQuantity, formatMoney } from "@/lib/utils/money";
import type { ProductSearchResult } from "@/lib/services/products";
import { useLanguage } from "@/providers/language-provider";

type LineItem = {
  productId: string;
  productName: string;
  productUnit: string;
  currentStock: string;
  sellingPrice: string;
  quantity: string;
  unitPrice: string;
};

export function NewSaleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const createSale = useCreateSale();
  const { t } = useLanguage();

  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [customerError, setCustomerError] = useState<string | null>(null);

  // Pre-fill customer from ?customerId=... (e.g. when tapping "New Sale" from a customer's khata page)
  useEffect(() => {
    const customerId = searchParams.get("customerId");
    if (customerId && !customer) {
      // We can't easily fetch one customer by ID here without a hook; the user
      // will just have to search/select. (A future enhancement could pre-fetch.)
      // For now we just leave the customer empty.
    }
  }, [searchParams, customer]);

  // ── Computed totals ──────────────────────────────────────────────────
  const totals = useMemo(() => {
    let grandTotal = new Decimal(0);
    const lineTotals: Decimal[] = [];

    for (const item of items) {
      const qty = parseDecimalSafe(item.quantity);
      const price = parseDecimalSafe(item.unitPrice);
      const lineTotal = qty.times(price);
      lineTotals.push(lineTotal);
      grandTotal = grandTotal.plus(lineTotal);
    }

    const paid = parseDecimalSafe(paidAmount || "0");
    const paidClamped = paid.gt(grandTotal) ? grandTotal : paid;
    const outstanding = grandTotal.minus(paidClamped);

    return {
      lineTotals,
      grandTotal,
      paid: paidClamped,
      outstanding,
    };
  }, [items, paidAmount]);

  // ── Line item management ─────────────────────────────────────────────
  const addedProductIds = useMemo(
    () => new Set(items.map((i) => i.productId)),
    [items],
  );

  const handleAddProduct = (product: ProductSearchResult) => {
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        productUnit: product.unit,
        currentStock: product.currentStock,
        sellingPrice: product.sellingPrice,
        quantity: "1", // default quantity = 1
        unitPrice: product.sellingPrice, // default to product's selling price
      },
    ]);
  };

  const handleRemoveItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    );
  };

  // ── Validation ───────────────────────────────────────────────────────
  const validation = useMemo(() => {
    const errors: {
      customer?: string;
      items?: string;
      itemErrors: Array<{ quantity?: string; unitPrice?: string; stock?: string }>;
      paidAmount?: string;
    } = { itemErrors: [] };

    if (!customer) {
      errors.customer = t("sale.selectCustomer");
    }

    if (items.length === 0) {
      errors.items = t("sale.addOneProduct");
    }

    items.forEach((item, idx) => {
      const itemErrors: { quantity?: string; unitPrice?: string; stock?: string } = {};
      const qty = parseDecimalSafe(item.quantity);
      const price = parseDecimalSafe(item.unitPrice);
      const stock = parseDecimalSafe(item.currentStock);

      if (!item.quantity || qty.lte(0) || !qty.isFinite()) {
        itemErrors.quantity = t("sale.quantityGtZero");
      }

      if (!item.unitPrice || price.lt(0) || !price.isFinite()) {
        itemErrors.unitPrice = t("sale.priceNotNegative");
      }

      // Stock warning — NOT a hard error (policy: warn but allow).
      // We surface it as a separate non-blocking warning.
      if (qty.gt(stock) && stock.gte(0)) {
        itemErrors.stock = `${t("sale.selling")} ${formatQuantity(qty, item.productUnit)} ${t("sale.butOnly")} ${formatQuantity(stock, item.productUnit)} ${t("stock.inStock")}. ${t("sale.proceedAnyway")}`;
      }

      errors.itemErrors[idx] = itemErrors;
    });

    const paid = parseDecimalSafe(paidAmount || "0");
    if (paid.lt(0) || !paid.isFinite()) {
      errors.paidAmount = t("sale.paidNotNegative");
    } else if (paid.gt(totals.grandTotal)) {
      errors.paidAmount = t("sale.paidExceedsTotal");
    }

    return errors;
  }, [customer, items, paidAmount, totals.grandTotal]);

  const hasBlockingErrors =
    !!validation.customer ||
    !!validation.items ||
    !!validation.paidAmount ||
    validation.itemErrors.some((e) => e.quantity || e.unitPrice);

  const hasStockWarnings = validation.itemErrors.some((e) => e.stock);

  // ── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!customer) {
      setCustomerError(t("sale.selectCustomerFirst"));
      return;
    }
    setCustomerError(null);

    if (hasBlockingErrors) {
      toast.error(t("common.fixErrorsBeforeSaving"));
      return;
    }

    createSale.mutate(
      {
        customerId: customer.id,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        paidAmount: paidAmount || "0",
        paymentMethod: "cash",
        notes: notes.trim() || null,
      },
      {
        onSuccess: (sale) => {
          toast.success(t("sale.saleRecorded"));
          router.push(`/sales/${sale.id}`);
        },
        onError: (error) => {
          const message =
            error instanceof ApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : t("common.failed");
          toast.error(message);
        },
      },
    );
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Customer section */}
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-slate-700">
          1. {t("sale.customer")}
        </h2>
        <CustomerPicker
          selected={customer}
          onSelect={setCustomer}
          error={customerError}
        />
      </section>

      {/* Line items section */}
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-slate-700">
          2. {t("sale.products")}
        </h2>
        <ProductPicker
          alreadyAddedProductIds={addedProductIds}
          onAdd={handleAddProduct}
        />

        {/* Line items list */}
        {items.length > 0 ? (
          <div className="space-y-2 pt-1">
            {items.map((item, idx) => {
              const lineTotal = totals.lineTotals[idx] ?? new Decimal(0);
              const itemErr = validation.itemErrors[idx] ?? {};
              const qty = parseDecimalSafe(item.quantity);
              const stock = parseDecimalSafe(item.currentStock);
              const overSelling = qty.gt(stock) && stock.gte(0);

              return (
                <div
                  key={`${item.productId}-${idx}`}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {item.productName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatQuantity(item.currentStock, item.productUnit)} {t("stock.inStock")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={t("sale.removeItem")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[11px] font-medium text-slate-600">
                        {t("sale.quantity")}
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                        className={`w-full rounded-md border bg-white px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 ${
                          itemErr.quantity
                            ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                            : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/30"
                        }`}
                      />
                      {itemErr.quantity ? (
                        <p className="mt-0.5 text-[10px] text-red-600">{itemErr.quantity}</p>
                      ) : null}
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[11px] font-medium text-slate-600">
                        {t("sale.unitPrice")} ({item.productUnit})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                        className={`w-full rounded-md border bg-white px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 ${
                          itemErr.unitPrice
                            ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                            : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/30"
                        }`}
                      />
                      {itemErr.unitPrice ? (
                        <p className="mt-0.5 text-[10px] text-red-600">{itemErr.unitPrice}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-[11px] text-slate-500">{t("sale.lineTotal")}</span>
                    <span className="text-sm font-semibold tabular-nums text-slate-900">
                      <Money value={lineTotal.toString()} />
                    </span>
                  </div>

                  {overSelling ? (
                    <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{itemErr.stock}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center">
            <ShoppingCart className="mx-auto h-5 w-5 text-slate-300" />
            <p className="mt-1 text-xs text-slate-500">
              {t("sale.noProductsAdded")}
            </p>
          </div>
        )}

        {validation.items ? (
          <p className="px-1 text-xs text-red-600">{validation.items}</p>
        ) : null}
      </section>

      {/* Payment section */}
      {items.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-slate-700">
            3. {t("sale.payment")}
          </h2>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">{t("sale.total")}</span>
                <span className="font-bold tabular-nums text-slate-900">
                  <Money value={totals.grandTotal.toString()} />
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("sale.amountPaidNow")}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0"
                  className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 ${
                    validation.paidAmount
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                      : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/30"
                  }`}
                />
                {validation.paidAmount ? (
                  <p className="mt-1 text-xs text-red-600">{validation.paidAmount}</p>
                ) : null}
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaidAmount(totals.grandTotal.toString())}
                    className="rounded-md bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
                  >
                    {t("sale.fullPayment")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaidAmount("0")}
                    className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
                  >
                    {t("sale.creditOnly")}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
                <span className="text-slate-600">{t("sale.outstanding")}</span>
                <span className="font-bold tabular-nums text-red-600">
                  <Money value={totals.outstanding.toString()} />
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block px-1 text-xs font-medium text-slate-600">
              {t("sale.saleNotes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("sale.saleNotesPlaceholder")}
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          {/* Stock warning banner */}
          {hasStockWarnings ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {t("sale.overSellingBanner")}
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Sticky action bar — always visible at viewport bottom for one-handed use */}
      <StickyFormActions
        onCancel={() => router.back()}
        onSave={handleSubmit}
        saveLabel={t("sale.saveSale")}
        saveDisabled={hasBlockingErrors || items.length === 0}
        isPending={createSale.isPending}
      />
    </div>
  );
}

/** Parse a user-entered decimal string safely. Returns 0 on parse failure. */
function parseDecimalSafe(value: string): Decimal {
  if (!value || value.trim() === "") return new Decimal(0);
  try {
    const d = new Decimal(value);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}
