/**
 * Spoken-quantity guard.
 *
 * Voice models occasionally transcribe "25 kilo" correctly but put 50 in the
 * structured quantity field (a known Pashto/Urdu failure). The transcript is the
 * authoritative record of what the owner said, so when it contains an explicit
 * "<number> <unit>", that number wins over the model's field.
 *
 * Pure module: no Prisma, no AI — directly unit-tested.
 */

import { normalizeText } from "./nlg";
import type { RouteMatch } from "./types";

/** Number followed by a unit, in Latin, Urdu, or Pashto script. */
export const SPOKEN_QUANTITY_RE =
  /(?:^|\s)(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|kilogram|kilograms|carton|cartons|box|boxes|bag|bags|piece|pieces|pcs|dozen|packet|packets|litre|liter|litres|liters|کیلو|کيلو|كيلو|کلو|كیلو|کارتن|كارتون|كرتون|بکس|بوری|درجن|پیکٹ)(?=\s|$)/i;

export function spokenQuantity(text: string): number | null {
  const match = normalizeText(text).match(SPOKEN_QUANTITY_RE);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Replace a model's quantity with the number the owner actually said. */
export function guardSpokenQuantity(match: RouteMatch, spoken: string): RouteMatch {
  if (match.type !== "action") return match;
  if (
    match.action !== "CREATE_SALE" &&
    match.action !== "CREATE_PURCHASE" &&
    match.action !== "ADD_STOCK"
  ) {
    return match;
  }
  const quantity = spokenQuantity(spoken);
  if (quantity === null || match.fields.quantity === quantity) return match;
  return { ...match, fields: { ...match.fields, quantity } };
}