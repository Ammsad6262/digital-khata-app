"use client";

/**
 * TextArea — labeled textarea with error display.
 */

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | null;
  hint?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea(
    { label, error, hint, className, id, ...props },
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
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            "w-full rounded-control border bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-faint",
            "transition-shadow focus:outline-none focus:ring-4",
            "disabled:bg-surface-2 disabled:text-ink-subtle",
            "min-h-[88px] resize-y",
            error
              ? "border-danger/60 focus:border-danger focus:ring-danger/15"
              : "border-line-strong focus:border-brand-500 focus:ring-brand-500/15",
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
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