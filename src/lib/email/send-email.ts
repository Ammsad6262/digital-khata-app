/**
 * Email delivery — one function, chosen at call time.
 *
 *   RESEND_API_KEY set  → Resend HTTP API (plain fetch; no SDK, no dependency)
 *   otherwise           → console provider
 *
 * The console provider exists so registration and verification can be exercised
 * before a domain is verified:
 *   - development/test: the full email body (including the code) is printed to
 *     the server console, so the developer can complete the flow.
 *   - production: only "email skipped (no provider configured)" with the
 *     template name and recipient — never the code.
 *
 * `sendEmail` NEVER throws into the request path. Callers get
 * `{ sent, provider }` and decide what to do; registration treats delivery as
 * best-effort, and the verification endpoint still lets the user resend.
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Template name for logs. Never contains the code. */
  template?: string;
};

export type SendEmailProvider = "resend" | "console";

export type SendEmailResult = {
  /** True only when the mail was actually handed to a provider. */
  sent: boolean;
  provider: SendEmailProvider;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Dukhata <no-reply@dukhata.com>";
const REQUEST_TIMEOUT_MS = 8000;

/** A provider is configured when Resend has an API key. Provider is implicit. */
export function isEmailProviderConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || DEFAULT_FROM;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const template = input.template || "generic";
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    try {
      if (process.env.NODE_ENV !== "production") {
        // Local/CI: show the whole message so the flow is testable without a
        // provider. This branch never runs in production.
        console.log(`[email] console provider template=${template} to=${input.to}`);
        console.log(`[email] subject: ${input.subject}`);
        console.log(input.text);
      } else {
        console.log(
          `[email] skipped (no provider configured) template=${template} to=${input.to}`,
        );
      }
    } catch {
      // Logging must never break the caller.
    }
    // In non-production the code is visible in the console, so a developer can
    // complete the flow; in production nothing was delivered.
    return { sent: process.env.NODE_ENV !== "production", provider: "console" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Status code only — response bodies can echo the recipient or payload.
      console.error(`[email] resend status ${res.status} template=${template}`);
      return { sent: false, provider: "resend" };
    }

    return { sent: true, provider: "resend" };
  } catch (error) {
    // Never log the payload. A timeout/network failure is enough to know.
    const reason =
      error instanceof Error && error.name === "TimeoutError" ? "timeout" : "request failed";
    console.error(`[email] resend ${reason} template=${template}`);
    return { sent: false, provider: "resend" };
  }
}