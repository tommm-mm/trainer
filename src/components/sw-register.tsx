"use client";

import { useEffect } from "react";

/** Registers the service worker (offline pages + push) on every screen. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err) => {
        console.error("[sw] registration failed:", err);
      });
    }
  }, []);
  return null;
}
