import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Trophy, Users, Settings } from "lucide-react";
import { getCurrentMember } from "@/lib/current-member";
import { PageHero } from "@/components/dashboard/page-hero";

export const metadata: Metadata = {
  title: "Admin · SCAR Championship",
};

const cards = [
  {
    href: "/admin/championship",
    title: "Championships",
    description: "Create, configure, run, and manage SCAR championships.",
    cta: "Manage Championships →",
    icon: Trophy,
  },
  {
    href: "/admin/members",
    title: "Members",
    description: "Manage members, roles, status, and enrollment.",
    cta: "Manage Members →",
    icon: Users,
  },
  {
    href: "/admin/championship#settings",
    title: "Settings",
    description: "Manage SCAR-wide tournament settings.",
    cta: "Manage Settings →",
    icon: Settings,
  },
] as const;

export default async function AdminDashboardPage() {
  const current = await getCurrentMember();

  if (!current) {
    redirect("/sign-in");
  }

  // Server-side authorization boundary — mirrors every other admin page.
  if (current.member.appRole !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <header className="sticky top-0 z-20 border-b border-emerald-900/10 bg-emerald-950 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 text-white">
        <Link
          href="/"
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200"
        >
          <ArrowLeft className="size-3.5" />
          Dashboard
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-900 text-emerald-300">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-emerald-300 uppercase">
              Admin
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              Control Center
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 pb-16 pt-5">
        <PageHero title="Admin" />
        {cards.map(({ href, title, description, cta, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <Icon className="size-5 text-emerald-800" />
              <h2 className="text-base font-semibold text-foreground">
                {title}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
            <span className="mt-1 text-xs font-semibold text-emerald-800">
              {cta}
            </span>
          </Link>
        ))}
      </main>
    </div>
  );
}
