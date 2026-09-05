"use client";

import { useEffect } from "react";
import { flushOfflineQueue } from "@/lib/offline-queue";

const SYNC_TAG = "os-sync";

/**
 * Enregistre le service worker et orchestre la synchronisation différée :
 * à la reconnexion (ou au retour d'onglet), les requêtes mises en file hors
 * ligne sont rejouées puis `os:online` est diffusé pour rafraîchir les écrans.
 * Le service worker relaie l'événement Background Sync quand l'API existe.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    let syncing = false;

    navigator.serviceWorker.register("/sw.js").then((value) => { registration = value; }).catch(() => undefined);

    async function synchronize() {
      if (syncing || !window.navigator.onLine) return;
      syncing = true;
      try {
        await flushOfflineQueue();
        window.dispatchEvent(new CustomEvent("os:online"));
        const syncManager = (registration as (ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }) | null)?.sync;
        await syncManager?.register(SYNC_TAG).catch(() => undefined);
      } catch {
        // Le flush est best-effort : la file est conservée pour la prochaine reconnexion.
      } finally {
        syncing = false;
      }
    }

    const onMessage = (event: MessageEvent) => { if (event.data?.type === "OS_SYNC") synchronize(); };

    navigator.serviceWorker.addEventListener("message", onMessage);
    window.addEventListener("online", synchronize);
    const onVisibility = () => { if (document.visibilityState === "visible") synchronize(); };
    document.addEventListener("visibilitychange", onVisibility);
    synchronize();

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("online", synchronize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
