import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import { getPairingsPageData } from "@/lib/tournament/pairing-summary";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";
import { PairingsClient } from "./pairings-client";
import { Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Pairings · SCAR Championship",
};

export default async function PairingsPage() {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;

  const data = await getPairingsPageData();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-0 pb-28 pt-0 lg:max-w-2xl">
        {data.state === "found" ? (
          <PairingsClient data={data} currentMemberId={member.id} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-card px-6 py-16 text-center ring-1 ring-foreground/10 mx-5 mt-5">
            <Users className="mb-2 size-8 text-emerald-800/60" />
            <h2 className="text-base font-semibold text-foreground">
              No active championship right now
            </h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              Pairings will appear here once a championship is underway.
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
