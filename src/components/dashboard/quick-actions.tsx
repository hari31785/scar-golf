import Link from "next/link";
import { FileText, ScrollText, Users, Trophy, Settings } from "lucide-react";

const actions = [
  {
    label: "Leaderboard",
    description: "View standings",
    href: "/leaderboard",
    icon: FileText,
  },
  {
    label: "Scorecards",
    description: "Hole-by-hole scores",
    href: "/scorecards",
    icon: ScrollText,
  },
  {
    label: "Members",
    description: "See the field",
    href: "/members",
    icon: Users,
  },
  {
    label: "Past Rounds",
    description: "History & results",
    href: "/history",
    icon: Trophy,
  },
  {
    label: "Settings",
    description: "Your account",
    href: "/more",
    icon: Settings,
  },
] as const;

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {actions.map(({ label, description, href, icon: Icon }) => (
        <Link
          key={label}
          href={href}
          className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 transition-transform active:scale-95"
        >
          <Icon className="size-5 text-emerald-900" strokeWidth={1.75} />
          <span className="text-sm font-semibold text-foreground">
            {label}
          </span>
          <span className="-mt-1.5 text-xs text-muted-foreground">
            {description}
          </span>
        </Link>
      ))}
    </div>
  );
}
