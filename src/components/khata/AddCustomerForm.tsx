"use client";

/**
 * AddCustomerForm — React Hook Form + Zod.
 *
 * Fields:
 *   - Name (required)
 *   - Phone (required, validated)
 *   - Address (optional)
 *   - Notes (optional)
 *   - Opening balance (optional, default 0 — for migrating paper khata)
 *
 * On success: shows a success toast + redirects to the new customer's
 * detail page (/khata/[id]).
 *
 * On error: shows the error message from the API (e.g. duplicate phone).
 */

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TextField } from "@/components/ui/TextField";
import { TextArea } from "@/components/ui/TextArea";
import { StickyFormActions } from "@/components/ui/StickyFormActions";
import { useCreateCustomer } from "@/hooks/use-customers";
import { useToast } from "@/providers/toast-provider";
import { createCustomerSchema } from "@/lib/schemas/customer";
import { ApiError } from "@/lib/utils/api-client";
import type { z } from "zod";

type FormValues = z.infer<typeof createCustomerSchema>;

export function AddCustomerForm() {
  const router = useRouter();
  const toast = useToast();
  const createCustomer = useCreateCustomer();

  const form = useForm<FormValues>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      name: "",
      phone: "",
      address: null,
      notes: null,
      openingBalance: 0,
    },
  });

  const onSubmit = (values: FormValues) => {
    createCustomer.mutate(values, {
      onSuccess: (customer) => {
        toast.success(`Customer "${customer.name}" added`);
        router.push(`/khata/${customer.id}`);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === "CONFLICT") {
          form.setError("phone", {
            type: "manual",
            message: "A customer with this phone already exists.",
          });
          toast.error("This phone number is already in use.");
        } else {
          toast.error(error instanceof Error ? error.message : "Failed to add customer");
        }
      },
    });
  };

  const hasErrors = Object.keys(form.formState.errors).length > 0;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          <TextField
            label="Name"
            placeholder="e.g. Ahmed Khan"
            autoComplete="off"
            {...form.register("name")}
            error={form.formState.errors.name?.message ?? null}
          />

          <TextField
            label="Phone"
            type="tel"
            inputMode="tel"
            placeholder="e.g. 03001234567"
            autoComplete="off"
            leftIcon={<span className="text-sm">📞</span>}
            {...form.register("phone")}
            error={form.formState.errors.phone?.message ?? null}
            hint="Used as the unique identifier — search by phone is fast."
          />

          <TextField
            label="Address"
            placeholder="Optional — shop or home location"
            autoComplete="off"
            {...form.register("address")}
            error={form.formState.errors.address?.message ?? null}
          />

          <TextArea
            label="Notes"
            placeholder="Optional — anything you want to remember about this customer"
            rows={3}
            {...form.register("notes")}
            error={form.formState.errors.notes?.message ?? null}
          />

          <TextField
            label="Opening balance"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0"
            hint="Set this when migrating from paper khata. Leave 0 for new customers."
            {...form.register("openingBalance", { valueAsNumber: true })}
            error={form.formState.errors.openingBalance?.message ?? null}
          />
        </div>
      </div>

      <StickyFormActions
        onCancel={() => router.back()}
        onSave={() => form.handleSubmit(onSubmit)()}
        saveLabel="Save Customer"
        saveDisabled={hasErrors}
        isPending={createCustomer.isPending}
      />
    </form>
  );
}
