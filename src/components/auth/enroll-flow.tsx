"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type EnrollMember = {
  displayName: string;
  firstName: string;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return fallback;
}

export function EnrollFlow({
  token,
  member,
}: {
  token: string;
  member: EnrollMember | null;
}) {
  const router = useRouter();
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!member) {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <ShieldCheck className="size-7" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
          Link unavailable
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This enrollment link is invalid, has expired, or has already been
          used. Contact an admin for a new invite.
        </p>
      </div>
    );
  }

  async function handleEnroll() {
    setError(null);
    setIsEnrolling(true);
    try {
      const { error } = await authClient.passkey.addPasskey({
        context: token,
        createSession: true,
        name: `${member!.displayName}'s passkey`,
      });

      if (error) {
        setError(
          getErrorMessage(
            error,
            "Couldn't set up your passkey. Please try again or ask for a new invite link."
          )
        );
        return;
      }

      setDone(true);
      router.push("/");
      router.refresh();
    } finally {
      setIsEnrolling(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-900 text-emerald-300 shadow-lg shadow-emerald-950/30">
          <KeyRound className="size-7" />
        </div>
        <p className="mt-4 text-[0.65rem] font-semibold tracking-[0.25em] text-emerald-800 uppercase">
          SCAR Championship
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Welcome, {member.firstName}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up a passkey to finish enrolling. You&apos;ll use it to sign in
          from now on — no passwords, no codes.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Button
          type="button"
          onClick={handleEnroll}
          disabled={isEnrolling || done}
          className="h-12 w-full rounded-xl bg-emerald-900 text-base font-semibold text-emerald-50 hover:bg-emerald-800"
        >
          {done
            ? "Enrolled — redirecting…"
            : isEnrolling
              ? "Follow your device's prompt…"
              : "Create Passkey"}
        </Button>

        {error ? (
          <p className="text-center text-sm text-destructive">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
