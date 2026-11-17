"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Logo } from "./Logo";

/**
 * Marketing site header.
 *
 * - Sticky and translucent; a hairline border appears only once the page has
 *   scrolled, so the top of the hero stays calm.
 * - Mobile navigation uses a native <details> disclosure, so the menu works
 *   with no JavaScript at all (the scroll state is the only JS here).
 * - No heading elements: the page keeps exactly one <h1>.
 */

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMenu = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b bg-app/85 backdrop-blur transition-colors",
        scrolled ? "border-line" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Dukhata — home" className="focus-ring -ms-1 rounded-control p-1">
          <Logo priority />
        </Link>

        <nav aria-label="Primary" className="ms-3 hidden items-center md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="focus-ring rounded-control px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto hidden items-center gap-1 md:flex">
          <Link
            href="/login"
            className="focus-ring rounded-control px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="focus-ring inline-flex h-11 items-center justify-center rounded-control bg-brand-600 px-5 text-sm font-semibold text-white shadow-brand transition-colors hover:bg-brand-700"
          >
            Start free trial
          </Link>
        </div>

        {/* Mobile: native disclosure, works without heavy JS. */}
        <details ref={detailsRef} className="relative ms-auto md:hidden">
          <summary
            aria-label="Open menu"
            className="focus-ring inline-flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-control border border-line-strong bg-surface text-ink marker:content-none [&::-webkit-details-marker]:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </summary>
          <div className="absolute end-0 top-[calc(100%+0.5rem)] w-60 rounded-card border border-line bg-surface p-2 shadow-lift">
            <nav aria-label="Mobile" className="flex flex-col">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="focus-ring rounded-control px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/login"
                onClick={closeMenu}
                className="focus-ring mt-1 rounded-control px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
              >
                Log in
              </Link>
            </nav>
            <Link
              href="/register"
              onClick={closeMenu}
              className="focus-ring mt-1 flex h-11 items-center justify-center rounded-control bg-brand-600 text-sm font-semibold text-white shadow-brand transition-colors hover:bg-brand-700"
            >
              Start free trial
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}
