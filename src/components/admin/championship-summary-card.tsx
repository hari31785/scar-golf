import type { AdminChampionshipSummary } from "@/lib/admin/championship-data";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ChampionshipSummaryCard({
  championship,
}: {
  championship: AdminChampionshipSummary;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">
            {championship.name}
          </p>
          <p className="text-xs text-muted-foreground">{championship.year}</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-900/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-900">
          {championship.status}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Start</dt>
          <dd className="font-medium text-foreground">{formatDate(championship.startDate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">End</dt>
          <dd className="font-medium text-foreground">{formatDate(championship.endDate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Participants</dt>
          <dd className="font-medium text-foreground">{championship.participantCount}</dd>
        </div>
      </dl>
    </div>
  );
}
