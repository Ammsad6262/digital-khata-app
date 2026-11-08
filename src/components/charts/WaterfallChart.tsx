"use client";

/**
 * WaterfallChart — how a starting figure becomes a final figure.
 *
 * Used for the profit estimate: sales → minus cost of goods → gross profit →
 * minus expenses → net estimate. Each bar starts at the previous running total
 * (subtracted bars span from the old total to the new one), so the reader sees
 * the arithmetic rather than a set of unrelated bars. Bars use length from a
 * zero baseline, and the value is printed under every step.
 *
 * `start`/`end` are passed in by the caller so the component stays generic and
 * the arithmetic is visible in the report, next to the definition of profit.
 */

export type WaterfallStep = {
  key: string;
  /** Full label for the screen-reader table. */
  label: string;
  /** Short label under the bar. */
  shortLabel: string;
  /** Pre-formatted value (compact money). */
  display: string;
  start: number;
  end: number;
  kind: "total" | "minus" | "subtotal" | "net";
};

export function WaterfallChart({ steps }: { steps: WaterfallStep[] }) {
  const values = steps.flatMap((step) => [step.start, step.end]);
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) max = min + 1;
  const range = max - min;
  const top = (value: number) => ((max - value) / range) * 100;
  const zero = top(0);

  return (
    <div>
      <div className="relative h-40">
        <span
          className="absolute inset-x-0 h-px bg-line-strong"
          style={{ top: `${zero}%` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 flex items-stretch gap-1.5">
          {steps.map((step) => {
            const barTop = top(Math.max(step.start, step.end));
            const barBottom = top(Math.min(step.start, step.end));
            const height = barBottom - barTop;
            const colorVar =
              step.kind === "total"
                ? "--brand-600"
                : step.kind === "minus"
                  ? "--danger"
                  : step.kind === "subtotal"
                    ? "--info"
                    : step.end >= 0
                      ? "--success"
                      : "--danger";
            return (
              <div
                key={step.key}
                className="relative min-w-0 flex-1"
                title={`${step.label}: ${step.display}`}
              >
                {height > 0.3 ? (
                  <div
                    className="absolute inset-x-0 rounded-[3px]"
                    style={{
                      top: `${barTop}%`,
                      height: `${height}%`,
                      backgroundColor: `rgb(var(${colorVar}))`,
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {steps.map((step) => (
          <div key={step.key} className="min-w-0 flex-1 text-center">
            <p className="truncate text-[10px] font-semibold text-ink-muted">
              {step.shortLabel}
            </p>
            <p className="truncate text-[10px] tabular-nums text-ink-subtle">
              {step.display}
            </p>
          </div>
        ))}
      </div>

      <table className="sr-only">
        <tbody>
          {steps.map((step) => (
            <tr key={step.key}>
              <th scope="row">{step.label}</th>
              <td>{step.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}