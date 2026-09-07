"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "cn";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      router.push("/sign-in");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium text-emerald-200/80 transition-colors hover:text-white disabled:opacity-50",
        className
      )}
    >
      <LogOut className="size-3.5" />
      {isSigningOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
