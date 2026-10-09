import webpush from "web-push";
import type { PushMessage } from "./messages";

// Sends with the VAPID keys (Vercel env). Never throws per subscription: it
// reports which endpoints worked and which are gone (404 / 410 = the phone
// unsubscribed or reinstalled), so the caller can prune them.

export type Sub = { endpoint: string; p256dh: string; auth: string };

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys are not set.");
  webpush.setVapidDetails("mailto:mocenigotommaso@gmail.com", pub, priv);
  configured = true;
}

export async function sendAll(subs: Sub[], messages: PushMessage[]): Promise<{ ok: string[]; gone: string[] }> {
  configure();
  const ok = new Set<string>();
  const gone = new Set<string>();
  for (const s of subs) {
    for (const m of messages) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(m),
          { TTL: 6 * 3600, urgency: "normal" },
        );
        ok.add(s.endpoint);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.add(s.endpoint);
        else console.error("[push] send failed:", status, err instanceof Error ? err.message : err);
      }
    }
  }
  return { ok: [...ok].filter((e) => !gone.has(e)), gone: [...gone] };
}
