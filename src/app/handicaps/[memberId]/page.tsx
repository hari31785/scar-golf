import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/current-member";
import { getMemberHandicapDetail } from "@/lib/handicap/page-data";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";
import { HandicapDetailClient } from "./handicap-detail-client";

export const metadata: Metadata = {
  title: "Handicap Detail · SCAR Championship",
};

export default async function HandicapDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;
  const { memberId } = await params;

  const detail = await getMemberHandicapDetail(memberId);

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
        <HandicapDetailClient data={detail} />
      </main>

      <BottomNav />
    </div>
  );
}
