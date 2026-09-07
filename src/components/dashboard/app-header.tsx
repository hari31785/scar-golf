import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function AppHeader({
  greetingName,
  initials,
  isAdmin = false,
}: {
  greetingName: string;
  initials: string;
  isAdmin?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-emerald-900/10 bg-emerald-950 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-emerald-300 uppercase">
            SCAR Championship
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Good morning, {greetingName}
          </h1>
          <div className="mt-1 flex items-center gap-3">
            <SignOutButton />
            {isAdmin ? (
              <Link
                href="/admin/members"
                className="flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200"
              >
                <ShieldCheck className="size-3.5" />
                Admin
              </Link>
            ) : null}
          </div>
        </div>
        <Avatar size="lg" className="ring-2 ring-emerald-400/40">
          <AvatarFallback className="bg-emerald-800 font-semibold text-emerald-50">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
