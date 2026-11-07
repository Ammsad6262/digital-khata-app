"use client";

/**
 * TextField — labeled text input with error display.
 *
 * Designed for use with React Hook Form. The `error` prop drives the
 * error styling + message.
 */

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: string;
  leftIcon?: React.ReactNode;
  /**
   * Marks the field as required: shows a red asterisk after the label and
   * sets aria-required. This is separate from the native `required`
   * attribute so callers can show a consistent, translated marker without
   * triggering the browser's own (untranslated) validation bubble.
   */
  showRequired?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { label, error, hint, leftIcon, showRequired, className, id, ...props },
    ref,
  ) {
    const inputId = id ?? props.name;
    const isRequired = showRequired || props.required;
    return (
      <div className="space-y-1">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700"
        >
          {label}
          {isRequired ? <span className="text-red-500" aria-hidden> *</span> : null}
        </label>
        <div className="relative">
          {leftIcon ? (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {leftIcon}
            </span>
          ) : null}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400",
              "focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500",
              "disabled:bg-slate-50 disabled:text-slate-400",
              leftIcon && "pl-9",
              error
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                : "border-slate-300",
              className,
            )}
            aria-invalid={!!error}
            aria-required={isRequired || undefined}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="text-xs text-red-600">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-xs text-slate-500">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
