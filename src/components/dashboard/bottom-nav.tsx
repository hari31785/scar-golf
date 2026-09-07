"use client";

import { cn } from "cn";
import {
  Home,
  NotebookPen,
  Trophy,
  History,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { key: "home", label: "Home", icon: Home, href: "/" },
  { key: "score", label: "Score", icon: NotebookPen, href: "/score" },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy, href: "/leaderboard" },
  { key: "history", label: "History", icon: History, href: "/history" },
  { key: "more", label: "More", icon: MoreHorizontal, href: "/more" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-foreground/10 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {navItems.map(({ key, label, icon: Icon, href }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex w-full flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium transition-colors",
                  isActive
                    ? "text-emerald-800"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  className={cn("size-5", isActive && "stroke-[2.25]")}
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

