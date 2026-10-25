/**
 * Verifies the admin-issued password reset flow against a real database.
 *
 * What must be true:
 *   - The admin can issue a code for an existing email.
 *   - Only a hash is stored; the plaintext code is shown once.
 *   - The code expires, is single-use, and cannot reset another account.
 *   - Wrong attempts are limited, and a new code revokes the old one.
 *   - A successful reset changes the password and invalidates old codes.
 *   - A normal password change / "clear all data" revokes outstanding codes.
 *   - The admin route rejects requests without the admin secret.
 *   - The public route returns a generic error for a bad code.
 *
 * Run: npx tsx scripts/verify-password-reset.ts
 */

import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { loginUser } from "@/lib/services/auth";
import {
  MAX_RESET_ATTEMPTS,
  RESET_CODE_TTL_MINUTES,
  issuePasswordResetCode,
  resetPasswordWithCode,
  revokePasswordResetCodes,
} from "@/lib/services/password-reset";
import { isAdminRequest } from "@/lib/auth/admin";
import { clearAllData } from "@/lib/services/settings";
import { POST as adminResetPost } from "@/app/api/admin/password-reset/route";
import { POST as publicResetPost } from "@/app/api/auth/reset-password/route";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

async function expectFailure(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "expected an error but it succeeded");
  } catch {
    check(label, true);
  }
}

function adminRequest(secret: string | null, email: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-admin-secret"] = secret;
  return new NextRequest("http://localhost/api/admin/password-reset", {
    method: "POST",
    headers,
    body: JSON.stringify({ email }),
  });
}

function resetRequest(
  email: string,
  code: string,
  newPassword: string,
  ip: string,
): NextRequest {
  return new NextRequest("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, code, newPassword }),
  });
}

