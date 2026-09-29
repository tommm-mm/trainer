import Link from "next/link";
import { LiveRefresh } from "./live-refresh";

// Tabs for the v1 screens. Disabled tabs are rendered greyed out until
// their phase ships.
const TABS = [
  { href: "/", label: "Week", enabled: true },
  { href: "/gym", label: "Gym", enabled: true },
  { href: "/checkin", label: "Check-in", enabled: true },
  { href: "/goal", label: "Goal", enabled: true },
  { href: "/analytics", label: "Stats", enabled: true },
];

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => (
          <li key={tab.href} className="flex-1">
            {tab.enabled ? (
              <Link
                href={tab.href}
                className={`block py-3 text-center text-xs ${
                  active === tab.href
                    ? "font-semibold text-emerald-400"
                    : "text-neutral-400"
                }`}
              >
                {tab.label}
              </Link>
            ) : (
              <span className="block cursor-not-allowed py-3 text-center text-xs text-neutral-700">
                {tab.label}
              </span>
            )}
          </li>
        ))}
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
    </>
  );
}
