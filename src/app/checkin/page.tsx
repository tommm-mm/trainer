import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { btnDanger } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveGoal } from "@/lib/queries";
import { formatDay, isISODate, todayISO } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { deleteCheckinDay } from "./actions";
import { CheckinForm } from "./checkin-form";

const HISTORY_LIMIT = 14;

export default async function CheckinPage({ searchParams }: PageProps<"/checkin">) {
  const params = await searchParams;
  const today = todayISO();
  const date =
    typeof params.date === "string" && isISODate(params.date) && params.date <= today
      ? params.date
      : today;

  const supabase = await createClient();
  const [goal, checkinsRes, bodyRes] = await Promise.all([
    getActiveGoal(supabase),
    supabase
      .from("checkins")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("body_metrics")
      .select("*")
      .order("date", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  const loadError = checkinsRes.error ?? bodyRes.error;
  const checkins = checkinsRes.data ?? [];
  const body = bodyRes.data ?? [];

  // The selected date may be older than the history window: fetch it directly.
  const [current, currentBody] = await Promise.all([
    checkins.find((c) => c.date === date) ??
      supabase.from("checkins").select("*").eq("date", date).limit(1).maybeSingle().then((r) => r.data),
    body.find((b) => b.date === date) ??
      supabase.from("body_metrics").select("*").eq("date", date).limit(1).maybeSingle().then((r) => r.data),
  ]);

  const history = mergeByDate(checkins, body).slice(0, HISTORY_LIMIT);
  const isBodyGoal = goal?.goal_type === "body_composition";

  return (
    <PageShell active="/checkin">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Check-in</h1>
        <p className="text-sm text-neutral-400">
          30 seconds on how you&apos;re doing. The coach reads this next to your training.
        </p>
      </header>

      {loadError && (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          Couldn&apos;t load data: {loadError.message}
        </p>
      )}

      {date !== today && (
        <p className="mb-3 flex items-center justify-between rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-400">
          Editing {formatDay(date)}
          <Link href="/checkin" className="text-emerald-400">
            Back to today →
          </Link>
        </p>
      )}

      <CheckinForm
        key={date}
        date={date}
        today={today}
        isEdit={!!(current || currentBody)}
        showBodyFat={isBodyGoal}
        values={{
          feeling_text: current?.feeling_text ?? null,
          feeling_score: current?.feeling_score ?? null,
          sleep_hours: current?.sleep_hours ?? null,
          soreness: current?.soreness ?? null,
          stress: current?.stress ?? null,
          notes: current?.notes ?? null,
          calf_score: current?.calf_score ?? null,
          niggle: current?.niggle ?? null,
          weight_kg: currentBody?.weight_kg ?? null,
          body_fat_pct: currentBody?.body_fat_pct ?? null,
        }}
      />

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-neutral-300">Recent check-ins</h2>
        {history.length === 0 ? (
          <p className="text-sm text-neutral-600">No check-ins yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
            {history.map((h) => (
              <li
                key={h.date}
                className={`flex items-start justify-between gap-2 px-3 py-2 text-sm ${
                  h.date === date ? "bg-neutral-900" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs text-neutral-500">{formatDay(h.date)}</p>
                  <p className="tabular-nums">{summary(h.checkin, h.body) || "–"}</p>
                  {(h.checkin?.feeling_text || h.checkin?.notes) && (
                    <p className="truncate text-xs text-neutral-400">
                      {[h.checkin.feeling_text, h.checkin.notes].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/checkin?date=${h.date}`}
                    className="rounded-md px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                  >
                    Edit
                  </Link>
                  <form action={deleteCheckinDay.bind(null, h.date)}>
                    <button className={btnDanger}>Delete</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

type Day = {
  date: string;
  checkin: Tables<"checkins"> | null;
  body: Tables<"body_metrics"> | null;
};

function mergeByDate(checkins: Tables<"checkins">[], body: Tables<"body_metrics">[]): Day[] {
  const days = new Map<string, Day>();
  for (const c of checkins) {
    if (!days.has(c.date)) days.set(c.date, { date: c.date, checkin: c, body: null });
  }
  for (const b of body) {
    const d = days.get(b.date);
    if (d) d.body ??= b;
    else days.set(b.date, { date: b.date, checkin: null, body: b });
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function summary(c: Tables<"checkins"> | null, b: Tables<"body_metrics"> | null): string {
  return [
    c?.feeling_score != null ? `feel ${c.feeling_score}` : null,
    c?.sleep_hours != null ? `sleep ${formatNumber(c.sleep_hours)} h` : null,
    c?.soreness != null ? `sore ${c.soreness}` : null,
    c?.stress != null ? `stress ${c.stress}` : null,
    c?.calf_score != null ? `calves ${c.calf_score}/3` : null,
    c?.niggle ? `niggle: ${c.niggle.replace("_", " ")}` : null,
    b?.weight_kg != null ? `${formatNumber(b.weight_kg)} kg` : null,
    b?.body_fat_pct != null ? `${formatNumber(b.body_fat_pct)}% bf` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
