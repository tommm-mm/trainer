import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { formatNumber } from "@/lib/format";
import { sessionLabel } from "@/lib/sessions";
import type { TodayAction } from "@/lib/gym/today";

const cta = "flex h-12 flex-1 items-center justify-center rounded-full bg-emerald-500 text-[15px] font-semibold text-neutral-950";
const ghost = "flex h-12 items-center justify-center rounded-full border border-neutral-700 px-5 text-[15px] text-neutral-100";

/**
 * Today's session in big type with one action. Same rules as before
 * (src/lib/gym/today.ts); runs tick themselves when Garmin syncs.
 */
export function SessionCard({
  action,
  plan,
  done,
  templateName,
  blockLine,
}: {
  action: TodayAction;
  plan: Tables<"weekly_plans"> | null;
  done: Tables<"activities">[];
  templateName: Map<string, string>;
  blockLine: string | null;
}) {
  let title: string;
  let detail: string | null = null;
  let note: string | null = null;
  let buttons: React.ReactNode = null;
  let footer: string | null = null;

  switch (action.kind) {
    case "resume":
      title = "Workout in progress";
      buttons = <Link href="/gym" className={cta}>Resume</Link>;
      break;
    case "plan": {
      const tpl = action.templateId ? templateName.get(action.templateId) : null;
      title = plan?.target_distance_km ? `${action.label} · ${formatNumber(plan.target_distance_km)} km` : action.label;
      detail = tpl ?? null;
      note = plan?.notes ?? null;
      if (action.planKind === "gym") {
        const href = `/gym?plan=${action.planId}${action.templateId ? `&template=${action.templateId}` : ""}`;
        buttons = (
          <>
            <Link href={href} className={cta}>Start workout</Link>
            <Link href="/plan" className={ghost}>Move</Link>
          </>
        );
      } else {
        buttons = <Link href="/plan" className={ghost}>Move</Link>;
        if (action.planKind === "run") footer = "Ticks itself when Garmin syncs the run.";
      }
      break;
    }
    case "gym":
      title = action.templateName;
      detail = action.reason;
      buttons = <Link href={`/gym?template=${action.templateId}`} className={cta}>Start workout</Link>;
      break;
    case "run-or-rest":
    case "done":
      title = done.length ? "Done for today" : "Run or rest";
      detail = action.reason;
      break;
  }

  return (
    <section className="mb-4 flex flex-col gap-3.5 rounded-2xl bg-neutral-900 p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-neutral-400">
          {action.kind === "plan" ? "Today's session" : action.kind === "gym" ? "Today · suggested" : "Today"}
        </p>
        {blockLine && <p className="text-xs text-neutral-400">{blockLine}</p>}
      </div>
      <div>
        <h2 className="text-3xl font-bold leading-tight tracking-tight">{title}</h2>
        {detail && <p className="mt-1.5 text-[15px] text-neutral-300">{detail}</p>}
      </div>
      {done.map((a) => (
        <p key={a.id} className="text-sm text-emerald-300">
          ✓ {a.name ?? sessionLabel(a.type)}
          {a.distance_km ? ` · ${formatNumber(a.distance_km)} km` : ""}
          {a.avg_pace ? ` · ${a.avg_pace}/km` : ""}
          {a.avg_hr ? ` · ${a.avg_hr} bpm` : ""}
        </p>
      ))}
      {note && (
        <details className="text-sm text-neutral-300">
          <summary className="cursor-pointer text-neutral-400">Coach&apos;s note</summary>
          <p className="mt-2 leading-relaxed">{note}</p>
        </details>
      )}
      {buttons && <div className="flex gap-2.5">{buttons}</div>}
      {footer && <p className="text-xs text-neutral-400">{footer}</p>}
    </section>
  );
}
