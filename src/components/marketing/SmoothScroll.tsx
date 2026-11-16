"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Motion layer for the public marketing pages.
 *
 * Two jobs, both optional:
 *   1. Lenis — momentum smooth scrolling on pointer devices.
 *   2. GSAP ScrollTrigger — a single, quiet fade-up per section, once.
 *
 * Hard rules this file obeys:
 *   - Content is always in the server-rendered HTML and never starts hidden in
 *     CSS or inline styles. The hidden state is applied from JS, at runtime, and
 *     only to elements that are still below the fold (so the hero never flashes
 *     and LCP is untouched).
 *   - `prefers-reduced-motion: reduce` returns immediately: Lenis is never
 *     created, no element is hidden, nothing is animated.
 *   - Lenis is skipped on touch devices — native momentum scrolling is smoother
 *     and cheaper on the cheap phones this product targets.
 *   - GSAP and Lenis are dynamic-imported, so they stay off the critical path:
 *     the page renders and hydrates without them.
 *   - Everything is torn down on unmount, so client-side route changes do not
 *     leak ScrollTriggers or listeners.
 */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FINE_POINTER_QUERY = "(pointer: fine)";
const HOVER_QUERY = "(hover: hover)";

export function SmoothScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    // Honour prefers-reduced-motion: no Lenis, no reveals — every element stays
    // exactly as the server rendered it (visible).
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return;

    let cancelled = false;
    let teardown: (() => void) | undefined;

    Promise.all([import("lenis"), import("gsap"), import("gsap/ScrollTrigger")])
      .then(([lenisModule, gsapModule, scrollTriggerModule]) => {
        if (cancelled) return;

        const Lenis = lenisModule.default;
        const { gsap } = gsapModule;
        const { ScrollTrigger } = scrollTriggerModule;
        gsap.registerPlugin(ScrollTrigger);

        // Smooth scroll on pointer devices only.
        const canSmoothScroll =
          window.matchMedia(FINE_POINTER_QUERY).matches &&
          window.matchMedia(HOVER_QUERY).matches;

        const lenis = canSmoothScroll
          ? new Lenis({
              lerp: 0.1,
              smoothWheel: true,
              // Leave room under the sticky header when jumping to an anchor.
              anchors: { offset: -80 },
            })
          : null;

        const onScroll = () => ScrollTrigger.update();
        const raf = (time: number) => lenis?.raf(time * 1000);

        if (lenis) {
          lenis.on("scroll", onScroll);
          gsap.ticker.add(raf);
          gsap.ticker.lagSmoothing(0);
        }

        const ctx = gsap.context(() => {
          gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
            // Only hide what is still below the fold. Anything already on screen
            // is left untouched: no flash, and the hero text is readable the
            // instant the HTML arrives.
            if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;

            const delay = Number(el.dataset.revealDelay ?? "0") / 1000;
            gsap.set(el, { opacity: 0, y: 12 });
            gsap.to(el, {
              opacity: 1,
              y: 0,
              duration: 0.5,
              ease: "power2.out",
              delay,
              // transform/opacity only — no layout shift, no parallax, no pin.
              scrollTrigger: { trigger: el, start: "top 86%", once: true },
            });
          });
        });

        teardown = () => {
          ctx.revert(); // reverts animations and kills their ScrollTriggers
          if (lenis) {
            gsap.ticker.remove(raf);
            lenis.off("scroll", onScroll);
            lenis.destroy();
          }
        };

        if (cancelled) {
          teardown();
          teardown = undefined;
        }
      })
      .catch(() => {
        /* Motion is a nicety. If it fails to load, the page is already complete. */
      });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  return <div className={className}>{children}</div>;
}
