import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Trophy, ShieldCheck, BarChart3, HelpCircle, BookOpen, ScrollText } from "lucide-react";
import { getCurrentMember } from "@/lib/current-member";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";

export default async function MorePage() {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;

  const links = [
    { href: "/pairings", label: "Pairings", description: "Tee times and groups for every round", icon: Users },
    { href: "/leaderboard", label: "Leaderboard", description: "Live championship standings", icon: Trophy },
    { href: "/handicaps", label: "Handicaps", description: "Current SCAR handicaps for every member", icon: BarChart3 },
    { href: "/rules", label: "Rules", description: "The current SCAR championship rules", icon: ScrollText },
    { href: "/how-to", label: "How To", description: "Install, sign in, score, and more", icon: BookOpen },
    { href: "/faq", label: "FAQ", description: "Answers to common questions", icon: HelpCircle },
    ...(member.appRole === "ADMIN"

      ? [
          {
            href: "/admin/championship",
            label: "Admin",
            description: "Manage the championship",
            icon: ShieldCheck,
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-5 pb-28 pt-5">
        {links.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-900/10 text-emerald-900">
              <Icon className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            </div>
          </Link>
        ))}
      </main>

      <BottomNav />
    </div>
  );
}
