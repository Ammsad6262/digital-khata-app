import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/**
 * Dukhata logo — the owner's artwork, seated in a theme-matched tile.
 *
 * The source artwork (`public/logo.png`) is a spring-green mark on a flat black
 * tile, with the mark filling only ~55% x 33% of the canvas. In the site's
 * cream background that read as a hard black box with a thin neon band inside.
 *
 * `scripts/generate_icons.py` rebuilds it: it trims the mark to its true
 * bounds and sets it in a rounded, warm-graphite, softly-lit tile that matches
 * the app theme (see `globals.css`). `/logo-mark.png` is that tile — the same
 * squircle as the favicon set, so the tab icon and the site mark can never
 * drift apart.
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
        width={256}
        height={256}
        priority={priority}
        className="h-7 w-7 shrink-0 drop-shadow-[0_1px_2px_rgba(28,25,23,0.22)]"
      />
      {showWordmark && (
        <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
          Dukhata
        </span>
      )}
    </span>
  );
}
