import Link from "next/link";
import { LiveRefresh } from "./live-refresh";
import { ServiceWorkerRegister } from "./sw-register";

// The four tabs. A tab also lights up on the screens it leads to
// (Progress: Season, Stats, Goal; Gym: templates and the run log).
const TABS = [
  { href: "/", label: "Today", also: [] as string[], icon: <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2" /> },
  { href: "/plan", label: "Plan", also: [], icon: <path d="M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M9 3v4M15 3v4" /> },
  { href: "/season", label: "Progress", also: ["/analytics", "/goal"], icon: <path d="M4 19l5-6 4 3 7-9" /> },
  { href: "/gym", label: "Gym", also: ["/log"], icon: <path d="M3 12h2M19 12h2M7 8v8M17 8v8M7 12h10" /> },
];

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const on = active === tab.href || tab.also.includes(active);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${on ? "font-semibold text-emerald-400" : "text-neutral-400"}`}
              >
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                  {tab.icon}
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function PageShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-6">
        {children}
      </main>
      <BottomNav active={active} />
      <LiveRefresh />
      <ServiceWorkerRegister />
    </>
  );
}
