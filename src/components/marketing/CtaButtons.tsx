import Link from "next/link";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The two headline calls to action.
 *
 *   1. "Use in browser"   → a real link to /register.
 *   2. "Download the app" → a real download of the signed Android APK served
 *      from /app/dukhata.apk. The file is the Trusted Web Activity built from
 *      this same site, so the app and the browser version are one product.
 *
 * The APK is served with `Content-Type: application/vnd.android.package-archive`
 * (see next.config.mjs) so Android recognises it and offers to install it
 * rather than saving an unknown file.
 */

const APK_URL = "/app/dukhata.apk";

export function UseInBrowserCta({ className }: { className?: string }) {
  return (
    <Link
      href="/register"
      className={cn(
        "focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-control bg-brand-600 px-6",
        "text-[15px] font-semibold tracking-[-0.01em] text-white shadow-brand transition-colors hover:bg-brand-700 active:bg-brand-800",
        className,
      )}
    >
      Use in browser
    </Link>
  );
}

export function DownloadAppCta({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={APK_URL}
          className={cn(
            "focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-control",
            "border border-line-strong bg-surface px-6 text-[15px] font-semibold tracking-[-0.01em] text-ink shadow-soft",
            "transition-colors hover:bg-surface-2 active:bg-surface-3",
          )}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download for Android
        </a>
        <span className="pill border border-line bg-surface-2 text-ink-muted">
          Free · Android 7+
        </span>
      </div>
      <p className="text-xs leading-relaxed text-ink-subtle">
        Installs in seconds. Your phone may ask once to allow installing from this browser.
      </p>
    </div>
  );
}
