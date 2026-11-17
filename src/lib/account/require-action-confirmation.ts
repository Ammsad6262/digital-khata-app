/**
 * Enforce the emailed-code confirmation on a destructive request.
 *
 * Every guarded endpoint calls this before it touches data. It throws a 400 with
 * a specific translation key, so the UI can say exactly what went wrong instead
 * of a generic failure.
 */

import { BadRequestError } from "@/lib/errors";
import { verifyActionToken, type ConfirmableAction } from "./action-confirmation";

export type ActionConfirmationInput = {
  userId: string;
  action: ConfirmableAction;
  token: unknown;
  code: unknown;
};

export function requireActionConfirmation(input: ActionConfirmationInput): void {
  const token = typeof input.token === "string" ? input.token : "";
  const code = typeof input.code === "string" ? input.code : "";

  if (!token || !code) {
    throw new BadRequestError("api.account.confirmRequired");
  }

  const result = verifyActionToken(token, input.userId, input.action, code);
  if (result.ok) return;

  switch (result.reason) {
    case "expired":
      throw new BadRequestError("api.account.confirmExpired");
    case "wrong_code":
      throw new BadRequestError("api.account.confirmWrongCode");
    case "wrong_action":
      throw new BadRequestError("api.account.confirmWrongAction");
    default:
      throw new BadRequestError("api.account.confirmInvalid");
  }
}