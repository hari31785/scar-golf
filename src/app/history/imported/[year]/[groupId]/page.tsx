import { redirect, notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import {
  listImportedHistoricalRounds,
  buildImportedRoundGroupDetail,
} from "@/lib/handicap/page-data";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";
import { ImportedRoundGroupClient } from "./imported-round-group-client";

export default async function ImportedRoundGroupPage({
  params,
}: {
  params: Promise<{ year: string; groupId: string }>;
}) {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;
  const { year: yearParam, groupId } = await params;

  const importedRounds = await listImportedHistoricalRounds();
  const detail = buildImportedRoundGroupDetail(importedRounds, groupId);

  if (!detail || detail.year !== Number(yearParam)) {
    notFound();
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-0 pb-28 pt-0 lg:max-w-2xl">
        <ImportedRoundGroupClient
          year={Number(yearParam)}
          groupId={groupId}
          detail={detail}
        />
      </main>

      <BottomNav />
    </div>
  );
}
