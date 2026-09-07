import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { getCurrentMember } from "@/lib/current-member";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { getInitials } from "@/lib/members";

const faqs: { q: string; a: React.ReactNode }[] = [
  {
    q: "How is my SCAR handicap calculated?",
    a: (
      <>
        It uses your most recent 20 actual SCAR rounds. A differential is
        calculated for each round as (Gross Score − Course Rating) × 113 ÷
        Slope. The lowest 8 differentials are averaged, rounded UP to a whole
        number, and capped at the configured maximum handicap.
      </>
    ),
  },
  {
    q: "Why do I see padding rounds?",
    a: (
      <>
        If you have fewer than 20 actual SCAR rounds, the calculation adds
        calculation-only padding by duplicating your highest-gross historical
        round (using that round&apos;s original rating and slope) until there
        are 20 rounds to calculate from. Calculation-only padding is not a
        played round.
      </>
    ),
  },
  {
    q: "What is the maximum handicap?",
    a: <>The default maximum handicap is 18, as configured by the club.</>,
  },
  {
    q: "Does my handicap change during the championship?",
    a: (
      <>
        No. Your handicap is frozen before Round 1 and stays the same for all
        four championship rounds.
      </>
    ),
  },
  {
    q: "Does my handicap apply once or to every round?",
    a: <>It applies to every completed round, not just once for the whole event.</>,
  },
  {
    q: "Who can enter my score?",
    a: <>Any player in your group for that round can enter scores for everyone in the group.</>,
  },
  {
    q: "Can someone from another group enter my score?",
    a: <>No. Score entry is restricted to players within your own round group.</>,
  },
  {
    q: "Can I edit a submitted score?",
    a: (
      <>
        No. Once a scorecard is submitted it is locked. Only an admin can
        correct a submitted score, and corrections are permanently recorded in
        the audit history.
      </>
    ),
  },
  {
    q: "How are Round 1 pairings created?",
    a: (
      <>
        Using the SCAR Permanent-member/founder initial pairing rule.
        Permanent members form the first group when possible, and remaining
        players are randomized into balanced groups.
      </>
    ),
  },
  {
    q: "How are Rounds 2–4 pairings created?",
    a: <>They are generated from cumulative NET standings, with leaders placed in the final group.</>,
  },
  {
    q: "What happens if a player withdraws or is disqualified?",
    a: (
      <>
        Withdrawn or disqualified players no longer block completion of the
        group/round. They are excluded from future active tournament
        participation and pairing requirements.
      </>
    ),
  },
  {
    q: "What happens if first place is tied?",
    a: (
      <>
        Tied players enter a sudden-death playoff. They play additional holes,
        recorded by an admin, until one player has a unique low score on a
        hole. The championship is completed once a playoff winner is
        determined.
      </>
    ),
  },
  {
    q: "Why isn't SCAR in the App Store or Play Store?",
    a: (
      <>
        SCAR is installed directly from your phone&apos;s browser rather than
        an app store — see the How To page for install steps.
      </>
    ),
  },
  {
    q: "How do I install SCAR on my phone?",
    a: (
      <>
        On iPhone, open SCAR in Safari, tap Share, then &ldquo;Add to Home
        Screen.&rdquo; On Android, open SCAR in Chrome and use the browser
        menu or install prompt to add it to your home screen.
      </>
    ),
  },
  {
    q: "What if I lose my passkey?",
    a: <>Contact an admin — they can issue you a new one-time enrollment link to register a new passkey.</>,
  },
  {
    q: "What happens if the golf course has poor reception?",
    a: (
      <>
        SCAR currently requires connectivity to save scores. If reception is
        poor, confirm that each score has successfully saved before moving on.
        Full offline synchronization is not currently part of SCAR.
      </>
    ),
  },
];

export default async function FaqPage() {
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
          FAQ
        </h1>

        <div className="flex flex-col gap-2">
          {faqs.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-2xl bg-card p-4 ring-1 ring-foreground/10 open:pb-4"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
                {q}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 text-sm text-foreground/90">{a}</div>
            </details>
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
