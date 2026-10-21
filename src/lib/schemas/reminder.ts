/**
 * Zod schemas for Reminder (follow-ups, collections, reorder alerts).
 */

import { z } from "zod";

export const REMINDER_TYPES = [
  "payment_collection",
  "supplier_payment",
  "customer_followup",
  "stock_reorder",
  "custom",
] as const;

export const REMINDER_PRIORITIES = ["low", "normal", "high"] as const;

const optionalId = z.string().min(1).optional().nullable();

export const createReminderSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(150),
  notes: z.string().trim().max(1000).optional().nullable(),
  type: z.enum(REMINDER_TYPES).default("custom"),
  dueAt: z.coerce.date(),
  priority: z.enum(REMINDER_PRIORITIES).default("normal"),
  customerId: optionalId,
  supplierId: optionalId,
  productId: optionalId,
});

export const updateReminderSchema = createReminderSchema.partial();

/** How far a reminder can be pushed back in one tap. */
export const SNOOZE_PRESETS = [
  { days: 1, labelKey: "reminders.snooze1d" },
  { days: 3, labelKey: "reminders.snooze3d" },
  { days: 7, labelKey: "reminders.snooze1w" },
] as const;

export const snoozeReminderSchema = z.object({
  days: z.coerce.number().int().min(1).max(365),
});

export type SnoozeReminderInput = z.infer<typeof snoozeReminderSchema>;

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
