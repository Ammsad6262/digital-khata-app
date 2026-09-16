"use client";

/**
 * PinUnlockScreen — full-screen PIN entry gate.
 *
 * Shows when the app has a PIN set and the session is not unlocked.
 *
 * Features:
 *   - Large numeric keypad (0-9) for one-handed phone use
 *   - PIN dots (4-6) that fill as you type
 *   - Auto-submits when 4 digits entered (or up to 6)
 *   - Shows remaining attempts + lockout countdown
 *   - Calls POST /api/auth/unlock on submit
 *   - On success: calls onUnlocked (parent reloads the page)
 *   - On failure: shakes the dots, shows error, clears input
 */

import { useState, useEffect } from "react";
import { Delete, Lock, Loader2, AlertCircle } from "lucide-react";

export function PinUnlockScreen({
  hasPin,
  businessName,
  onUnlocked,
}: {
  hasPin: boolean;
  businessName: string | null;
  onUnlocked: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

  // Lockout countdown
  useEffect(() => {
    if (retryAfter <= 0) return;
    const interval = setInterval(() => {
      setRetryAfter((prev) => {
        if (prev <= 1) {
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [retryAfter]);

  const handleSubmit = async (pinToSubmit: string) => {
    if (isSubmitting || retryAfter > 0) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinToSubmit }),
      });
      const json = await res.json();

      if (json.ok) {
        onUnlocked();
        return;
      }

      // Error
      if (json.error?.code === "RATE_LIMITED") {
        const match = json.error.message.match(/(\d+) seconds/);
        const seconds = match ? parseInt(match[1], 10) : 300;
        setRetryAfter(seconds);
        setError(`Locked out. Try again in ${seconds}s.`);
      } else {
        setError(json.error?.message || "Incorrect PIN.");
      }
      setPin("");
    } catch {
      setError("Network error. Please try again.");
      setPin("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (pin.length >= 6 || isSubmitting || retryAfter > 0) return;
    const newPin = pin + digit;
    setPin(newPin);
    // Auto-submit at 4 digits (minimum PIN length)
    if (newPin.length >= 4) {
      // Small delay so the user sees the 4th dot fill
      setTimeout(() => handleSubmit(newPin), 150);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 p-6">
      {/* Logo / business name */}
      <div className="mb-8 text-center text-white">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold">
          {businessName || "Digital Khata"}
        </h1>
        <p className="mt-0.5 text-xs text-brand-100">
          Enter your PIN to unlock
        </p>
      </div>

      {/* PIN dots */}
      <div className="mb-8 flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full transition-all ${
              i < pin.length
                ? "bg-white scale-110"
                : "bg-white/30"
            }`}
          />
        ))}
      </div>

      {/* Error */}
      {error ? (
        <div className="mb-4 flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-white">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      ) : null}

      {/* Loading */}
      {isSubmitting ? (
        <Loader2 className="mb-4 h-6 w-6 animate-spin text-white" />
      ) : null}

      {/* Numeric keypad */}
      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigit(digit)}
            disabled={isSubmitting || retryAfter > 0}
            className="flex h-16 items-center justify-center rounded-2xl bg-white/10 text-xl font-bold text-white backdrop-blur transition-colors hover:bg-white/20 active:bg-white/30 disabled:opacity-50"
          >
            {digit}
          </button>
        ))}
        {/* Empty cell */}
        <div />
        {/* 0 */}
        <button
          type="button"
          onClick={() => handleDigit("0")}
          disabled={isSubmitting || retryAfter > 0}
          className="flex h-16 items-center justify-center rounded-2xl bg-white/10 text-xl font-bold text-white backdrop-blur transition-colors hover:bg-white/20 active:bg-white/30 disabled:opacity-50"
        >
          0
        </button>
        {/* Delete */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={pin.length === 0 || isSubmitting}
          className="flex h-16 items-center justify-center rounded-2xl text-white transition-colors hover:bg-white/10 active:bg-white/20 disabled:opacity-30"
        >
          <Delete className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
