import Link from "next/link";
import type { TodayAction } from "@/lib/gym/today";

// Top of the Week View: the one thing to do today. Rule-based for now
// (src/lib/gym/today.ts); the AI coach will fill it in Phase D.
export function TodayCard({ action, templateName }: { action: TodayAction; templateName: Map<string, string> }) {
  const shell = "mb-4 flex items-center justify-between gap-3 rounded-xl border p-3";
  const cta = "shrink-0 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-neutral-950";
  switch (action.kind) {
    case "resume":
      return (
        <Link href="/gym" className={`${shell} border-emerald-500/50 bg-emerald-500/10`}>
          <div>
            <p className="text-xs uppercase tracking-wide text-emerald-300">Today</p>
            <p className="font-medium">Workout in progress</p>
          </div>
          <span className={cta}>Resume</span>
        </Link>
      );
    case "plan": {
      const href =
        action.planKind === "gym"
          ? `/gym?plan=${action.planId}${action.templateId ? `&template=${action.templateId}` : ""}`
          : action.planKind === "run"
            ? `/log?plan=${action.planId}`
            : null;
      const name = action.templateId ? templateName.get(action.templateId) : null;
      return (
        <div className={`${shell} border-emerald-500/40 bg-emerald-500/5`}>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-emerald-300">Today · planned</p>
            <p className="truncate font-medium">
              {action.label}
              {name && <span className="font-normal text-neutral-400"> · {name}</span>}
            </p>
          </div>
          {href && (
            <Link href={href} className={cta}>
              {action.planKind === "gym" ? "Start" : "Log"}
            </Link>
          )}
        </div>
      );
    }
    case "gym":
      return (
        <div className={`${shell} border-emerald-500/40 bg-emerald-500/5`}>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-emerald-300">Today · suggested</p>
            <p className="font-medium">{action.templateName}</p>
            <p className="text-xs text-neutral-400">{action.reason}</p>
          </div>
          <Link href={`/gym?template=${action.templateId}`} className={cta}>
            Start
          </Link>
        </div>
      );
    case "run-or-rest":
    case "done":
      return (
        <div className={`${shell} border-neutral-800 bg-neutral-900`}>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Today</p>
            <p className="text-sm text-neutral-200">{action.reason}</p>
          </div>
          <Link href="/gym" className="shrink-0 text-xs text-neutral-400 underline underline-offset-2">
            Gym anyway
          </Link>
        </div>
      );
  }
}
