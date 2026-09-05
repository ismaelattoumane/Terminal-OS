/**
 * B27 : utilitaire front pour les listes paginées.
 * Les routes GET renvoient `X-Total-Count` ; au-delà de la limite (200 par défaut)
 * les données disparaissent silencieusement de l'UI. Cet utilitaire expose un
 * drapeau `truncated` pour afficher un avertissement à l'utilisateur.
 */
export async function fetchJsonWithLimit<T = unknown>(url: string, init?: RequestInit): Promise<{ items: T[]; total: number; truncated: boolean }> {
  const response = await fetch(url, init);
  if (!response.ok) return { items: [], total: 0, truncated: false };
  const total = Number(response.headers.get("X-Total-Count") ?? "") || 0;
  const items = (await response.json()) as T[];
  return { items, total, truncated: total > items.length };
}
