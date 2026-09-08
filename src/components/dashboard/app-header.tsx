import Link from "next/link";
import { ShieldCheck, Palmtree } from "lucide-react";
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
    <header className="relative sticky top-0 z-20 overflow-hidden border-b border-emerald-900/10 bg-gradient-to-br from-emerald-900 via-emerald-950 to-black px-5 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 text-white lg:px-8">
      <div className="bg-golf-dimples pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative mx-auto flex w-full max-w-[1200px] items-center justify-between">
        <div className="flex items-center gap-2">
          <Palmtree className="size-5 shrink-0 text-emerald-300" strokeWidth={1.5} />
          <p
            className="text-lg font-bold tracking-wide text-white"
            style={{ fontFamily: "var(--font-scar-display)" }}
          >
            SCAR
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <p
              className="text-xs leading-tight font-medium text-white/70"
              style={{ fontFamily: "var(--font-scar-display)" }}
            >
              Good morning, {greetingName}
            </p>
            <div className="mt-1 flex items-center justify-end gap-2.5">
              {isAdmin ? (
                <Link
                  href="/admin"
                  className="flex items-center gap-1 text-[0.7rem] font-medium text-white/50 hover:text-emerald-300"
                >
                  <ShieldCheck className="size-3" />
                  Admin
                </Link>
              ) : null}
              <SignOutButton />
            </div>
          </div>
          <Avatar
            size="sm"
            className="ring-1 ring-white/20 ring-offset-2 ring-offset-emerald-950"
          >
            <AvatarFallback className="bg-white/90 text-xs font-semibold text-emerald-900">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
