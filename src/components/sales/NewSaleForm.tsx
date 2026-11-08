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
import { BatchPicker } from "@/components/sales/BatchPicker";
import { StickyFormActions } from "@/components/ui/StickyFormActions";
import { Money } from "@/components/shared/Money";
import { useCreateSale } from "@/hooks/use-sales";
import { useCustomer } from "@/hooks/use-customers";
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
  batchId: string | null;  // which purchase batch to sell from (null = opening stock)
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
  const [discountAmount, setDiscountAmount] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [customerError, setCustomerError] = useState<string | null>(null);

  // Pre-fill customer from ?customerId=... (e.g. when tapping "New Sale" from a customer's khata page)
  const customerIdParam = searchParams.get("customerId");
  const { data: prefilledCustomer } = useCustomer(customerIdParam);
  useEffect(() => {
    if (prefilledCustomer && !customer) {
      setCustomer({
        id: prefilledCustomer.id,
        name: prefilledCustomer.name,
        companyName: prefilledCustomer.companyName,
        phone: prefilledCustomer.phone ?? "",
        balance: prefilledCustomer.balance,
      });
    }
  }, [prefilledCustomer, customer]);

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

    const discount = parseDecimalSafe(discountAmount || "0");
    // Clamp only for display; validation below blocks a real over-discount.
    const discountClamped = discount.lt(0)
      ? new Decimal(0)
      : discount.gt(grandTotal)
        ? grandTotal
        : discount;
    const netTotal = grandTotal.minus(discountClamped);
    const paid = parseDecimalSafe(paidAmount || "0");
    const paidClamped = paid.gt(netTotal) ? netTotal : paid;
    const outstanding = netTotal.minus(paidClamped);

    return {
      lineTotals,
      grandTotal,
      discount: discountClamped,
      netTotal,
      paid: paidClamped,
      outstanding,
    };
  }, [items, paidAmount, discountAmount]);

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
        batchId: null, // will be auto-set by BatchPicker's useEffect to oldest batch (FIFO)
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
      discount?: string;
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

    const discount = parseDecimalSafe(discountAmount || "0");
    if (discount.lt(0) || !discount.isFinite()) {
      errors.discount = t("sale.discountNotNegative");
    } else if (discount.gt(totals.grandTotal)) {
      errors.discount = t("sale.discountExceedsTotal");
    }

    const paid = parseDecimalSafe(paidAmount || "0");
    if (paid.lt(0) || !paid.isFinite()) {
      errors.paidAmount = t("sale.paidNotNegative");
    } else if (paid.gt(totals.netTotal)) {
      errors.paidAmount = t("sale.paidExceedsTotal");
    }

    return errors;
  }, [customer, items, paidAmount, discountAmount, totals.grandTotal, totals.netTotal]);

  const hasBlockingErrors =
    !!validation.customer ||
    !!validation.items ||
    !!validation.paidAmount ||
    !!validation.discount ||
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
          batchId: i.batchId,
        })),
        paidAmount: paidAmount || "0",
        discountAmount: discountAmount || "0",
        paymentMethod: "cash",
        notes: notes.trim() || null,
        dueDate: dueDate || null,
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
        <h2 className="px-1 text-sm font-semibold text-ink-muted">
          <span dir="ltr">1.</span> {t("sale.customer")}
        </h2>
        <CustomerPicker
          selected={customer}
          onSelect={setCustomer}
          error={customerError}
        />
      </section>

      {/* Line items section */}
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-ink-muted">
          <span dir="ltr">2.</span> {t("sale.products")}
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
                  className="rounded-card border border-line bg-surface shadow-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {item.productName}
                      </p>
                      <p className="text-[11px] text-ink-subtle">
                        {formatQuantity(item.currentStock, item.productUnit)} {t("stock.inStock")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger-ink"
                      aria-label={t("sale.removeItem")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[11px] font-medium text-ink-muted">
                        {t("sale.quantity")}
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                        className={`w-full rounded-md border bg-surface px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 ${
                          itemErr.quantity
                            ? "border-danger/40 focus:border-danger focus:ring-danger/30"
                            : "border-line-strong focus:border-brand-500 focus:ring-brand-500/30"
                        }`}
                      />
                      {itemErr.quantity ? (
                        <p className="mt-0.5 text-[10px] text-danger-ink">{itemErr.quantity}</p>
                      ) : null}
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[11px] font-medium text-ink-muted">
                        {t("sale.unitPrice")} ({item.productUnit})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                        className={`w-full rounded-md border bg-surface px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 ${
                          itemErr.unitPrice
                            ? "border-danger/40 focus:border-danger focus:ring-danger/30"
                            : "border-line-strong focus:border-brand-500 focus:ring-brand-500/30"
                        }`}
                      />
                      {itemErr.unitPrice ? (
                        <p className="mt-0.5 text-[10px] text-danger-ink">{itemErr.unitPrice}</p>
                      ) : null}
                    </div>
                  </div>

                  {/* Batch picker — which purchase batch to sell from.
                      Shows available batches with their buy price + remaining qty.
                      Defaults to oldest (FIFO). Lets user pick a different one. */}
                  <div className="mt-2">
                    <BatchPicker
                      productId={item.productId}
                      productUnit={item.productUnit}
                      selectedBatchId={item.batchId}
                      onChange={(batchId) => updateItem(idx, { batchId })}
                      requestedQuantity={item.quantity}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                    <span className="text-[11px] text-ink-subtle">{t("sale.lineTotal")}</span>
                    <span className="text-sm font-semibold tabular-nums text-ink">
                      <Money value={lineTotal.toString()} />
                    </span>
                  </div>

                  {overSelling ? (
                    <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-warning-soft px-2 py-1 text-[11px] text-warning-ink">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{itemErr.stock}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-center">
            <ShoppingCart className="mx-auto h-5 w-5 text-ink-faint" />
            <p className="mt-1 text-xs text-ink-subtle">
              {t("sale.noProductsAdded")}
            </p>
          </div>
        )}

        {validation.items ? (
          <p className="px-1 text-xs text-danger-ink">{validation.items}</p>
        ) : null}
      </section>

      {/* Payment section */}
      {items.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-ink-muted">
            <span dir="ltr">3.</span> {t("sale.payment")}
          </h2>

          <div className="rounded-card border border-line bg-surface shadow-card p-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-ink-subtle">
                <span>{t("sale.itemsTotal")}</span>
                <span className="tabular-nums">
                  <Money value={totals.grandTotal.toString()} />
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">
                  {t("sale.discount")}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  placeholder="0"
                  className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 ${
                    validation.discount
                      ? "border-danger/40 focus:border-danger focus:ring-danger/30"
                      : "border-line-strong focus:border-brand-500 focus:ring-brand-500/30"
                  }`}
                />
                {validation.discount ? (
                  <p className="mt-1 text-xs text-danger-ink">{validation.discount}</p>
                ) : null}
              </div>

              <div className="flex items-center justify-between border-t border-line pt-1.5">
                <span className="text-ink-muted">{t("sale.total")}</span>
                <span className="font-bold tabular-nums text-ink">
                  <Money value={totals.netTotal.toString()} />
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">
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
                  className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 ${
                    validation.paidAmount
                      ? "border-danger/40 focus:border-danger focus:ring-danger/30"
                      : "border-line-strong focus:border-brand-500 focus:ring-brand-500/30"
                  }`}
                />
                {validation.paidAmount ? (
                  <p className="mt-1 text-xs text-danger-ink">{validation.paidAmount}</p>
                ) : null}
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaidAmount(totals.netTotal.toString())}
                    className="rounded-md bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
                  >
                    {t("sale.fullPayment")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaidAmount("0")}
                    className="rounded-md bg-surface-2 px-2 py-1 text-[11px] font-medium text-ink-muted hover:bg-surface-2"
                  >
                    {t("sale.creditOnly")}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-line pt-1.5">
                <span className="text-ink-muted">{t("sale.outstanding")}</span>
                <span className="font-bold tabular-nums text-danger-ink">
                  <Money value={totals.outstanding.toString()} />
                </span>
              </div>

              <div className="border-t border-line pt-1.5">
                <label className="mb-1 block text-xs font-medium text-ink-muted">
                  {t("sale.dueDate")}
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
                <p className="mt-1 text-[11px] text-ink-faint">{t("sale.dueDateHint")}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block px-1 text-xs font-medium text-ink-muted">
              {t("sale.saleNotes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("sale.saleNotesPlaceholder")}
              rows={2}
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          {/* Stock warning banner */}
          {hasStockWarnings ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning-ink">
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
