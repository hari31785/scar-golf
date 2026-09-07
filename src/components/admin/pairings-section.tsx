"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ChampionshipRoundPairings } from "@/lib/tournament/pairing-summary";
import { TeeTimeEditor } from "@/components/admin/tee-time-editor";

/** ADMIN-only pairings + tee-time management — does not generate/regenerate groups. */
export function PairingsSection({ rounds }: { rounds: ChampionshipRoundPairings[] }) {
  const firstGenerated = rounds.find((r) => r.groups.length > 0)?.roundNumber ?? rounds[0]?.roundNumber ?? 1;
  const [activeRound, setActiveRound] = useState(String(firstGenerated));

  if (rounds.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Pairings &amp; Tee Times
      </h2>

      <Tabs value={activeRound} onValueChange={(v) => setActiveRound(String(v))}>
        <TabsList className="grid w-full grid-cols-4">
          {rounds.map((round) => (
            <TabsTrigger key={round.roundNumber} value={String(round.roundNumber)}>
              R{round.roundNumber}
            </TabsTrigger>
          ))}
        </TabsList>

        {rounds.map((round) => (
          <TabsContent key={round.roundNumber} value={String(round.roundNumber)}>
            <TeeTimeEditor round={round} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
