// Quick check-in: calves 0–3 and one niggle area. Pure. A score ≥ 2 or a
// niggle opens a `niggle` flag for that day, so the coach sees it in the
// weekly check (flags), not only when you mention it.

export const CALF_SCORES = [
  { value: 0, label: "nothing" },
  { value: 1, label: "I feel them" },
  { value: 2, label: "tight / sore" },
  { value: 3, label: "it limits me" },
] as const;

export const NIGGLES = [
  { value: "calves", label: "Calves" },
  { value: "achilles", label: "Achilles" },
  { value: "shins", label: "Shins" },
  { value: "knee", label: "Knee" },
  { value: "hip", label: "Hip" },
  { value: "hamstrings", label: "Hamstrings" },
  { value: "quads", label: "Quads" },
  { value: "foot", label: "Foot" },
  { value: "lower_back", label: "Lower back" },
  { value: "other", label: "Other" },
] as const;
export type Niggle = (typeof NIGGLES)[number]["value"];

/** A calf score from 2 up is worth the coach's attention. */
export const CALF_FLAG_FROM = 2;

export const isNiggle = (v: unknown): v is Niggle => NIGGLES.some((n) => n.value === v);

/** The flag text for this check-in, or null when there's nothing to flag. */
export function niggleFlag(calf: number | null, niggle: string | null, notes?: string | null): string | null {
  const parts: string[] = [];
  if (calf != null && calf >= CALF_FLAG_FROM) parts.push(`Calves ${calf}/3 (${CALF_SCORES[calf].label})`);
  if (niggle) parts.push(`niggle: ${NIGGLES.find((n) => n.value === niggle)?.label ?? niggle}`);
  if (parts.length === 0) return null;
  return [parts.join(" · "), notes?.trim()].filter(Boolean).join(". ");
}
