"use client";

import { useEffect, useState, useTransition } from "react";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { removeSubscription, saveSubscription, sendTest } from "./actions";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type BeforeInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Install button (Chrome / Android) and notifications on this phone. */
export function PushManager({ vapidKey }: { vapidKey: string | null }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    // Browser-only state, read after mount (the server render can't know it).
    void (async () => {
      await Promise.resolve();
      setSupported(ok);
      setInstalled(window.matchMedia("(display-mode: standalone)").matches);
      if (!ok) return;
      setPermission(Notification.permission);
      const reg = await navigator.serviceWorker.ready;
      setSub(await reg.pushManager.getSubscription());
    })();
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const enable = () =>
    start(async () => {
      setMsg(null);
      try {
        if (!vapidKey) throw new Error("Notifications aren't configured on the server yet.");
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") throw new Error("Permission denied: allow notifications for this site in Chrome's settings.");
        const reg = await navigator.serviceWorker.ready;
        const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
        const r = await saveSubscription(JSON.parse(JSON.stringify(s)), navigator.userAgent);
        if (r.error) throw new Error(r.error);
        setSub(s);
        setMsg("Notifications are on for this phone.");
      } catch (err) {
        setMsg(err instanceof Error ? err.message : String(err));
      }
    });

  const disable = () =>
    start(async () => {
      if (!sub) return;
      await removeSubscription(sub.endpoint);
      await sub.unsubscribe();
      setSub(null);
      setMsg("Notifications are off for this phone.");
    });

  const test = () =>
    start(async () => {
      const r = await sendTest();
      setMsg(r.error ?? "Test sent: it should arrive in a few seconds.");
    });

  return (
    <div className="flex flex-col gap-3 text-sm">
      {!installed && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-neutral-300">
            {installEvent ? "Install Trainer on your home screen." : "To install: Chrome menu ⋮ → Add to Home screen / Install app."}
          </p>
          {installEvent && (
            <button
              className={`${btnPrimary} shrink-0`}
              onClick={async () => {
                await installEvent.prompt();
                await installEvent.userChoice;
                setInstallEvent(null);
              }}
            >
              Install
            </button>
          )}
        </div>
      )}
      {installed && <p className="text-emerald-300">✓ Installed as an app</p>}

      {supported === false && <p className="text-amber-300">This browser doesn&apos;t support notifications.</p>}
      {supported && (
        <div className="flex flex-wrap items-center gap-2">
          {sub ? (
            <>
              <span className="text-emerald-300">✓ Notifications on for this phone</span>
              <button disabled={pending} className={btnSecondary} onClick={test}>
                Send test
              </button>
              <button disabled={pending} className={btnSecondary} onClick={disable}>
                Turn off
              </button>
            </>
          ) : (
            <button disabled={pending || permission === "denied"} className={btnPrimary} onClick={enable}>
              {pending ? "…" : "Turn on notifications"}
            </button>
          )}
        </div>
      )}
      {permission === "denied" && (
        <p className="text-xs text-amber-300">Blocked in Chrome: site settings → Notifications → Allow, then reload.</p>
      )}
      {msg && <p className="text-xs text-neutral-300">{msg}</p>}
    </div>
  );
}
