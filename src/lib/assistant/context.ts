/**
 * Conversation context.
 *
 * Stores the last customer / product / supplier / sale a user talked about so
 * follow-ups work:
 *   User: "Ali bought 20 cartons of rice"
 *   User: "he paid another 5000"
 *
 * Persisted per user (AssistantThread) with an in-memory fallback so a missing
 * table never breaks the assistant.
 */

import { prisma } from "@/lib/db/prisma";
import type { ThreadContext } from "./types";

const MAX_AGE_MS = 6 * 60 * 60 * 1000; // context is useful for one working day
const memory = new Map<string, ThreadContext>();
let dbUnavailable = false;

function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === "P2021" || code === "P2022";
}

function isFresh(ctx: ThreadContext | null): ctx is ThreadContext {
  if (!ctx?.updatedAt) return false;
  return Date.now() - new Date(ctx.updatedAt).getTime() < MAX_AGE_MS;
}

export async function loadThread(userId: string): Promise<ThreadContext> {
  if (!dbUnavailable) {
    try {
      const row = await prisma.assistantThread.findUnique({ where: { userId } });
      if (row) {
        const ctx = (row.context ?? {}) as ThreadContext;
        memory.set(userId, ctx);
        return isFresh(ctx) ? ctx : {};
      }
      return {};
    } catch (error) {
      if (isMissingTable(error)) {
        dbUnavailable = true;
        console.warn("[assistant] AssistantThread table missing — memory context only.");
      } else {
        console.error("[assistant] thread read failed:", error);
      }
    }
  }
  const cached = memory.get(userId) ?? null;
  return isFresh(cached) ? cached : {};
}

export async function saveThread(
  userId: string,
  patch: Partial<ThreadContext>,
): Promise<ThreadContext> {
  const existing = await loadThread(userId);
  const merged: ThreadContext = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  // Drop empty keys so the context stays small.
  for (const key of Object.keys(merged) as Array<keyof ThreadContext>) {
    if (merged[key] === undefined || merged[key] === null) delete merged[key];
  }
  memory.set(userId, merged);

  if (!dbUnavailable) {
    try {
      await prisma.assistantThread.upsert({
        where: { userId },
        create: { userId, context: merged },
        update: { context: merged },
      });
    } catch (error) {
      if (isMissingTable(error)) {
        dbUnavailable = true;
      } else {
        console.error("[assistant] thread write failed:", error);
      }
    }
  }
  return merged;
}

/** Test helper. */
export function _resetThreadCache(): void {
  memory.clear();
  dbUnavailable = false;
}