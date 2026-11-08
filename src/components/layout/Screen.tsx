/**
 * Mobile-first app shell container.
 *
 * Wraps every page in a phone-width column. On larger screens, this keeps
 * the app feeling like a native mobile app instead of stretching content
 * to fill the desktop viewport.
 *
 * Use:
 *   <Screen>
 *     <AppHeader title="Dashboard" />
 *     ...page content...
 *   </Screen>
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Screen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("app-shell", className)}>{children}</div>;
}

export function ScreenContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <main className={cn("app-content", className)}>{children}</main>;
}
