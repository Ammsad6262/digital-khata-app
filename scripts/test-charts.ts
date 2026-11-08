/**
 * Unit checks for the chart helper functions.
 *
 * These helpers decide what the reader actually sees on a chart (the label
 * text and the axis maximum), so a regression here silently mislabels a chart
 * rather than throwing. Pure functions, no DB, no DOM.
 *
 * Run with:  npm run test:charts
 */

import { compactMoney } from "../src/components/charts/format";
import { niceCeil } from "../src/components/charts/scale";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = Object.is(actual, expected);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` — got ${String(actual)}, want ${String(expected)}`}`,
  );
  if (!ok) failures += 1;
}

// --- compactMoney -----------------------------------------------------------
check("zero", compactMoney(0, "Rs."), "Rs.0");
check("hundreds keep no decimal", compactMoney(950, "Rs."), "Rs.950");
check("thousands keep one decimal", compactMoney(1500, "Rs."), "Rs.1.5k");
check("whole thousands drop the decimal", compactMoney(6000, "Rs."), "Rs.6k");
check("ten-thousands round to whole k", compactMoney(12000, "Rs."), "Rs.12k");
check("just under a million rolls over to m", compactMoney(999_600, "Rs."), "Rs.1m");
check("millions", compactMoney(1_500_000, "Rs."), "Rs.1.5m");
check("negative uses U+2212", compactMoney(-6000, "Rs."), "−Rs.6k");
check("empty symbol is fine", compactMoney(1500, ""), "1.5k");

// --- niceCeil ---------------------------------------------------------------
check("niceCeil 400k -> 500k", niceCeil(400_000), 500_000);
check("niceCeil 42 -> 50", niceCeil(42), 50);
check("niceCeil 120 -> 200", niceCeil(120), 200);
check("niceCeil 1 -> 1", niceCeil(1), 1);
check("niceCeil 0 -> 1", niceCeil(0), 1);

console.log(failures === 0 ? "\nAll chart helper checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
