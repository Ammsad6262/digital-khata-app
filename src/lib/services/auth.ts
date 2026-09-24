/**
 * Auth service — user registration, login, JWT token management.
 *
 * Uses bcryptjs for password hashing (same lib as PIN auth).
 * JWT tokens are HMAC-SHA256 signed (same crypto.subtle approach as session.ts).
 *
 * Token payload: { userId, exp }
 * Stored in httpOnly cookie "dk_auth_token".
 */

import { prisma } from "@/lib/db/prisma";
import { NotFoundError, BadRequestError, UnauthorizedError } from "@/lib/errors";

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ────────────────────────────────────────────────────────────────────────────
// Password hashing
// ────────────────────────────────────────────────────────────────────────────

async function hashPassword(plaintext: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(plaintext, hash);
}

// ────────────────────────────────────────────────────────────────────────────
// JWT token (HMAC-SHA256, same approach as session.ts)
// ────────────────────────────────────────────────────────────────────────────

const AUTH_COOKIE_NAME = "dk_auth_token";

function getAuthSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to a 32+ char string in production.");
    }
    return "dev-insecure-secret-DO-NOT-USE-IN-PRODUCTION";
  }
  return secret;
}

async function signToken(payload: { userId: string }): Promise<string> {
  const secret = getAuthSecret();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS };

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "");
  const bodyB64 = btoa(JSON.stringify(body)).replace(/=/g, "");
  const data = `${headerB64}.${bodyB64}`;

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "");

  return `${data}.${sigB64}`;
}

export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  try {
    const secret = getAuthSecret();
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const [headerB64, bodyB64, sigB64] = token.split(".");
    if (!headerB64 || !bodyB64 || !sigB64) return null;

    const data = `${headerB64}.${bodyB64}`;
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));

    const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(data));
    if (!valid) return null;

    const body = JSON.parse(atob(bodyB64));
    if (body.exp && Math.floor(Date.now() / 1000) > body.exp) return null;

    return { userId: body.userId };
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

export type AuthResult = {
  user: AuthUser;
  token: string;
};

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!name) throw new BadRequestError("Name is required.");
  if (!email || !email.includes("@")) throw new BadRequestError("A valid email is required.");
  if (!password || password.length < 6) throw new BadRequestError("Password must be at least 6 characters.");

  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new BadRequestError("An account with this email already exists.");

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  const token = await signToken({ userId: user.id });

  return {
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
    token,
  };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) throw new BadRequestError("Email and password are required.");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError("Invalid email or password.");

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError("Invalid email or password.");

  const token = await signToken({ userId: user.id });

  return {
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
    token,
  };
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, createdAt: true },
  });
  return user;
}

export { AUTH_COOKIE_NAME };
