/**
 * POST /api/assistant/message
 *
 * The single entry point for the assistant.
 *
 * Body:
 *   { text: "Ali bought 20 cartons of rice, paid 15000" }
 *   { audio: { base64, mimeType } }        ← fallback when the browser has no
 *                                            speech recognition
 *
 * Response: { ok: true, data: AssistantReply }
 *   kind: "answer" | "plan" | "clarify" | "error"
 *
 * A `kind: "error"` reply is still HTTP 200: the client keeps the user's words
 * and offers a retry. Only genuine server faults produce a 4xx/5xx.
 *
 * Security:
 *   - userId comes from the session cookie, never the body.
 *   - the AI never receives IDs or balances and never writes to the database.
 */

import { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { handleMessage, toPublicReply } from "@/lib/assistant/service";
import { checkExecuteLimit } from "@/lib/smart-entry/rate-limit";
import { normalizeVoiceLang, pickVoice } from "@/lib/assistant/phrases";
import type { SpeechLanguage } from "@/lib/assistant/language";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 500;

const SPEECH_LANGUAGES: SpeechLanguage[] = ["en", "ur", "roman-ur", "mixed"];

type Body = {
  text?: unknown;
  audio?: { base64?: unknown; mimeType?: unknown };
  language?: unknown;
  lang?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);

    const { data: body } = await parseJsonBody<Body>(req);
    const lang = normalizeVoiceLang(body?.lang);
    const v = (key: Parameters<typeof pickVoice>[1], params?: Record<string, string | number>) =>
      pickVoice(lang, key, params);

    if (!body) throw new BadRequestError(v("errBodyRequired"));

    const limit = checkExecuteLimit(userId);
    if (!limit.allowed) {
      throw new BadRequestError(
        v("errRateLimited", { seconds: limit.retryAfterSec }),
      );
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length > MAX_TEXT_CHARS) {
      throw new BadRequestError(v("errCommandTooLong", { max: MAX_TEXT_CHARS }));
    }

    let audio: { base64: string; mimeType: string } | undefined;
    if (body.audio && typeof body.audio.base64 === "string" && body.audio.base64.length > 0) {
      const mimeType =
        typeof body.audio.mimeType === "string" && body.audio.mimeType
          ? body.audio.mimeType
          : "audio/webm";
      // base64 is ~4/3 of the byte size.
      if (body.audio.base64.length * 0.75 > MAX_AUDIO_BYTES) {
        throw new BadRequestError(v("errRecordingTooLarge"));
      }
      audio = { base64: body.audio.base64, mimeType };
    }

    if (!text && !audio) {
      throw new BadRequestError(v("errSayOrType"));
    }

    const language =
      typeof body.language === "string" &&
      SPEECH_LANGUAGES.includes(body.language as SpeechLanguage)
        ? (body.language as SpeechLanguage)
        : undefined;

    const reply = await handleMessage(userId, { text, audio, language, lang });
    return ok(toPublicReply(reply));
  } catch (error) {
    return fail(error);
  }
}
