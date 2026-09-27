/**
 * /api/account
 *
 * GET    → fetch current user's profile (safe data, no passwordHash)
 * PATCH  → update name (and optionally email)
 * DELETE → delete account + all associated data
 *
 * All operations derive the user ID from the authenticated session (JWT cookie).
 * The client NEVER provides a userId — it's always derived server-side.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { UnauthorizedError, BadRequestError, ConflictError } from "@/lib/errors";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// ── GET: fetch profile ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) throw new UnauthorizedError("Not authenticated.");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new UnauthorizedError("Account not found.");

    return ok(user);
  } catch (error) {
    return fail(error);
  }
}

// ── PATCH: update profile ──────────────────────────────────────────────────

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100).optional(),
  email: z.string().trim().toLowerCase().email("Valid email required.").optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) throw new UnauthorizedError("Not authenticated.");

    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = updateProfileSchema.parse(data);

    // If email is changing, check it's not already taken
    if (parsed.email) {
      const existing = await prisma.user.findUnique({
        where: { email: parsed.email },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictError("This email is already used by another account.");
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.email !== undefined && { email: parsed.email }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return ok(updated);
  } catch (error) {
    return fail(error);
  }
}

// ── DELETE: delete account + all data ──────────────────────────────────────

const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required to confirm deletion."),
});

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) throw new UnauthorizedError("Not authenticated.");

    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = deleteAccountSchema.parse(data);

    // Verify password before deletion
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    const passwordValid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!passwordValid) {
      throw new BadRequestError("Incorrect password. Account was not deleted.");
    }

    // Delete the user — CASCADE will remove all their data
    // (Customer, Product, Sale, Payment, Expense, StockMove, Transaction, CustomerAdjustment)
    await prisma.user.delete({
      where: { id: userId },
    });

    // Clear the auth cookie
    const res = ok({ deleted: true });
    res.cookies.delete("dk_auth_token");

    return res;
  } catch (error) {
    return fail(error);
  }
}
