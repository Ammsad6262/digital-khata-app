/**
 * Pure utility for interpolating {placeholder} tokens in translation strings.
 *
 * Shared between client and server — no React dependencies.
 * Used by:
 *   - language-provider.tsx (client-side tParams())
 *   - server.ts (server-side tServer())
 */

/**
 * Interpolate {placeholder} tokens in a template string with values.
 * Tokens that don't have a matching key are left as-is (e.g. "{unknown}").
 *
 * Example:
 *   interpolate("Hello, {name}!", { name: "World" }) → "Hello, World!"
 *   interpolate("Hi {name}, you have {count} items", { name: "Bob", count: 3 })
 *     → "Hi Bob, you have 3 items"
 */
export function interpolate(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = params[key];
    return v === undefined || v === null ? `{${key}}` : String(v);
  });
}
