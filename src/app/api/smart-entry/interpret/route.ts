/**
 * POST /api/smart-entry/interpret
 * Body: { text: "..." } OR { audio: { base64, mimeType } }
 * Returns: { ok: true, data: InterpretResult }
 */
import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError, AppError, ErrorCode } from "@/lib/errors";
import { interpretInput } from "@/lib/smart-entry/service";
import { interpretRequestSchema } from "@/lib/smart-entry/schema";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error || !data) throw new BadRequestError(error || "Invalid request body.");
    const parsed = interpretRequestSchema.safeParse(data);
    if (!parsed.success) throw new BadRequestError("Invalid request", parsed.error.issues);

    if (parsed.data.text) {
      const result = await interpretInput(userId, { type: "text", text: parsed.data.text });
      return ok(result);
    }
    const { base64, mimeType } = parsed.data.audio!;
    if (base64.length * 0.75 > MAX_AUDIO_BYTES) throw new BadRequestError("Audio too large (max 5MB).");
    const audioBytes = Uint8Array.from(Buffer.from(base64, "base64"));
    const result = await interpretInput(userId, { type: "audio", audio: audioBytes, mimeType });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
