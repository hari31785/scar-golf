"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import type { ChampionshipRoundPairings } from "@/lib/tournament/pairing-summary";
import {
  updateRoundPairingsAction,
} from "@/lib/admin/championship-actions";
import type { PairingAssignment } from "@/lib/tournament/pairing-edit";

type EditableAssignment = {
  championshipPlayerId: string;
  displayName: string;
  roundGroupId: string;
  cartNumber: number | null;
  position: number;
};

/**
 * Admin-only manual pairing editor for one round: lets an admin
 * reassign which group/cart/position each player is in, for logistics
 * reasons (late withdrawal, requested cart change, balancing groups).
 * Does not create/remove groups or change the pairing-generation
 * algorithm — see updateRoundPairingsAction for the full rules.
 *
 * Locked (read-only) once any group in the round has SUBMITTED, since
 * reassigning a player after their group's scores are locked in would
 * disconnect them from the group they actually played with.
 */
export function PairingsEditor({ round }: { round: ChampionshipRoundPairings }) {
  const isLocked = round.groups.some((g) => g.status === "SUBMITTED");

  const initialAssignments = useMemo(() => {
    const list: EditableAssignment[] = [];
    for (const group of round.groups) {
      for (const player of group.players) {
        list.push({
          championshipPlayerId: player.championshipPlayerId,
          displayName: player.displayName,
          roundGroupId: group.roundGroupId,
          cartNumber: player.cartNumber,
          position: player.position,
        });
      }
    }
    return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [round.groups]);

  const [assignments, setAssignments] = useState<EditableAssignment[]>(initialAssignments);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (round.groups.length === 0) return null;

  function updateAssignment(
    championshipPlayerId: string,
    patch: Partial<Pick<EditableAssignment, "roundGroupId" | "cartNumber" | "position">>
  ) {
    setSuccess(false);
    setAssignments((prev) =>
      prev.map((a) =>
        a.championshipPlayerId === championshipPlayerId ? { ...a, ...patch } : a
      )
    );
  }

  function handleSave() {
    setError(null);
    setSuccess(false);
    const payload: PairingAssignment[] = assignments.map((a) => ({
      championshipPlayerId: a.championshipPlayerId,
      roundGroupId: a.roundGroupId,
      cartNumber: a.cartNumber,
      position: a.position,
    }));
    startTransition(async () => {
      const result = await updateRoundPairingsAction({
        championshipRoundId: round.championshipRoundId,
        assignments: payload,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  if (isLocked) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-card p-4 text-muted-foreground ring-1 ring-foreground/10">
        <Lock className="size-4 shrink-0" />
        <p className="text-xs font-medium">
          Pairings are locked for this round — a group has already submitted.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <h3 className="text-sm font-semibold text-foreground">Edit Pairings</h3>
      <p className="text-xs text-muted-foreground">
        Reassign a player&apos;s group, cart, or tee-off order for Round{" "}
        {round.roundNumber}.
      </p>

      <div className="flex flex-col gap-2">
        {assignments.map((a) => (
          <div
            key={a.championshipPlayerId}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-xl bg-muted/40 px-3 py-2"
          >
            <p className="truncate text-sm font-medium text-foreground">{a.displayName}</p>

            <select
              value={a.roundGroupId}
              onChange={(e) =>
                updateAssignment(a.championshipPlayerId, { roundGroupId: e.target.value })
              }
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {round.groups.map((group) => (
                <option key={group.roundGroupId} value={group.roundGroupId}>
                  Group {group.groupNumber}
                </option>
              ))}
            </select>

            <select
              value={a.cartNumber === null ? "" : String(a.cartNumber)}
              onChange={(e) =>
                updateAssignment(a.championshipPlayerId, {
                  cartNumber: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="h-8 w-20 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">No cart</option>
              <option value="1">Cart 1</option>
              <option value="2">Cart 2</option>
              <option value="3">Cart 3</option>
              <option value="4">Cart 4</option>
            </select>
          </div>
        ))}
      </div>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      {success && (
        <p className="text-xs font-medium text-emerald-700">Pairings saved.</p>
      )}

      <Button
        type="button"
        disabled={isPending}
        onClick={handleSave}
        className="h-11 rounded-xl text-sm font-semibold"
      >
        {isPending ? "Saving…" : "Save Pairings"}
      </Button>
    </div>
  );
}
