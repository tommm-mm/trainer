// Chart colours. Deliberately NOT in charts.tsx: a "use client" module only
// exports client references to server components, so constants imported
// from it are undefined on the server (that made every bar render black).

export const COLORS = {
  run: "#3987e5", // series 1 – blue (dark-mode step, ≥ 3:1 on the card)
  gym: "#d95926", // series 2 – orange
  hiit: "#9b6fd6", // series 3 – violet
  cross: "#1f9e89", // series 4 – teal (validated as a 4-slot set on #171717: CVD ΔE ≥ 12.5)
  muted: "#6b6b68", // de-emphasised bars (not enough data / partial week)
  trend: "#e5e5e5", // trend overlays: neutral, reads above any series
  grid: "#2e2e2c",
  axis: "#a3a3a3",
  good: "#0ca30c", // status colours: only for zones and verdicts
  watch: "#fab219",
  off: "#d03b3b",
} as const;

export const STATUS_COLOR = {
  good: COLORS.good,
  watch: COLORS.watch,
  off: COLORS.off,
  na: COLORS.axis,
} as const;
