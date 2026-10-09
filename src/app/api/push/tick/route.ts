import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient as createAnon } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { buildMessages, type DueFacts } from "@/lib/push/messages";
import { sendAll, type Sub } from "@/lib/push/send";

// GET /api/push/tick — called every 5 minutes by Supabase pg_cron
// (push_tick()) with the shared secret. Asks push_due() what to notify,
// sends it, and reports dead subscriptions. No user session: the secret is
// the only key, checked here and again inside the SQL functions.

export const dynamic = "force-dynamic";

type Due = DueFacts & { user_id: string; subscriptions: Sub[] };

function authorized(req: Request): boolean {
  const secret = process.env.PUSH_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const secret = process.env.PUSH_SECRET!;
  const db = createAnon<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  const { data, error } = await db.rpc("push_due", { p_secret: secret });
  if (error) {
    console.error("[push] push_due failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  const due = (data ?? []) as unknown as Due[];
  let sent = 0;
  const ok: string[] = [];
  const gone: string[] = [];
  for (const u of due) {
    const messages = buildMessages(u);
    if (messages.length === 0) continue;
    const r = await sendAll(u.subscriptions ?? [], messages);
    sent += messages.length;
    ok.push(...r.ok);
    gone.push(...r.gone);
  }
  if (ok.length || gone.length) {
    const { error: repErr } = await db.rpc("push_report", { p_secret: secret, p_gone: gone, p_ok: ok });
    if (repErr) console.error("[push] push_report failed:", repErr.message);
  }
  return NextResponse.json({ users: due.length, sent, gone: gone.length });
}
