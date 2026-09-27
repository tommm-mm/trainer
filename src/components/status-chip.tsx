const STYLES: Record<string, string> = {
  proposed: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  approved: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  edited: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  completed: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        STYLES[status] ?? "bg-neutral-800 text-neutral-300 ring-neutral-700"
      }`}
    >
      {status}
    </span>
  );
}
