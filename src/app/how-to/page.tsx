import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentMember } from "@/lib/current-member";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";
import { PageHero } from "@/components/dashboard/page-hero";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="mb-2 text-sm font-semibold text-emerald-950">{title}</h2>
      <div className="flex flex-col gap-2 text-sm text-foreground/90">
        {children}
      </div>
    </section>
  );
}

export default async function HowToPage() {
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

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-5 pb-28 pt-5 lg:max-w-2xl lg:px-8">
        <PageHero title="How To" />
        <Link
          href="/more"
          className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-emerald-800/80"
        >
          <ArrowLeft className="size-3.5" />
          More
        </Link>

        <Section title="1. Add SCAR to your Home Screen">
          <p className="font-medium text-foreground">iPhone / iOS</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open SCAR in Safari</li>
            <li>Tap Share</li>
            <li>Tap &ldquo;Add to Home Screen&rdquo;</li>
            <li>Confirm Add</li>
          </ol>
          <p className="mt-2 font-medium text-foreground">Android</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open SCAR in Chrome</li>
            <li>Use the browser menu or install prompt</li>
            <li>Tap &ldquo;Add to Home screen&rdquo; or &ldquo;Install app&rdquo;</li>
            <li>Confirm</li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            SCAR is not available in the App Store or Google Play — install it
            directly from your browser using the steps above.
          </p>
        </Section>

        <Section title="2. Signing in">
          <p>SCAR uses passkeys instead of passwords.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>An admin provides a one-time enrollment link.</li>
            <li>Opening the link lets you register a passkey on your device.</li>
            <li>After that, use &ldquo;Sign in with Passkey&rdquo; to log in.</li>
            <li>No password is required.</li>
            <li>
              If you lose your device or passkey, contact an admin for a new
              enrollment link.
            </li>
          </ul>
        </Section>

        <Section title="3. Entering scores">
          <ul className="list-disc space-y-1 pl-5">
            <li>Open Score.</li>
            <li>Score entry is restricted to that round&apos;s group.</li>
            <li>Any player in the group may enter scores for everyone in that group.</li>
            <li>Scores are entered hole-by-hole.</li>
            <li>Unentered scores remain blank — no hole score is automatically defaulted.</li>
          </ul>
        </Section>

        <Section title="4. Confirming and submitting a round">
          <ul className="list-disc space-y-1 pl-5">
            <li>Every ACTIVE player in the group must have all 18 hole scores entered.</li>
            <li>Review the totals.</li>
            <li>One group member taps &ldquo;Confirm &amp; Submit Round.&rdquo;</li>
            <li>The submitted scorecard becomes locked.</li>
            <li>An admin can correct a submitted score if necessary.</li>
          </ul>
        </Section>

        <Section title="5. Pairings">
          <p className="font-medium text-foreground">Round 1</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Uses the SCAR Permanent-member/founder initial pairing rule.</li>
            <li>Permanent members form the first group when possible.</li>
            <li>Remaining players are randomized into balanced groups.</li>
          </ul>
          <p className="mt-2 font-medium text-foreground">Rounds 2–4</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Pairings are generated from cumulative NET standings.</li>
            <li>Leaders are placed in the final group.</li>
          </ul>
        </Section>

        <Section title="6. Leaderboard">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-950">
            Cumulative Net = Cumulative Gross − (Frozen Handicap × Completed Rounds)
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Handicap is applied to EACH completed round.</li>
            <li>Each player&apos;s tournament handicap is frozen before Round 1.</li>
            <li>It remains unchanged for all four championship rounds.</li>
            <li>Tournament rounds can affect future handicaps after the championship.</li>
          </ul>
        </Section>

        <Section title="7. Handicaps">
          <ul className="list-disc space-y-1 pl-5">
            <li>Uses the most recent 20 actual SCAR rounds.</li>
            <li>
              If fewer than 20 actual rounds exist, calculation-only padding
              duplicates the player&apos;s highest-gross historical SCAR round,
              including that round&apos;s original course rating and slope.
            </li>
            <li>Calculates a differential for each round.</li>
            <li>Selects the lowest 8 differentials.</li>
            <li>Averages those 8.</li>
            <li>Rounds UP to a whole number.</li>
            <li>Applies the configured maximum handicap (default 18).</li>
          </ul>
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-950">
            Differential = (Gross Score − Course Rating) × 113 ÷ Slope
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Calculation-only padding is not a played round.
          </p>
        </Section>

        <Section title="8. Admin score corrections">
          <ul className="list-disc space-y-1 pl-5">
            <li>Submitted scorecards are locked.</li>
            <li>Only an admin can correct a submitted score.</li>
            <li>Corrections are permanently recorded in the audit history.</li>
          </ul>
        </Section>

        <Section title="9. Playoffs">
          <ul className="list-disc space-y-1 pl-5">
            <li>A tie for first after four rounds goes to sudden death.</li>
            <li>Tied players play additional holes.</li>
            <li>The first unique low score on a playoff hole wins.</li>
            <li>An admin records the playoff results.</li>
            <li>The championship is completed once the playoff winner is determined.</li>
          </ul>
        </Section>
      </main>

      <BottomNav />
    </div>
  );
}
