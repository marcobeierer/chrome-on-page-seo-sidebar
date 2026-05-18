export const GSC_API_ORIGIN = "https://www.googleapis.com";
export const GSC_CACHE_TTL_MS = 15 * 60 * 1000;

export type GscSearchType = "web" | "image" | "video" | "news" | "discover" | "googleNews";
export type GscDevice = "" | "DESKTOP" | "MOBILE" | "TABLET";

export interface GscFilters {
  startDate: string;
  endDate: string;
  searchType: GscSearchType;
  country: string;
  device: GscDevice;
}

export interface GscProperty {
  siteUrl: string;
  permissionLevel: string;
  type: "domain" | "url-prefix";
  displayName: string;
}

export interface GscPreferences {
  selectedProperties: Record<string, string>;
  filters: GscFilters;
}

export interface GscReportRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscReportSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscReportResponse {
  property: GscProperty;
  targetUrl: string;
  filters: GscFilters;
  summary: GscReportSummary;
  rows: GscReportRow[];
  fetchedAt: string;
  cacheHit: boolean;
}

export interface GscApiError {
  code: string;
  message: string;
}

export type GscRuntimeRequest =
  | { type: "gsc:connect" }
  | { type: "gsc:disconnect" }
  | { type: "gsc:listProperties" }
  | { type: "gsc:getPreferences" }
  | { type: "gsc:savePreferences"; preferences: GscPreferences }
  | { type: "gsc:query"; property: GscProperty; targetUrl: string; filters: GscFilters; forceRefresh: boolean };

export type GscRuntimeValue = GscProperty[] | GscPreferences | GscReportResponse | { signedOut: true } | { saved: true };

export type GscRuntimeResponse<T = GscRuntimeValue> = { ok: true; value: T } | { ok: false; error: GscApiError };

export interface SearchAnalyticsRequestBody {
  startDate: string;
  endDate: string;
  dimensions?: ["query"];
  rowLimit?: 1 | 50;
  searchType: GscSearchType;
  dimensionFilterGroups: Array<{
    filters: Array<{
      dimension: "page" | "country" | "device";
      operator: "equals";
      expression: string;
    }>;
  }>;
}

export interface SearchAnalyticsApiRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

export interface SearchAnalyticsApiResponse {
  rows?: SearchAnalyticsApiRow[];
}

export interface SitesListApiResponse {
  siteEntry?: Array<{
    siteUrl?: string;
    permissionLevel?: string;
  }>;
}
