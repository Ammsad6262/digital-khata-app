"use client";

/**
 * DumbbellChart — compare this period with the previous one.
 *
 * A dumbbell encodes both values as position on one shared scale and joins them
 * with a line, so the direction and size of the change are read directly. It
 * handles negative values (e.g. a net loss) without truncating an axis, and it
 * stays readable with long metric names where grouped vertical bars would not.
 */

export type DumbbellRow = {
  key: string;
  label: string;
  current: number;
  previous: number;
  currentDisplay: string;
  previousDisplay: string;
};

export function DumbbellChart({
  rows,
  previousLabel,
}: {
  rows: DumbbellRow[];
  previousLabel: string;
}) {
  const values = rows.flatMap((row) => [row.current, row.previous]);
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) max = min + 1;
  // Give the end dots a little breathing room from the edges.
  const pad = (max - min) * 0.06;
  min -= pad;
  max += pad;
  const span = max - min;
  const pct = (value: number) => ((value - min) / span) * 100;
  const zero = pct(0);

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const currentX = pct(row.current);
        const previousX = pct(row.previous);
        return (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-ink-muted">{row.label}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-ink">
                {row.currentDisplay}
              </span>
            </div>

            <div className="relative mt-1.5 h-4" aria-hidden="true">
              <span
                className="absolute inset-y-0 w-px bg-line-strong"
                style={{ left: `${zero}%` }}
              />
              <span
                className="absolute top-1/2 h-px -translate-y-1/2 bg-line-strong"
                style={{
                  left: `${Math.min(currentX, previousX)}%`,
                  width: `${Math.abs(currentX - previousX)}%`,
                }}
              />
              <span
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                style={{
                  left: `${previousX}%`,
                  borderColor: "rgb(var(--ink-faint))",
                  backgroundColor: "rgb(var(--surface))",
                }}
              />
              <span
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${currentX}%`,
                  backgroundColor: "rgb(var(--brand-600))",
                }}
              />
            </div>

            <p className="mt-0.5 text-[10px] text-ink-subtle">
              {previousLabel}: {row.previousDisplay}
            </p>
          </div>
        );
      })}

      <table className="sr-only">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{row.currentDisplay}</td>
              <td>{row.previousDisplay}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}