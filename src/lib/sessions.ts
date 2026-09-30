// weekly_plans.session_type is free text so the AI coach can name sessions
// freely. These are the suggested values; sessionKind() classifies anything.

export type SessionKind = "run" | "gym" | "cross" | "other";

export const SESSION_TYPES: { value: string; label: string; kind: SessionKind }[] = [
  { value: "easy_run", label: "Easy run", kind: "run" },
  { value: "long_run", label: "Long run", kind: "run" },
  { value: "tempo", label: "Tempo", kind: "run" },
  { value: "intervals", label: "Intervals", kind: "run" },
  { value: "recovery_run", label: "Recovery run", kind: "run" },
  { value: "race", label: "Race", kind: "run" },
  { value: "gym_lower", label: "Gym – lower", kind: "gym" },
  { value: "gym_upper", label: "Gym – upper", kind: "gym" },
  { value: "gym_full", label: "Gym – full body", kind: "gym" },
  { value: "bike_easy", label: "Easy bike", kind: "cross" },
  { value: "swim", label: "Swim", kind: "cross" },
  { value: "mobility", label: "Mobility", kind: "other" },
  { value: "rest", label: "Rest", kind: "other" },
];

export function sessionKind(type: string): SessionKind {
  const known = SESSION_TYPES.find((s) => s.value === type);
  if (known) return known.kind;
  const t = type.toLowerCase();
  if (/(gym|strength|lift|weights|squat|deadlift|bench)/.test(t)) return "gym";
  if (/(bike|ride|cycl|spin|swim|row)/.test(t)) return "cross";
  if (/(run|tempo|interval|fartlek|threshold|stride|race|hill)/.test(t)) return "run";
  return "other";
}

export function sessionLabel(type: string): string {
  const known = SESSION_TYPES.find((s) => s.value === type);
  if (known) return known.label;
  const words = type.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
