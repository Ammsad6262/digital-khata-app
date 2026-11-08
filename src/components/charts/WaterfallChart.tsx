"use client";

/**
 * WaterfallChart — how a starting figure becomes a final figure.
 *
 * Used for the profit estimate: sales → minus cost of goods → gross profit →
 * minus expenses → net estimate.
 *
 * Readability rules this chart follows:
 *   - A shared zero baseline is always drawn, and bars encode value by length
 *     from it (no floating blocks, no truncated axis).
 *   - A labelled value axis and light gridlines give the reader the scale, so
 *     the bar lengths mean something.
 *   - Connector lines join the end of one step to the start of the next, so the
 *     arithmetic reads as a flow instead of unrelated columns.
 *   - A step that nets to zero is drawn as a marker on the baseline, never an
 *     empty void that looks like missing data.
 */

import { compactMoney } from "./format";
import { niceCeil } from "./scale";

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

const TICKS = 4;

/** Colour by meaning, from the theme tokens (no off-palette hues). */
function colorFor(step: WaterfallStep): string {
  switch (step.kind) {
    case "total":
      return "--brand-700";
    case "minus":
      return "--danger";
    case "subtotal":
      return "--brand-400";
    default:
      return step.end >= 0 ? "--success" : "--danger";
  }
}

export function WaterfallChart({
  steps,
  symbol = "",
  caption,
}: {
  steps: WaterfallStep[];
  symbol?: string;
  /** Describes the data table for screen readers (usually the chart's title). */
  caption?: string;
}) {
  const values = steps.flatMap((step) => [step.start, step.end]);
  const rawMax = Math.max(0, ...values);
  const rawMin = Math.min(0, ...values);
  const hi = rawMax > 0 ? niceCeil(rawMax) : 1;
  const lo = rawMin < 0 ? -niceCeil(-rawMin) : 0;
  const span = hi - lo || 1;
  const top = (value: number) => ((hi - value) / span) * 100;
  const zero = top(0);
  const count = steps.length;
  const center = (index: number) => ((index + 0.5) / count) * 100;
  const ticks = Array.from({ length: TICKS + 1 }, (_, index) => lo + (span * index) / TICKS);

  return (
    <div>
      <div className="flex gap-2">
        {/* Value axis */}
        <div className="relative h-44 w-11 shrink-0" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-ink-faint"
              style={{ top: `${top(tick)}%` }}
            >
              {compactMoney(tick, symbol)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative h-44 min-w-0 flex-1">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute inset-x-0 h-px"
              style={{ top: `${top(tick)}%`, backgroundColor: "rgb(var(--line))" }}
              aria-hidden="true"
            />
          ))}
          {/* Zero baseline — stronger than the gridlines */}
          <span
            className="absolute inset-x-0 h-px"
            style={{ top: `${zero}%`, backgroundColor: "rgb(var(--line-strong))" }}
            aria-hidden="true"
          />

          {/* Connectors: end of one step → start of the next */}
          {steps.slice(0, -1).map((step, index) => (
            <span
              key={`connector-${step.key}`}
              className="absolute h-px"
              style={{
                top: `${top(step.end)}%`,
                left: `${center(index)}%`,
                width: `${center(index + 1) - center(index)}%`,
                backgroundColor: "rgb(var(--line-strong))",
              }}
              aria-hidden="true"
            />
          ))}

          {/* Bars */}
          <div className="absolute inset-0 flex items-stretch">
            {steps.map((step) => {
              const barTop = top(Math.max(step.start, step.end));
              const barBottom = top(Math.min(step.start, step.end));
              const height = barBottom - barTop;
              const isZero = Math.abs(step.end - step.start) < 1e-9;
              const color = `rgb(var(${colorFor(step)}))`;
              return (
                <div key={step.key} className="relative min-w-0 flex-1">
                  {isZero ? (
                    <span
                      className="absolute left-1/2 h-[3px] w-2/3 max-w-[3rem] -translate-x-1/2 rounded-full opacity-60"
                      style={{ top: `calc(${top(step.end)}% - 1.5px)`, backgroundColor: color }}
                      title={`${step.label}: ${step.display}`}
                    />
                  ) : (
                    <div
                      className="absolute left-1/2 w-full max-w-[3rem] -translate-x-1/2 rounded-md"
                      style={{ top: `${barTop}%`, height: `${height}%`, backgroundColor: color }}
                      title={`${step.label}: ${step.display}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step labels */}
      <div className="mt-2 flex gap-2">
        <div className="w-11 shrink-0" aria-hidden="true" />
        <div className="flex min-w-0 flex-1">
          {steps.map((step) => (
            <div key={step.key} className="min-w-0 flex-1 px-0.5 text-center">
              <p className="truncate text-[10px] font-semibold text-ink-muted">{step.shortLabel}</p>
              <p className="truncate text-[10px] font-semibold tabular-nums text-ink">{step.display}</p>
            </div>
          ))}
        </div>
      </div>

      <table className="sr-only">
        {caption ? <caption>{caption}</caption> : null}
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
