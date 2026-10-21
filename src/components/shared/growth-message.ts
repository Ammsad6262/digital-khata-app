/**
 * Builds the pre-written WhatsApp message for a growth recommendation.
 *
 * Kept in one place so the dashboard strip and the full Growth page always
 * say the same thing. Every amount comes from the recommendation itself — this
 * function never invents a number, it only formats one the server computed.
 */

import type { TranslationKey } from "@/lib/i18n/translations";
import type { GrowthRecommendation } from "@/lib/services/growth";
import { formatMoney } from "@/lib/utils/money";

type TranslateParams = (
  key: TranslationKey,
  params: Record<string, string | number>,
) => string;

export function growthContactMessage(
  item: GrowthRecommendation,
  tParams: TranslateParams,
  currencySymbol: string,
): string | undefined {
  if (!item.contactPhone) return undefined;

  const name = item.contactName ?? "";

  if (item.reorder) {
    return tParams("growth.waReorder", {
      name,
      product: item.reorder.productName,
      quantity: item.reorder.quantity,
      unit: item.reorder.unit,
    });
  }

  const amount = item.amount ? formatMoney(item.amount, currencySymbol) : "";

  if (item.contactKind === "supplier") {
    return tParams("growth.waSupplier", { name, amount });
  }

  return tParams("growth.waCollect", { name, amount });
}
