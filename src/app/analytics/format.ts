import { formatNumber, formatPace } from "@/lib/format";

// Named formats so server components can tell client charts how to print
// values (functions can't cross the server → client boundary).
export type ValueFormat = "km" | "pct" | "ratio" | "load" | "pace" | "bpm" | "kg" | "ef";

export function formatValue(v: number, format: ValueFormat, axis = false): string {
  switch (format) {
    case "km":
      return axis ? formatNumber(v, 0) : `${formatNumber(v)} km`;
    case "pct":
      return `${formatNumber(v * 100, 0)}%`;
    case "ratio":
      return v.toFixed(2);
    case "load":
      return axis ? formatNumber(v, 0) : `${formatNumber(v, 0)} AU`;
    case "pace":
      return axis ? formatPace(v) : `${formatPace(v)}/km`;
    case "bpm":
      return axis ? formatNumber(v, 0) : `${formatNumber(v, 0)} bpm`;
    case "kg":
      return axis ? formatNumber(v, 1) : `${formatNumber(v, 1)} kg`;
    case "ef":
      return v.toFixed(2);
  }
}
