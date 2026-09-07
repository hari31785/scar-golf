import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import { listCompletedChampionships } from "@/lib/tournament/history";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";
import { HistoryClient } from "./history-client";
import { History as HistoryIcon } from "lucide-react";

export default async function HistoryPage() {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;

  const championships = await listCompletedChampionships();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-0 pb-28 pt-0">
        {championships.length > 0 ? (
          <HistoryClient championships={championships} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-card px-6 py-16 text-center ring-1 ring-foreground/10 mx-5 mt-5">
            <HistoryIcon className="mb-2 size-8 text-emerald-800/60" />
            <h2 className="text-base font-semibold text-foreground">
              No championship history yet
            </h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              Once a championship is completed, it will show up here.
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
