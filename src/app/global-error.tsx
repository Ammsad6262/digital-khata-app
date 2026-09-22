"use client";

/**
 * Global Error Boundary — catches errors during root layout rendering.
 *
 * This component renders OUTSIDE the root layout and its providers, so it
 * CANNOT use any context hooks (useLanguage, useTheme, useToast, etc.).
 *
 * `export const dynamic = "force-dynamic"` prevents Next.js 16 from trying
 * to statically prerender this page — which fails with
 * "invariant expected layout router to be mounted" because the
 * LayoutRouterContext isn't available during static generation.
 */

export const dynamic = "force-dynamic";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f8fafc",
            padding: "1.5rem",
          }}
        >
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0f172a", marginBottom: "0.5rem" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1.5rem" }}>
              {error.message || "An unexpected error occurred."}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                backgroundColor: "#16a34a",
                color: "#ffffff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.625rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
