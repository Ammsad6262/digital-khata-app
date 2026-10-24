"use client";

/**
 * EditCustomerForm — change the details of an existing customer.
 *
 * Opening balance is deliberately not editable here: it is a starting point
 * set once when the customer is migrated from paper khata. Use a customer
 * adjustment to correct it, so the history stays auditable.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { TextField } from "@/components/ui/TextField";
import { TextArea } from "@/components/ui/TextArea";
import { StickyFormActions } from "@/components/ui/StickyFormActions";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCustomer, useUpdateCustomer } from "@/hooks/use-customers";
import { useToast } from "@/providers/toast-provider";
import { createCustomerSchema } from "@/lib/schemas/customer";
import { ApiError } from "@/lib/utils/api-client";
import type { z } from "zod";
import { useLanguage } from "@/providers/language-provider";

type FormValues = z.infer<typeof createCustomerSchema>;

export function EditCustomerForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const { data: customer, isLoading, isError, error, refetch } = useCustomer(customerId);
  const updateCustomer = useUpdateCustomer();

  const form = useForm<FormValues>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      name: "",
      companyName: null,
      phone: "",
      address: null,
      notes: null,
      openingBalance: 0,
    },
  });

  useEffect(() => {
    if (!customer) return;
    form.reset({
      name: customer.name,
      companyName: customer.companyName,
      phone: customer.phone ?? "",
      address: customer.address,
      notes: customer.notes,
      openingBalance: Number(customer.openingBalance),
    });
  }, [customer, form]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
    );
  }

  if (isError || !customer) {
    return (
      <EmptyState
        title={t("customer.couldntLoadCustomer")}
        description={error instanceof Error ? error.message : t("common.networkError")}
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Button onClick={() => refetch()} variant="outline" size="sm">
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const onSubmit = (values: FormValues) => {
    updateCustomer.mutate(
      {
        id: customerId,
        name: values.name,
        companyName: values.companyName,
        phone: values.phone,
        address: values.address,
        notes: values.notes,
      },
      {
        onSuccess: () => {
          toast.success(t("customer.customerUpdated"));
          router.push(`/khata/${customerId}`);
        },
        onError: (mutationError) => {
          if (mutationError instanceof ApiError && mutationError.code === "CONFLICT") {
            form.setError("phone", {
              type: "manual",
              message: t("customer.phoneAlreadyExists"),
            });
          }
          toast.error(
            mutationError instanceof Error ? mutationError.message : t("common.failed"),
          );
        },
      },
    );
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <p className="px-1 text-xs text-slate-500">{t("customer.editCustomerSubtitle")}</p>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          <TextField
            label={t("customer.name")}
            placeholder={t("customer.namePlaceholder")}
            autoComplete="off"
            {...form.register("name")}
            error={form.formState.errors.name?.message ?? null}
          />

          <TextField
            label={t("customer.companyName")}
            placeholder={t("customer.companyNamePlaceholder")}
            autoComplete="organization"
            {...form.register("companyName")}
            error={form.formState.errors.companyName?.message ?? null}
            hint={t("customer.companyNameHint")}
          />

          <TextField
            label={t("customer.phone")}
            type="tel"
            inputMode="tel"
            placeholder={t("customer.phonePlaceholder")}
            autoComplete="off"
            leftIcon={<span className="text-sm">📞</span>}
            {...form.register("phone")}
            error={form.formState.errors.phone?.message ?? null}
            hint={t("customer.phoneHint")}
          />

          <TextField
            label={t("customer.address")}
            placeholder={t("customer.addressPlaceholder")}
            autoComplete="off"
            {...form.register("address")}
            error={form.formState.errors.address?.message ?? null}
          />

          <TextArea
            label={t("customer.notes")}
            placeholder={t("customer.notesPlaceholder")}
            rows={3}
            {...form.register("notes")}
            error={form.formState.errors.notes?.message ?? null}
          />
        </div>
      </div>

      <StickyFormActions
        onCancel={() => router.push(`/khata/${customerId}`)}
        onSave={() => form.handleSubmit(onSubmit)()}
        saveLabel={t("customer.saveChanges")}
        isPending={updateCustomer.isPending}
      />
    </form>
  );
}
