import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import { listActiveMemberHandicaps } from "@/lib/handicap/page-data";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";
import { PageHero } from "@/components/dashboard/page-hero";
import { HandicapsClient } from "./handicaps-client";

export const metadata: Metadata = {
  title: "Handicaps · SCAR Championship",
};

export default async function HandicapsPage() {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;

  const rows = await listActiveMemberHandicaps();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-0 pb-28 pt-0 lg:max-w-[1200px]">
        <div className="px-5 pt-4">
          <PageHero title="Handicaps" />
        </div>
        {rows.length > 0 ? (
          <HandicapsClient rows={rows} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-card px-6 py-16 text-center ring-1 ring-foreground/10 mx-5 mt-5">
            <p className="text-sm text-muted-foreground">
              No active members found.
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
