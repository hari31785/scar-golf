import { redirect, notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import { getChampionshipHistoryDetail } from "@/lib/tournament/history";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";
import { HistoryDetailClient } from "./history-detail-client";

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ championshipId: string }>;
}) {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;
  const { championshipId } = await params;

  const detail = await getChampionshipHistoryDetail(championshipId);

  if (detail.state === "not-found") {
    notFound();
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-0 pb-28 pt-0">
        <HistoryDetailClient data={detail} />
      </main>

      <BottomNav />
    </div>
  );
}
