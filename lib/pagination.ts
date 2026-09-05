export function getPagination(url: URL, defaultLimit = 200, maxLimit = 500) {
  const rawLimit = Number(url.searchParams.get("limit") ?? defaultLimit);
  const rawOffset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), maxLimit) : defaultLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { take: limit, skip: offset, limit, offset };
}

export function totalHeader(total: number) {
  return { "X-Total-Count": String(total), "Cache-Control": "private, no-store" };
}