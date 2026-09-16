"use client";

/**
 * useCustomerBalance — fetch a single customer's balance summary.
 *
 * Returns:
 *   - openingBalance
 *   - totalPurchases
 *   - totalPayments
 *   - totalAdjustments
 *   - balance (signed: positive = customer owes, negative = advance)
 *
 * Used by the Add Payment form to show overpayment warnings.
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/utils/api-client";
import { customerKeys } from "@/hooks/use-customers";
import type { CustomerWithBalance } from "@/lib/services/customers";

export function useCustomerBalance(customerId: string | null | undefined) {
  return useQuery<CustomerWithBalance>({
    queryKey: customerId
      ? customerKeys.detail(customerId)
      : ["customers", "detail", "disabled"],
    queryFn: () => apiGet<CustomerWithBalance>(`/api/customers/${customerId}`),
    enabled: !!customerId,
  });
}
