/**
 * File d'attente de synchronisation différée pour la PWA.
 *
 * Les mutations (POST/PATCH/DELETE) qui échouent faute de connexion sont
 * conservées dans le navigateur (localStorage, 50 requêtes max, 24 h) puis
 * rejouées automatiquement à la reconnexion :
 * - événement `online` du navigateur ;
 * - retour de l'onglet au premier plan (visibilitychange) ;
 * - événement Background Sync du service worker (`os-sync`) quand l'API est
 *   disponible, pour déclencher le flush même si l'onglet était inactif.
 *
 * Après chaque flush, un événement DOM `os:online` est diffusé pour que les
 * écrans rechargent des données fraîches. Les requêtes en échec réseau alors
 * que l'appareil est en ligne (serveur injoignable) ne sont PAS mises en file :
 * seul le mode hors ligne est concerné.
 */

export type QueuedRequest = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  createdAt: number;
};

const STORAGE_KEY = "terminal-os:offline-queue";
const MAX_ENTRIES = 50;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readQueue(): QueuedRequest[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedRequest[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((entry) => entry && typeof entry.url === "string" && typeof entry.method === "string" && now - entry.createdAt < MAX_AGE_MS)
      .slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

function writeQueue(entries: QueuedRequest[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Quota dépassé : la file est perdue plutôt que de bloquer l'interface.
  }
}

export function queuedRequestsCount(): number {
  return readQueue().length;
}

/**
 * Identique à `fetch`, mais met la requête en file d'attente si l'appareil est
 * hors ligne. Renvoie alors une réponse factice `202 Accepted` : l'interface
 * peut se mettre à jour, la synchronisation réelle se fera à la reconnexion.
 */
export async function queuedFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const method = (init?.method ?? "GET").toUpperCase();
    if (!isBrowser() || window.navigator.onLine || method === "GET" || method === "HEAD") throw error;
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? undefined).forEach((value, key) => { headers[key] = value; });
    const queue = readQueue();
    queue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      method,
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
      createdAt: Date.now(),
    });
    writeQueue(queue);
    window.dispatchEvent(new CustomEvent("os:queued", { detail: { count: queue.length } }));
    return new Response(null, { status: 202, statusText: "Différé — synchronisé à la reconnexion" });
  }
}

/**
 * Rejoue les requêtes en attente, dans l'ordre d'insertion. Renvoie le nombre
 * de requêtes synchronisées. S'arrête au premier échec réseau (toujours hors
 * ligne) ou sur une erreur 408/429/5xx (à retenter plus tard) ; les 4xx
 * définitifs sont retirés de la file.
 */
export async function flushOfflineQueue(): Promise<number> {
  const remaining = readQueue();
  if (!remaining.length) return 0;
  let flushed = 0;
  while (remaining.length) {
    const entry = remaining[0];
    try {
      const response = await fetch(entry.url, { method: entry.method, headers: entry.headers, body: entry.body });
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (retryable) break;
      remaining.shift();
      flushed += 1;
    } catch {
      break;
    }
  }
  writeQueue(remaining);
  return flushed;
}

/**
 * S'abonne aux reconnexions (`online`, retour d'onglet visible, événement
 * `os:online` diffusé après un flush). Renvoie la fonction de désabonnement.
 */
export function onReconnect(callback: () => void): () => void {
  if (!isBrowser()) return () => undefined;
  const onOnline = () => { if (window.navigator.onLine) callback(); };
  const onVisibility = () => { if (document.visibilityState === "visible" && window.navigator.onLine) callback(); };
  window.addEventListener("online", onOnline);
  window.addEventListener("os:online", onOnline as EventListener);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("os:online", onOnline as EventListener);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}