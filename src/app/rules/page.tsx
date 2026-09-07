import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentMember } from "@/lib/current-member";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="mb-2 text-sm font-semibold text-emerald-950">{title}</h2>
      <div className="flex flex-col gap-2 text-sm text-foreground/90">{children}</div>
    </section>
  );
}

export default async function RulesPage() {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-5 pb-28 pt-5">
        <Link
          href="/more"
          className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-emerald-800/80"
        >
          <ArrowLeft className="size-3.5" />
          More
        </Link>
        <h1 className="mb-1 text-xl font-semibold tracking-tight text-foreground">
          Rules
        </h1>

        <Section title="Membership">
          <ul className="list-disc space-y-1 pl-5">
            <li>Permanent and Associate membership types.</li>
            <li>Rule changes and Associate approvals are voted on by Permanent members.</li>
            <li>
              If a vote is tied, the current champion receives the additional
              deciding vote, even if the champion is an Associate.
            </li>
          </ul>
        </Section>

        <Section title="Championship">
          <ul className="list-disc space-y-1 pl-5">
            <li>Stroke play. Each player plays their own ball.</li>
            <li>Four rounds of 18 holes.</li>
            <li>
              Lowest cumulative NET score determines first place, subject to a
              playoff for a tie.
            </li>
          </ul>
        </Section>

        <Section title="Handicap">
          <ul className="list-disc space-y-1 pl-5">
            <li>Based on the most recent 20 actual SCAR rounds.</li>
            <li>
              Fewer than 20 rounds use calculation-only padding based on the
              player&apos;s highest-gross historical SCAR round, using that
              round&apos;s original rating and slope.
            </li>
            <li>The lowest 8 differentials are averaged.</li>
            <li>Rounded UP to a whole number.</li>
            <li>Configurable maximum handicap, currently default 18.</li>
            <li>A new Associate with no qualifying history starts at 0.</li>
            <li>
              Championship handicap is frozen before Round 1 and applied to
              EACH championship round.
            </li>
          </ul>
        </Section>

        <Section title="Pairings">
          <ul className="list-disc space-y-1 pl-5">
            <li>Round 1 uses the Permanent-member/founder initial pairing rule.</li>
            <li>If four Permanent members participate, they form the first group.</li>
            <li>
              If fewer than four participate, participating Permanent members
              are grouped first and Associates fill the group when possible.
            </li>
            <li>Remaining participants are randomized into balanced groups.</li>
            <li>Rounds 2–4 use cumulative NET standings.</li>
            <li>Leaders are in the final group.</li>
          </ul>
        </Section>

        <Section title="Scoring">
          <ul className="list-disc space-y-1 pl-5">
            <li>Players within a group may enter scores for everyone in that group.</li>
            <li>Another group cannot enter their scores.</li>
            <li>Every ACTIVE player must have all 18 hole scores before submission.</li>
            <li>Submitted scorecards are locked.</li>
            <li>Admins may correct submitted scores, and corrections are audited.</li>
          </ul>
        </Section>

        <Section title="Putting">
          <p>
            Putts should be holed unless the other three players accept the
            putt and it is within one putter-head length.
          </p>
        </Section>

        <Section title="Courses">
          <ul className="list-disc space-y-1 pl-5">
            <li>The champion chooses the following championship&apos;s courses.</li>
            <li>Local course rules and etiquette apply.</li>
          </ul>
        </Section>

        <Section title="Tie">
          <ul className="list-disc space-y-1 pl-5">
            <li>A tie for first after four rounds is resolved by sudden-death playoff.</li>
            <li>
              Tied players continue until one player records the unique low
              score on a playoff hole.
            </li>
          </ul>
        </Section>

        <Section title="Trophy">
          <p>The winner receives the rolling SCAR trophy.</p>
        </Section>

        <Section title="Conduct">
          <ul className="list-disc space-y-1 pl-5">
            <li>Sportsmanship is expected.</li>
            <li>Violations may result in disqualification.</li>
          </ul>
        </Section>
      </main>

      <BottomNav />
    </div>
  );
}
