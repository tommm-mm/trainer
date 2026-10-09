// Push notification texts. Pure: the tick route gets the facts from
// push_due() (SQL) and turns them into what the phone shows.

export type ProposalFacts = { plans: number; changes: number; seasons: number; first_week: string | null };
export type DueFacts = { proposals: ProposalFacts | null; checkin: boolean };

export type PushMessage = {
  title: string;
  body: string;
  /** Opened on tap (same origin). */
  url: string;
  /** Same tag = replaces the previous notification of that kind instead of stacking. */
  tag: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function proposalMessage(p: ProposalFacts): PushMessage | null {
  const parts = [
    p.plans > 0 ? plural(p.plans, "session", "sessions") : null,
    p.changes > 0 ? plural(p.changes, "change", "changes") : null,
    p.seasons > 0 ? "a new season version" : null,
  ].filter((x): x is string => x !== null);
  if (parts.length === 0) return null;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  const onlySeason = p.plans === 0 && p.changes === 0;
  return {
    title: "Cowork has a proposal",
    body: `${list[0].toUpperCase()}${list.slice(1)} to approve. Tap to review.`,
    url: onlySeason ? "/season?view=proposed" : p.first_week && p.changes === 0 ? `/?week=${p.first_week}` : "/",
    tag: "proposals",
  };
}

export const CHECKIN_MESSAGE: PushMessage = {
  title: "How are your legs today?",
  body: "10-second check-in: calves and any niggle.",
  url: "/",
  tag: "checkin",
};

export function buildMessages(f: DueFacts): PushMessage[] {
  const out: PushMessage[] = [];
  const p = f.proposals ? proposalMessage(f.proposals) : null;
  if (p) out.push(p);
  if (f.checkin) out.push(CHECKIN_MESSAGE);
  return out;
}

export const TEST_MESSAGE: PushMessage = {
  title: "Trainer notifications are on",
  body: "This is a test. Proposals and the check-in reminder will arrive like this.",
  url: "/settings",
  tag: "test",
};
