"use client";

import { useEffect } from "react";

// Registers the tiny service worker that makes Cleofas installable (PWA). Production only.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
