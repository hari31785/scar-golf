import { redirect, notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import {
  listImportedHistoricalRounds,
  buildImportedYearSummaries,
  buildImportedRoundGroupsForYear,
} from "@/lib/handicap/page-data";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";
import { ImportedYearClient } from "./imported-year-client";

export default async function ImportedYearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;
  const { year: yearParam } = await params;
  const year = Number(yearParam);

  const importedRounds = await listImportedHistoricalRounds();
  const yearSummary = buildImportedYearSummaries(importedRounds).find(
    (y) => y.year === year
  );
  const groups = buildImportedRoundGroupsForYear(importedRounds, year);

  if (!yearSummary || groups.length === 0) {
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
        <ImportedYearClient year={yearSummary} groups={groups} />
      </main>

      <BottomNav />
    </div>
  );
}