async function main() {
  const stamp = Date.now();
  const emailA = `pwreset_a_${stamp}@test.local`;
  const emailB = `pwreset_b_${stamp}@test.local`;
  const oldPassword = "oldpass123";
  const firstNewPassword = "newpass456";
  const secondNewPassword = "thirdpass789";
  const routePassword = "routepass123";
  const passwordHash = await bcrypt.hash(oldPassword, 10);
  const previousAdminSecret = process.env.ADMIN_SECRET;

  console.log("\n== Setup ==");
  const userA = await prisma.user.create({
    data: { name: "Reset Test A", email: emailA, passwordHash },
  });
  const userB = await prisma.user.create({
    data: { name: "Reset Test B", email: emailB, passwordHash },
  });

  try {
    // ── Admin header helper ──────────────────────────────────────────────
    console.log("\n== Admin header ==");
    process.env.ADMIN_SECRET = "test-admin-secret-123456";
    check(
      "correct admin secret is accepted",
      isAdminRequest(adminRequest("test-admin-secret-123456", emailA)),
    );
    check(
      "wrong admin secret is rejected",
      !isAdminRequest(adminRequest("wrong-secret-123456", emailA)),
    );
    check(
      "missing admin secret is rejected",
      !isAdminRequest(adminRequest(null, emailA)),
    );
    process.env.ADMIN_SECRET = "short";
    check(
      "admin secret shorter than 16 chars is rejected",
      !isAdminRequest(adminRequest("short", emailA)),
    );
    process.env.ADMIN_SECRET = "test-admin-secret-123456";

    // ── Issue ────────────────────────────────────────────────────────────
    console.log("\n== Issue a code ==");
    const issued = await issuePasswordResetCode(` ${emailA.toUpperCase()} `);
    check(
      "code has the expected format",
      /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(issued.code),
      issued.code,
    );
    check("code is tied to the requested user", issued.user.id === userA.id);
    check("returned email is normalized", issued.user.email === emailA);

    const expiresInMinutes =
      (issued.expiresAt.getTime() - Date.now()) / 60_000;
    check(
      `code expires in about ${RESET_CODE_TTL_MINUTES} minutes`,
      expiresInMinutes > RESET_CODE_TTL_MINUTES - 1 &&
        expiresInMinutes <= RESET_CODE_TTL_MINUTES + 1,
      String(expiresInMinutes),
    );

    const issuedRow = await prisma.passwordResetCode.findFirst({
      where: { userId: userA.id },
      orderBy: { createdAt: "desc" },
    });
    check("a code row was stored", !!issuedRow);
    check(
      "the plaintext code is not stored",
      !!issuedRow &&
        issuedRow.codeHash !== issued.code &&
        !issuedRow.codeHash.includes(issued.code.replace(/-/g, "")),
    );
    check(
      "the stored value is a SHA-256 hex hash",
      !!issuedRow && /^[a-f0-9]{64}$/.test(issuedRow.codeHash),
    );
    const issueAudit = await prisma.auditLog.findFirst({
      where: { userId: userA.id, action: "password.reset_code_issued" },
    });
    check("issuing a code writes an audit row", !!issueAudit);

    // ── Wrong code and cross-account use ─────────────────────────────────
    console.log("\n== Wrong code / cross-account ==");
    await expectFailure("a wrong code is rejected", () =>
      resetPasswordWithCode({
        email: emailA,
        code: "AAAA-AAAA-AAAA",
        newPassword: firstNewPassword,
      }),
    );
    const oldLoginStillWorks = await loginUser({
      email: emailA,
      password: oldPassword,
    });
    check("a wrong code does not change the password", !!oldLoginStillWorks.user);

    await expectFailure("a code for A cannot reset B", () =>
      resetPasswordWithCode({
        email: emailB,
        code: issued.code,
        newPassword: "hacked123",
      }),
    );
    const bLoginStillWorks = await loginUser({
      email: emailB,
      password: oldPassword,
    });
    check("B's password is unchanged", !!bLoginStillWorks.user);

    // ── Successful reset ─────────────────────────────────────────────────
    console.log("\n== Successful reset ==");
    const resetResult = await resetPasswordWithCode({
      email: emailA,
      code: issued.code.toLowerCase().replace(/-/g, " "),
      newPassword: firstNewPassword,
    });
    check("reset returns success", resetResult.reset === true);

    const usedRow = await prisma.passwordResetCode.findUnique({
      where: { id: issuedRow!.id },
    });
    check("the used code is marked used", !!usedRow?.usedAt);
    check("the used code is not revoked as a side effect", usedRow?.revokedAt === null);

    await expectFailure("the old password no longer works", () =>
      loginUser({ email: emailA, password: oldPassword }),
    );
    const newLoginWorks = await loginUser({
      email: emailA,
      password: firstNewPassword,
    });
    check("the new password works", !!newLoginWorks.user);

    await expectFailure("a used code cannot be reused", () =>
      resetPasswordWithCode({
        email: emailA,
        code: issued.code,
        newPassword: secondNewPassword,
      }),
    );
    const resetAudit = await prisma.auditLog.findFirst({
      where: { userId: userA.id, action: "password.reset" },
    });
    check("a successful reset writes an audit row", !!resetAudit);

    // ── Reissue revokes the old code ─────────────────────────────────────
    console.log("\n== Reissue ==");
    const firstCode = await issuePasswordResetCode(emailA);
    const secondCode = await issuePasswordResetCode(emailA);
    await expectFailure("the older code is revoked by a newer code", () =>
      resetPasswordWithCode({
        email: emailA,
        code: firstCode.code,
        newPassword: secondNewPassword,
      }),
    );
    await resetPasswordWithCode({
      email: emailA,
      code: secondCode.code,
      newPassword: secondNewPassword,
    });
    const secondLoginWorks = await loginUser({
      email: emailA,
      password: secondNewPassword,
    });
    check("the newest code works", !!secondLoginWorks.user);

    // ── Expired code ─────────────────────────────────────────────────────
    console.log("\n== Expiry ==");
    const expiredCode = await issuePasswordResetCode(emailA);
    await prisma.passwordResetCode.updateMany({
      where: { userId: userA.id, usedAt: null, revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expectFailure("an expired code is rejected", () =>
      resetPasswordWithCode({
        email: emailA,
        code: expiredCode.code,
        newPassword: "expiredpass123",
      }),
    );

    // ── Attempt limit ────────────────────────────────────────────────────
    console.log("\n== Attempt limit ==");
    const attemptCode = await issuePasswordResetCode(emailA);
    for (let i = 0; i < MAX_RESET_ATTEMPTS; i++) {
      await expectFailure(`wrong attempt ${i + 1} is rejected`, () =>
        resetPasswordWithCode({
          email: emailA,
          code: "BBBB-BBBB-BBBB",
          newPassword: "attemptpass123",
        }),
      );
    }
    const attemptRow = await prisma.passwordResetCode.findFirst({
      where: { userId: userA.id, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    check(
      "the code is revoked after the attempt limit",
      !!attemptRow &&
        attemptRow.attempts === MAX_RESET_ATTEMPTS &&
        !!attemptRow.revokedAt,
      attemptRow ? `attempts=${attemptRow.attempts}` : "no row",
    );
    await expectFailure("the correct code is rejected after too many attempts", () =>
      resetPasswordWithCode({
        email: emailA,
        code: attemptCode.code,
        newPassword: "attemptpass123",
      }),
    );

    // ── Normal password change revokes outstanding codes ─────────────────
    console.log("\n== Revocation ==");
    const revokeCode = await issuePasswordResetCode(emailA);
    await revokePasswordResetCodes(userA.id);
    await expectFailure("a normal password change revokes outstanding codes", () =>
      resetPasswordWithCode({
        email: emailA,
        code: revokeCode.code,
        newPassword: "revokedpass123",
      }),
    );

    // ── Unknown email ────────────────────────────────────────────────────
    console.log("\n== Unknown email ==");
    await expectFailure("the admin cannot issue a code for an unknown email", () =>
      issuePasswordResetCode(`missing_${stamp}@test.local`),
    );

    // ── Clear all data removes security codes ────────────────────────────
    console.log("\n== Clear all data ==");
    await issuePasswordResetCode(emailA);
    await clearAllData(userA.id);
    const remainingCodes = await prisma.passwordResetCode.count({
      where: { userId: userA.id },
    });
    check("clear all data removes reset codes", remainingCodes === 0);

    // ── Admin API route ──────────────────────────────────────────────────
    console.log("\n== Admin API route ==");
    const adminResponse = await adminResetPost(adminRequest(process.env.ADMIN_SECRET!, emailA));
    const adminJson = await adminResponse.json();
    check(
      "admin route issues a code with the secret",
      adminResponse.status === 200 && adminJson.ok === true && !!adminJson.data?.code,
      `status=${adminResponse.status}`,
    );
    const routeCode = adminJson.data?.code as string;

    const noSecretResponse = await adminResetPost(adminRequest(null, emailA));
    check(
      "admin route rejects a request without the secret",
      noSecretResponse.status === 401,
      `status=${noSecretResponse.status}`,
    );

    // ── Public reset API route ───────────────────────────────────────────
    console.log("\n== Public API route ==");
    const publicResponse = await publicResetPost(
      resetRequest(emailA, routeCode, routePassword, "203.0.113.10"),
    );
    const publicJson = await publicResponse.json();
    check(
      "public route resets the password with a valid code",
      publicResponse.status === 200 && publicJson.ok === true,
      `status=${publicResponse.status}`,
    );
    const routeLoginWorks = await loginUser({
      email: emailA,
      password: routePassword,
    });
    check("the password set through the route works", !!routeLoginWorks.user);

    const badResponse = await publicResetPost(
      resetRequest(emailA, "CCCC-CCCC-CCCC", "badcode123", "203.0.113.11"),
    );
    const badJson = await badResponse.json();
    check(
      "public route rejects a bad code",
      badResponse.status === 400 && badJson.ok === false,
      `status=${badResponse.status}`,
    );
    check(
      "public route uses a generic invalid-code message",
      typeof badJson.error?.message === "string" &&
        badJson.error.message.toLowerCase().includes("invalid or has expired"),
      badJson.error?.message,
    );
  } finally {
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    if (previousAdminSecret === undefined) {
      delete process.env.ADMIN_SECRET;
    } else {
      process.env.ADMIN_SECRET = previousAdminSecret;
    }
    await prisma.$disconnect();
  }

  console.log(`\n== Result: ${passed} passed, ${failed} failed ==`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
