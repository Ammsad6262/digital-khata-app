/**
 * Entity-pick decision (pure, unit-tested).
 *
 * `nameScore` is quantised — it only returns 0, 70, 78, 80, 82, 86, 90, 92, 96
 * or 100 — so the decision must work on those real tiers, not arbitrary
 * thresholds like 55. The rules:
 *
 *   - score >= 96 (exact / near-exact): auto-select the best entry, even when a
 *     looser duplicate also matches. Saying a name should not require a tap.
 *   - 86..95, exactly one: auto-select (strong cross-script / h-tolerant match).
 *   - 86..95, several: let the owner choose between them.
 *   - 70..85: offer the closest few as candidates (ambiguous or weak).
 *   - 0: nothing matched.
 */

export type Scored<T> = { row: T; score: number };
export type PickResult<T> = { entity: T | null; candidates: T[] };

export function pickEntity<T extends { name: string }>(scored: Scored<T>[]): PickResult<T> {
  if (scored.length === 0) return { entity: null, candidates: [] };

  const best = scored[0]!;

  // Exact / near-exact: always take it. A near-duplicate must not force a tap.
  if (best.score >= 96) return { entity: best.row, candidates: [] };

  const strong = scored.filter((m) => m.score >= 86);
  if (strong.length === 1) return { entity: strong[0]!.row, candidates: [] };
  if (strong.length > 1) {
    return { entity: null, candidates: strong.slice(0, 5).map((m) => m.row) };
  }

  const medium = scored.filter((m) => m.score >= 70).slice(0, 5);
  return { entity: null, candidates: medium.map((m) => m.row) };
}