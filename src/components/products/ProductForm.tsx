"use client";

/**
 * ProductForm — shared between Add Product and Edit Product.
 *
 * Fields:
 *   - Name (required)
 *   - Category (optional)
 *   - Purchase price (required, ≥ 0)
 *   - Selling price (required, ≥ 0)
 *   - Unit (required, default "piece")
 *   - SKU (optional, unique if provided)
 *   - Opening stock (only in create mode — set once at migration)
 *   - Low-stock threshold (default 5)
 *
 * In edit mode:
 *   - openingStock is NOT shown (not updatable; use stock adjustment instead)
 *   - All other fields are editable
 *
 * On success:
 *   - Create: toast + redirect to /more/products/[id]
 *   - Edit: toast + redirect to /more/products/[id]
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { TextField } from "@/components/ui/TextField";
import { TextArea } from "@/components/ui/TextArea";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/providers/toast-provider";
import {
  useCreateProduct,
  useUpdateProduct,
  useProduct,
} from "@/hooks/use-products";
import { ApiError } from "@/lib/utils/api-client";
import { Decimal } from "@/lib/utils/decimal";

const UNITS = ["piece", "kg", "box", "dozen", "litre", "metre", "pack", "bag", "bottle", "carton"];

export function ProductForm({
  mode,
  productId,
}: {
  mode: "create" | "edit";
  productId?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  // In edit mode, fetch the existing product to pre-fill.
  const { data: existing } = useProduct(mode === "edit" ? productId : null);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(productId ?? "");

  const [name, setName] = useState<string>(existing?.name ?? "");
  const [category, setCategory] = useState<string>(existing?.category ?? "");
  const [purchasePrice, setPurchasePrice] = useState<string>(
    existing?.purchasePrice ? existing.purchasePrice.toString() : "",
  );
  const [sellingPrice, setSellingPrice] = useState<string>(
    existing?.sellingPrice ? existing.sellingPrice.toString() : "",
  );
  const [unit, setUnit] = useState<string>(existing?.unit ?? "piece");
  const [sku, setSku] = useState<string>(existing?.sku ?? "");
  const [openingStock, setOpeningStock] = useState<string>("");
  const [lowStockThreshold, setLowStockThreshold] = useState<string>(
    existing?.lowStockThreshold ? existing.lowStockThreshold.toString() : "5",
  );

  // Wait for product data to load before rendering in edit mode.
  if (mode === "edit" && !existing) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  // Validation
  const errors: {
    name?: string;
    purchasePrice?: string;
    sellingPrice?: string;
    unit?: string;
    openingStock?: string;
    lowStockThreshold?: string;
  } = {};

  if (!name.trim()) {
    errors.name = "Name is required.";
  }

  const pp = parseDecimalSafe(purchasePrice);
  if (!purchasePrice || pp.lt(0) || !pp.isFinite()) {
    errors.purchasePrice = "Purchase price must be a non-negative number.";
  }

  const sp = parseDecimalSafe(sellingPrice);
  if (!sellingPrice || sp.lt(0) || !sp.isFinite()) {
    errors.sellingPrice = "Selling price must be a non-negative number.";
  }

  if (!unit.trim()) {
    errors.unit = "Unit is required.";
  }

  if (mode === "create") {
    const os = parseDecimalSafe(openingStock || "0");
    if (openingStock && (os.lt(0) || !os.isFinite())) {
      errors.openingStock = "Opening stock must be a non-negative number.";
    }
  }

  const lst = parseInt(lowStockThreshold, 10);
  if (!Number.isFinite(lst) || lst < 0) {
    errors.lowStockThreshold = "Low-stock threshold must be a non-negative integer.";
  }

  const hasErrors = !!errors.name || !!errors.purchasePrice || !!errors.sellingPrice ||
    !!errors.unit || !!errors.openingStock || !!errors.lowStockThreshold;

  const handleSubmit = () => {
    if (hasErrors) {
      toast.error("Please fix the errors before saving.");
      return;
    }

    if (mode === "create") {
      createProduct.mutate(
        {
          name: name.trim(),
          category: category.trim() || null,
          purchasePrice: pp.toNumber(),
          sellingPrice: sp.toNumber(),
          unit: unit.trim(),
          sku: sku.trim() || null,
          openingStock: openingStock ? parseDecimalSafe(openingStock).toNumber() : 0,
          lowStockThreshold: lst,
        },
        {
          onSuccess: (product) => {
            toast.success(`Product "${product.name}" added`);
            router.push(`/more/products/${product.id}`);
          },
          onError: (error) => {
            if (error instanceof ApiError && error.code === "CONFLICT") {
              toast.error("A product with this SKU already exists.");
            } else {
              toast.error(error instanceof Error ? error.message : "Failed to add product.");
            }
          },
        },
      );
    } else {
      updateProduct.mutate(
        {
          name: name.trim(),
          category: category.trim() || null,
          purchasePrice: pp.toNumber(),
          sellingPrice: sp.toNumber(),
          unit: unit.trim(),
          sku: sku.trim() || null,
          lowStockThreshold: lst,
        },
        {
          onSuccess: (product) => {
            toast.success(`Product "${product.name}" updated`);
            router.push(`/more/products/${product.id}`);
          },
          onError: (error) => {
            if (error instanceof ApiError && error.code === "CONFLICT") {
              toast.error("Another product already uses this SKU.");
            } else {
              toast.error(error instanceof Error ? error.message : "Failed to update product.");
            }
          },
        },
      );
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          <TextField
            label="Product name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Basmati Rice 25kg"
            autoComplete="off"
            error={errors.name ?? null}
          />

          <TextField
            label="Category (optional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Grocery"
            autoComplete="off"
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Purchase price"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              placeholder="0"
              error={errors.purchasePrice ?? null}
              hint={`per ${unit || "unit"}`}
            />
            <TextField
              label="Selling price"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="0"
              error={errors.sellingPrice ?? null}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              {errors.unit ? (
                <p className="mt-1 text-xs text-red-600">{errors.unit}</p>
              ) : null}
            </div>

            <TextField
              label="SKU / code (optional)"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. RICE-25"
              autoComplete="off"
            />
          </div>

          {mode === "create" ? (
            <TextField
              label="Opening stock"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={openingStock}
              onChange={(e) => setOpeningStock(e.target.value)}
              placeholder="0"
              hint="Set only when migrating from paper. Leave 0 for new products."
              error={errors.openingStock ?? null}
            />
          ) : null}

          <TextField
            label="Low-stock threshold"
            type="number"
            inputMode="numeric"
            min="0"
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(e.target.value)}
            hint={`Alert when stock reaches this number of ${unit || "units"}.`}
            error={errors.lowStockThreshold ?? null}
          />
        </div>
      </div>

      {mode === "edit" ? (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <p>
            <strong>Opening stock cannot be edited.</strong> To correct an
            opening balance, use a{" "}
            <a href="/stock/adjust" className="font-medium text-brand-600 hover:underline">
              stock adjustment
            </a>{" "}
            instead.
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="lg"
          className="flex-[2]"
          disabled={hasErrors || isPending}
          onClick={handleSubmit}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {mode === "create" ? "Save Product" : "Update Product"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function parseDecimalSafe(value: string): Decimal {
  if (!value || value.trim() === "") return new Decimal(0);
  try {
    const d = new Decimal(value);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}
