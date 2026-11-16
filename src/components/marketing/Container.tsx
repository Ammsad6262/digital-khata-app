import { type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Marketing content column. Wider than the app's phone-width shell so the
 * public pages can breathe, but still capped so the type stays readable.
 */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}
