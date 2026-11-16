import { cn } from "@/lib/utils/cn";

/**
 * Dukhata logo — drawn in code, no image file.
 *
 * The mark is a small ledger (khata): a bound notebook with a ruled page and a
 * ticked entry. It reads as "ledger book", which is what a shopkeeper actually
 * keeps. Nothing decorative is added that would not survive at 24px.
 *
 * Colour comes entirely from `currentColor` plus the theme tokens, so it works
 * in all five themes; the wordmark is forced LTR so the Latin brand never
 * re-orders inside an RTL document.
 */
export function Logo({
  className,
  showWordmark = true,
  markClassName,
}: {
  className?: string;
  showWordmark?: boolean;
  /** Override the mark's colour (defaults to the active theme's brand). */
  markClassName?: string;
}) {
  return (
    <span dir="ltr" className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 28 28"
        className={cn("h-7 w-7 shrink-0 text-brand-600", markClassName)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {/* Bound cover */}
        <rect x="3.5" y="3" width="21" height="22" rx="5" />
        {/* Spine */}
        <path d="M9.75 3v22" />
        {/* Ruled ledger lines */}
        <path d="M13.5 9.4h7.25" />
        <path d="M13.5 13.6h7.25" />
        {/* A ticked entry */}
        <path d="M13.6 18.2l1.55 1.55 3.05-3.55" />
      </svg>
      {showWordmark && (
        <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
          Dukhata
        </span>
      )}
    </span>
  );
}
