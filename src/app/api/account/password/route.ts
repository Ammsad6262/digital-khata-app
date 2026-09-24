/**
 * /api/account/password
 *
 * PATCH → change password (requires current password verification)
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { UnauthorizedError, BadRequestError } from "@/lib/errors";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(6, "New password must be at least 6 characters."),
});

export async function PATCH(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) throw new UnauthorizedError("Not authenticated.");

    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = changePasswordSchema.parse(data);

    // Verify current password
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    const currentValid = await bcrypt.compare(parsed.currentPassword, user.passwordHash);
    if (!currentValid) {
      throw new BadRequestError("Current password is incorrect.");
    }

    // Hash new password
    const newHash = await bcrypt.hash(parsed.newPassword, 10);

    // Update
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return ok({ changed: true });
  } catch (error) {
    return fail(error);
  }
}
