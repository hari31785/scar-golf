"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, ArrowRight, Palmtree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return fallback;
}

/**
 * Sign-in screen. Passkey (WebAuthn) is the only authentication method —
 * email-OTP has been retired from the active product (see src/lib/auth.ts).
 *
 * There is no email/password entry here by design — passkeys are only
 * ever registered via an admin-issued `/enroll/[token]` invite, so a
 * member either already has one (and this button signs them in) or they
 * don't yet (and need an invite, not a form field, to get one).
 */
export function SignInFlow() {
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePasskeySignIn() {
    setError(null);
    setIsSigningIn(true);
    try {
      const { error } = await authClient.signIn.passkey();
      if (error) {
        setError(
          getErrorMessage(
            error,
            "Couldn't sign you in with a passkey. Please try again."
          )
        );
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <div className="flex flex-col items-center text-center">
      <Palmtree
        className="size-7 text-emerald-950 drop-shadow-[0_1px_2px_rgba(255,255,255,0.5)]"
        strokeWidth={1.75}
      />

      <p className="mt-3 text-sm font-bold tracking-[0.35em] text-emerald-950 uppercase drop-shadow-[0_1px_3px_rgba(255,255,255,0.6)]">
        SCAR Championship
      </p>
      <p className="mt-1 text-xs font-semibold tracking-[0.25em] text-emerald-900 uppercase drop-shadow-[0_1px_2px_rgba(255,255,255,0.5)]">
        South Carolina Amateur Round
      </p>

      <h1
        className="mt-5 text-[5rem] leading-[0.92] font-extrabold tracking-tight text-emerald-950 drop-shadow-[0_2px_6px_rgba(255,255,255,0.55)] sm:text-[7rem]"
        style={{ fontFamily: "var(--font-scar-display)" }}
      >
        SCAR
      </h1>
      <p className="mt-3 text-base font-bold tracking-[0.3em] text-emerald-950 uppercase drop-shadow-[0_1px_3px_rgba(255,255,255,0.6)] sm:text-lg">
        Golf · Friends · Competition
      </p>

      <p className="mt-7 text-base leading-relaxed font-medium text-amber-50 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] sm:text-lg">
        Sign in with your passkey to access
        <br />
        your SCAR membership.
      </p>

      <div className="mt-6 flex w-full max-w-sm flex-col gap-4">
        <Button
          type="button"
          onClick={handlePasskeySignIn}
          disabled={isSigningIn}
          className="h-16 w-full justify-between rounded-2xl bg-emerald-900 px-6 text-base font-bold text-amber-50 shadow-xl shadow-emerald-950/30 hover:bg-emerald-800"
        >
          <span className="flex items-center gap-3">
            <Fingerprint className="size-5 text-amber-50" />
            {isSigningIn ? "Waiting for passkey…" : "Sign in with Passkey"}
          </span>
          <ArrowRight className="size-5 text-amber-50" />
        </Button>

        {error ? (
          <p className="text-center text-sm font-medium text-rose-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex items-center gap-3">
          <span className="h-px flex-1 bg-amber-50/40" />
          <span className="text-xs font-semibold tracking-[0.2em] text-amber-50 uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
            New to SCAR?
          </span>
          <span className="h-px flex-1 bg-amber-50/40" />
        </div>

        <p className="text-center text-sm leading-relaxed font-medium text-amber-50/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
          Members receive a one-time enrollment link
          <br />
          from an admin to set up their passkey.
        </p>
      </div>

      <p
        className="mt-12 text-xl text-white italic drop-shadow-[0_2px_5px_rgba(0,0,0,0.65)] sm:mt-16"
        style={{ fontFamily: "var(--font-scar-display)" }}
      >
        More Than a Round
      </p>
      <span className="mt-2 h-px w-10 bg-white/80" />
    </div>
  );
}
