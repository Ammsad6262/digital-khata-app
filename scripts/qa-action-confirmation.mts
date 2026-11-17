/**
 * Unit tests for the step-up email confirmation token.
 *
 * Run: npx tsx scripts/qa-action-confirmation.mts
 */
import {
  ACTION_CODE_TTL_MS,
  createActionToken,
  generateActionCode,
  isConfirmableAction,
  isValidActionCode,
  maskEmail,
  normaliseActionCode,
  verifyActionToken,
} from "../src/lib/account/action-confirmation";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(52)} got ${String(actual)}${ok ? "" : `  expected ${String(expected)}`}`);
}

const USER = "user_abc";
const OTHER = "user_xyz";

console.log("--- code shape ---");
const code = generateActionCode();
check("code is 6 digits", /^\d{6}$/.test(code), true);
check("1000 generated codes are all 6 digits", Array.from({ length: 1000 }, generateActionCode).every((c) => /^\d{6}$/.test(c)), true);
check("normalise strips spaces/dashes", normaliseActionCode(" 12-34 56 "), "123456");
check("normalise caps length", normaliseActionCode("1234567890"), "123456");
check("isValidActionCode accepts 6 digits", isValidActionCode("123456"), true);
check("isValidActionCode rejects 5 digits", isValidActionCode("12345"), false);
check("action guard accepts known action", isConfirmableAction("delete_account"), true);
check("action guard rejects unknown", isConfirmableAction("drop_database"), false);

console.log();
console.log("--- the happy path ---");
const token = createActionToken(USER, "delete_account", code);
check("correct code verifies", verifyActionToken(token, USER, "delete_account", code).ok, true);
check("verifies with messy input (spaces)", verifyActionToken(token, USER, "delete_account", ` ${code} `).ok, true);

console.log();
console.log("--- every way it must refuse ---");
const wrongCode = code === "000000" ? "111111" : "000000";
const r = (tokenToCheck: string, user = USER, action: Parameters<typeof verifyActionToken>[2] = "delete_account", c = code) =>
  verifyActionToken(tokenToCheck, user, action, c);

check("wrong code", (r(token, USER, "delete_account", wrongCode) as { reason?: string }).reason, "wrong_code");
check("wrong action", (r(token, USER, "export_data") as { reason?: string }).reason, "wrong_action");
check("different user", (r(token, OTHER) as { reason?: string }).reason, "malformed");
check("empty token", (r("") as { reason?: string }).reason, "malformed");
check("token with no signature", (r(token.split(".")[0]!) as { reason?: string }).reason, "malformed");
check("garbage token", (r("not-a-token") as { reason?: string }).reason, "malformed");

// tamper with the body, keep the signature
const [body, sig] = token.split(".") as [string, string];
const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
decoded.a = "clear_data";
const tampered = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${sig}`;
check("tampered body is rejected", (r(tampered) as { reason?: string }).reason, "malformed");

// a correctly-signed token for a DIFFERENT user must not be usable as ours
const otherToken = createActionToken(OTHER, "delete_account", code);
check("another user's valid token is rejected", (r(otherToken) as { reason?: string }).reason, "malformed");

console.log();
console.log("--- expiry ---");
const created = Date.now();
const fresh = createActionToken(USER, "clear_data", code, created);
check("valid just before expiry", verifyActionToken(fresh, USER, "clear_data", code, created + ACTION_CODE_TTL_MS - 1).ok, true);
check("expired just after", (verifyActionToken(fresh, USER, "clear_data", code, created + ACTION_CODE_TTL_MS + 1) as { reason?: string }).reason, "expired");
check("expiry far in the future is refused", (verifyActionToken(fresh, USER, "clear_data", code, created - 60_000) as { reason?: string }).reason, "malformed");

console.log();
console.log("--- email masking ---");
check("masks a normal address", maskEmail("ammar@gmail.com"), "a***r@gmail.com");
check("masks a short local part", maskEmail("ab@gmail.com"), "a***@gmail.com");
check("handles nonsense", maskEmail("nope"), "your email");

console.log();
console.log(failures === 0 ? "all confirmation checks pass" : `${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
