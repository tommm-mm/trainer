import Link from "next/link";

/** The same title block on every screen: small caps line, big title, one action on the right. */
export function PageHeader({
  eyebrow,
  title,
  back,
  right,
  sub,
}: {
  eyebrow?: string | null;
  title: string;
  back?: { href: string; label: string };
  right?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <header className="mb-4">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-neutral-400">
          ← {back.label}
        </Link>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="truncate text-xs uppercase tracking-wider text-neutral-400">{eyebrow}</p>}
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        </div>
        {right && <div className="shrink-0 pb-1">{right}</div>}
      </div>
      {sub && <p className="mt-1 text-sm text-neutral-400">{sub}</p>}
    </header>
  );
}
