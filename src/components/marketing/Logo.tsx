import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/**
 * Dukhata logo — the owner's artwork.
 *
 * `public/logo.png` is a light mark on a black tile whose mark occupies only
 * about 55% x 33% of the canvas. Used as-is it looked like an empty black square
 * at header and favicon sizes, so `scripts/generate_icons.py` trims it to the
 * mark's real bounds and re-pads it as `logo-mark.png`. That is what renders
 * here, and it is the same source the favicon set is generated from, so the tab
 * icon and the site mark cannot drift apart.
 *
 * The lockup is forced LTR so the Latin brand never re-orders inside an RTL
 * document.
 */
export function Logo({
  className,
  showWordmark = true,
  priority = false,
}: {
  className?: string;
  showWordmark?: boolean;
  /** Set on the first above-the-fold instance to avoid a layout flash. */
  priority?: boolean;
}) {
  return (
    <span dir="ltr" className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src="/logo-mark.png"
        alt=""
        width={336}
        height={200}
        priority={priority}
        className="h-7 w-auto shrink-0 rounded-[6px]"
      />
      {showWordmark && (
        <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
          Dukhata
        </span>
      )}
    </span>
  );
}