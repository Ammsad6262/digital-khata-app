import type { Config } from "tailwindcss";

/**
 * Dukhata design system — Tailwind theme extension.
 *
 * Every colour is driven by a CSS variable so the whole app can be
 * re-skinned at runtime (see the themes in `src/app/globals.css`).
 * The variables hold *space separated RGB channels* so Tailwind's
 * `<alpha-value>` opacity modifiers keep working:
 *
 *   bg-brand-600/10   →   rgb(var(--brand-600) / 0.1)
 *
 * Semantic groups:
 *   brand   — the signature colour of the active theme
 *   accent  — a complementary highlight used sparingly
 *   app     — page background
 *   surface — card / sheet background (surface.2 = inset fill)
 *   line    — hairline borders (line.strong = input / emphasis)
 *   ink     — text hierarchy (ink, muted, subtle, faint)
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/providers/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          950: "rgb(var(--brand-950) / <alpha-value>)",
        },
        accent: {
          50: "rgb(var(--accent-50) / <alpha-value>)",
          100: "rgb(var(--accent-100) / <alpha-value>)",
          200: "rgb(var(--accent-200) / <alpha-value>)",
          300: "rgb(var(--accent-300) / <alpha-value>)",
          400: "rgb(var(--accent-400) / <alpha-value>)",
          500: "rgb(var(--accent-500) / <alpha-value>)",
          600: "rgb(var(--accent-600) / <alpha-value>)",
          700: "rgb(var(--accent-700) / <alpha-value>)",
          800: "rgb(var(--accent-800) / <alpha-value>)",
          900: "rgb(var(--accent-900) / <alpha-value>)",
        },
        app: "rgb(var(--bg) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)",
          3: "rgb(var(--surface-3) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--line) / <alpha-value>)",
          strong: "rgb(var(--line-strong) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          subtle: "rgb(var(--ink-subtle) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--success) / <alpha-value>)",
          soft: "rgb(var(--success-soft) / <alpha-value>)",
          ink: "rgb(var(--success-ink) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--warning) / <alpha-value>)",
          soft: "rgb(var(--warning-soft) / <alpha-value>)",
          ink: "rgb(var(--warning-ink) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--danger) / <alpha-value>)",
          soft: "rgb(var(--danger-soft) / <alpha-value>)",
          ink: "rgb(var(--danger-ink) / <alpha-value>)",
        },
        info: {
          DEFAULT: "rgb(var(--info) / <alpha-value>)",
          soft: "rgb(var(--info-soft) / <alpha-value>)",
          ink: "rgb(var(--info-ink) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "1.25rem",
        control: "0.875rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(var(--shadow-rgb) / 0.05)",
        card: "0 1px 2px rgb(var(--shadow-rgb) / 0.04), 0 10px 30px -20px rgb(var(--shadow-rgb) / 0.35)",
        lift: "0 2px 6px rgb(var(--shadow-rgb) / 0.05), 0 22px 48px -24px rgb(var(--shadow-rgb) / 0.35)",
        brand: "0 18px 40px -22px rgb(var(--brand-600) / 0.55)",
        accent: "0 18px 40px -22px rgb(var(--accent-500) / 0.5)",
      },
      keyframes: {
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "rise-in": "rise-in .38s cubic-bezier(.2,.8,.2,1) both",
        "fade-in": "fade-in .3s ease both",
        "pop-in": "pop-in .18s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        "slide-up": "slide-up .26s cubic-bezier(.2,.8,.2,1) both",
      },
      maxWidth: {
        app: "480px",
      },
    },
  },
  plugins: [],
};

export default config;