"use client";

import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { RoundSetupSummary } from "@/lib/admin/round-setup-data";
import type { CourseSetupInput, HoleSetupInput } from "@/lib/tournament/course-setup";
import { saveRoundSetupAction } from "@/lib/admin/championship-actions";

function statusLabel(status: RoundSetupSummary["status"]) {
  if (status === "ready") return "Ready";
  if (status === "incomplete") return "Incomplete";
  return "Not configured";
}

function statusVariant(status: RoundSetupSummary["status"]): "default" | "outline" | "destructive" {
  if (status === "ready") return "default";
  if (status === "incomplete") return "destructive";
  return "outline";
}

const EMPTY_COURSE_SETUP: CourseSetupInput = {
  courseName: "",
  city: "",
  teeName: "",
  teeColor: "",
  courseRating: 0,
  slope: 0,
  totalPar: 0,
  yardage: 0,
};

function emptyHoles(): HoleSetupInput[] {
  return Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: 0,
    strokeIndex: i + 1,
  }));
}

export function RoundSetupSection({
  rounds,
  isDraft,
}: {
  rounds: RoundSetupSummary[];
  isDraft: boolean;
}) {
  const [activeRound, setActiveRound] = useState(String(rounds[0]?.roundNumber ?? 1));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Round Setup
        </h2>
        {!isDraft && (
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Lock className="size-3" />
            Frozen
          </span>
        )}
      </div>

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
            <RoundSetupCard round={round} isDraft={isDraft} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function RoundSetupCard({
  round,
  isDraft,
}: {
  round: RoundSetupSummary;
  isDraft: boolean;
}) {
  const [courseSetup, setCourseSetup] = useState<CourseSetupInput>(
    round.courseSetup ?? EMPTY_COURSE_SETUP
  );
  const [holes, setHoles] = useState<HoleSetupInput[]>(
    round.holes.length > 0 ? round.holes : emptyHoles()
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const readOnly = !isDraft;

  function updateHole(index: number, field: "par" | "strokeIndex", value: number) {
    setHoles((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: value } : h))
    );
  }

  function handleSave() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await saveRoundSetupAction({
        championshipRoundId: round.championshipRoundId,
        courseSetup,
        holes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Round {round.roundNumber}</h3>
        <Badge variant={statusVariant(round.status)}>{statusLabel(round.status)}</Badge>
      </div>

      {/* Course + tee fields */}
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Course Name
          <Input
            value={courseSetup.courseName}
            disabled={readOnly}
            onChange={(e) => setCourseSetup((s) => ({ ...s, courseName: e.target.value }))}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          City
          <Input
            value={courseSetup.city ?? ""}
            disabled={readOnly}
            onChange={(e) => setCourseSetup((s) => ({ ...s, city: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Tee Name
          <Input
            value={courseSetup.teeName}
            disabled={readOnly}
            onChange={(e) => setCourseSetup((s) => ({ ...s, teeName: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Tee Color
          <Input
            value={courseSetup.teeColor}
            disabled={readOnly}
            onChange={(e) => setCourseSetup((s) => ({ ...s, teeColor: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Rating
          <Input
            type="number"
            step="0.1"
            value={courseSetup.courseRating}
            disabled={readOnly}
            onChange={(e) =>
              setCourseSetup((s) => ({ ...s, courseRating: Number(e.target.value) }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Slope
          <Input
            type="number"
            value={courseSetup.slope}
            disabled={readOnly}
            onChange={(e) => setCourseSetup((s) => ({ ...s, slope: Number(e.target.value) }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Total Par
          <Input
            type="number"
            value={courseSetup.totalPar}
            disabled={readOnly}
            onChange={(e) =>
              setCourseSetup((s) => ({ ...s, totalPar: Number(e.target.value) }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Yardage
          <Input
            type="number"
            value={courseSetup.yardage}
            disabled={readOnly}
            onChange={(e) =>
              setCourseSetup((s) => ({ ...s, yardage: Number(e.target.value) }))
            }
          />
        </label>
      </div>

      {/* 18-hole grid */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">Holes</p>
        <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs font-medium text-muted-foreground">
          <span className="px-1">Hole</span>
          <span className="px-1">Par</span>
          <span className="px-1">HCP</span>
        </div>
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {holes.map((hole, i) => (
            <div key={hole.holeNumber} className="grid grid-cols-3 items-center gap-x-2">
              <span className="px-1 text-sm font-semibold text-foreground">{hole.holeNumber}</span>
              <Input
                type="number"
                value={hole.par}
                disabled={readOnly}
                onChange={(e) => updateHole(i, "par", Number(e.target.value))}
              />
              <Input
                type="number"
                value={hole.strokeIndex}
                disabled={readOnly}
                onChange={(e) => updateHole(i, "strokeIndex", Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      {success && <p className="text-xs font-medium text-emerald-700">Round setup saved.</p>}

      {!readOnly && (
        <Button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="h-11 rounded-xl text-sm font-semibold"
        >
          {isPending ? "Saving…" : "Save Round Setup"}
        </Button>
      )}
    </div>
  );
}
