/**
 * Button primitive.
 *
 * Variants: primary | secondary | outline | ghost | danger
 * Sizes:    sm | md | lg
 *
 * The primary button carries the active theme's signature colour plus a soft
 * brand-tinted shadow. Secondary sits on `ink` so it stays legible in every
 * palette; outline/ghost lean on the surface + hairline tokens.
 */

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-brand hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 disabled:shadow-none",
  secondary:
    "border border-line-strong bg-surface-2 text-ink hover:bg-surface-3 active:bg-surface-3 disabled:opacity-50",
  outline:
    "border border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-3 disabled:opacity-50",
  ghost:
    "text-ink-muted hover:bg-surface-2 hover:text-ink active:bg-surface-3 disabled:opacity-50",
  danger:
    "bg-danger text-white shadow-soft hover:bg-danger-ink active:brightness-90 disabled:opacity-50",
};

const SIZE_CLASSES = {
  sm: "h-9 px-3.5 text-[13px] rounded-[0.65rem]",
  md: "h-11 px-4 text-sm rounded-control",
  lg: "h-[3.25rem] px-5 text-[15px] rounded-control",
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", className, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-semibold tracking-[-0.01em] transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-app",
          "active:scale-[0.985] disabled:cursor-not-allowed disabled:active:scale-100",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...props}
      />
    );
  },
);