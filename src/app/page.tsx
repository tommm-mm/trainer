import { BottomNav } from "@/components/bottom-nav";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function WeekPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">This week</h1>
          <form action={signOut}>
            <button className="text-sm text-neutral-400 hover:text-neutral-200">
              Sign out
            </button>
          </form>
        </header>

        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-sm text-neutral-400">Signed in as</p>
          <p className="font-medium">{user?.email}</p>
          <p className="mt-4 text-sm text-neutral-500">
            Week View arrives in Phase 2.
          </p>
        </section>
      </main>
      <BottomNav active="/" />
    </>
  );
}
