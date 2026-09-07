import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-xl font-semibold text-foreground">
          {value}
        </p>
        {subtext ? (
          <p className="text-xs text-muted-foreground">{subtext}</p>
        ) : null}
      </div>
    </div>
  );
}
