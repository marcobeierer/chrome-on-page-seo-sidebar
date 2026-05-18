import { GSC_CACHE_TTL_MS } from "./types";
import type { GscFilters, GscProperty, GscReportResponse } from "./types";
import { gscCacheKey } from "./helpers";

interface CacheEntry {
  storedAt: number;
  response: GscReportResponse;
}

export class GscMemoryCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(property: GscProperty, targetUrl: string, filters: GscFilters, now = Date.now()): GscReportResponse | undefined {
    const key = gscCacheKey(property, targetUrl, filters);
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (now - entry.storedAt > GSC_CACHE_TTL_MS) {
      this.entries.delete(key);
      return undefined;
    }
    return { ...entry.response, cacheHit: true };
  }

  set(response: GscReportResponse, now = Date.now()): void {
    this.entries.set(gscCacheKey(response.property, response.targetUrl, response.filters), { storedAt: now, response: { ...response, cacheHit: false } });
  }

  clear(): void {
    this.entries.clear();
  }
}
