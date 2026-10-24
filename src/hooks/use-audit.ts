"use client";

/** React Query hook for the owner's audit trail. */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/utils/api-client";
import type { AuditLogView } from "@/lib/services/audit";

export const auditKeys = {
  all: ["audit"] as const,
};

export function useAuditLog() {
  return useQuery<{ items: AuditLogView[] }>({
    queryKey: auditKeys.all,
    queryFn: () => apiGet<{ items: AuditLogView[] }>("/api/audit"),
    staleTime: 30_000,
  });
}
