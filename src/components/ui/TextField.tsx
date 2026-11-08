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
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { label, error, hint, leftIcon, className, id, ...props },
    ref,
  ) {
    const inputId = id ?? props.name;
    return (
      <div className="space-y-1.5">
        <label
          htmlFor={inputId}
          className="block text-[13px] font-medium text-ink-muted"
        >
          {label}
        </label>
        <div className="relative">
          {leftIcon ? (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
              {leftIcon}
            </span>
          ) : null}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full rounded-control border bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-faint",
              "transition-shadow focus:outline-none focus:ring-4",
              "disabled:bg-surface-2 disabled:text-ink-subtle",
              leftIcon && "pl-10",
              error
                ? "border-danger/60 focus:border-danger focus:ring-danger/15"
                : "border-line-strong focus:border-brand-500 focus:ring-brand-500/15",
              className,
            )}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-xs text-ink-subtle">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);