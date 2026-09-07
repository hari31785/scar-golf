"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, ShieldCheck } from "lucide-react";
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
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-900 text-emerald-300 shadow-lg shadow-emerald-950/30">
          <ShieldCheck className="size-7" />
        </div>
        <p className="mt-4 text-[0.65rem] font-semibold tracking-[0.25em] text-emerald-800 uppercase">
          SCAR Championship
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Member Sign In
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with the passkey linked to your SCAR membership.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Button
          type="button"
          onClick={handlePasskeySignIn}
          disabled={isSigningIn}
          className="h-12 w-full rounded-xl bg-emerald-900 text-base font-semibold text-emerald-50 hover:bg-emerald-800"
        >
          <Fingerprint className="size-5" />
          {isSigningIn ? "Waiting for passkey…" : "Sign in with Passkey"}
        </Button>

        {error ? (
          <p className="text-center text-sm text-destructive">{error}</p>
        ) : null}

        <p className="text-center text-xs text-muted-foreground">
          New members receive a one-time enrollment link from an admin to
          set up their passkey.
        </p>
      </div>
    </div>
  );
}
