import type {
  GscDevice,
  GscFilters,
  GscPreferences,
  GscProperty,
  GscReportRow,
  GscReportSummary,
  GscSearchType,
  SearchAnalyticsApiResponse,
  SearchAnalyticsRequestBody,
  SitesListApiResponse,
} from "./types";

export const DEFAULT_GSC_FILTERS: GscFilters = {
  startDate: daysAgoDate(28),
  endDate: daysAgoDate(1),
  searchType: "web",
  country: "",
  device: "",
};

export function defaultGscPreferences(): GscPreferences {
  return { selectedProperties: {}, filters: { ...DEFAULT_GSC_FILTERS } };
}

export function gscTargetUrl(pageUrl: string | undefined, canonicalUrl: string | undefined): string | undefined {
  return normalizeHttpUrl(canonicalUrl) ?? normalizeHttpUrl(pageUrl);
}

export function sitePreferenceKey(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
}

export function normalizeGscProperties(response: SitesListApiResponse): GscProperty[] {
  return (response.siteEntry ?? [])
    .filter((entry): entry is { siteUrl: string; permissionLevel?: string } => typeof entry.siteUrl === "string" && entry.siteUrl.length > 0)
    .map((entry) => {
      const type: GscProperty["type"] = entry.siteUrl.startsWith("sc-domain:") ? "domain" : "url-prefix";
      return {
        siteUrl: entry.siteUrl,
        permissionLevel: entry.permissionLevel ?? "unknown",
        type,
        displayName: type === "domain" ? entry.siteUrl.replace(/^sc-domain:/, "Domain: ") : entry.siteUrl,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function selectBestGscProperty(properties: GscProperty[], targetUrl: string, preferredSiteUrl?: string): GscProperty | undefined {
  if (preferredSiteUrl !== undefined) {
    const preferred = properties.find((property) => property.siteUrl === preferredSiteUrl && propertyMatchesTargetUrl(property, targetUrl));
    if (preferred !== undefined) {
      return preferred;
    }
  }

  const urlPrefixMatches = properties
    .filter((property) => property.type === "url-prefix" && urlMatchesPrefixProperty(targetUrl, property.siteUrl))
    .sort((a, b) => b.siteUrl.length - a.siteUrl.length);
  if (urlPrefixMatches[0] !== undefined) {
    return urlPrefixMatches[0];
  }

  return properties.find((property) => property.type === "domain" && urlMatchesDomainProperty(targetUrl, property.siteUrl));
}

function propertyMatchesTargetUrl(property: GscProperty, targetUrl: string): boolean {
  if (property.type === "url-prefix") {
    return urlMatchesPrefixProperty(targetUrl, property.siteUrl);
  }
  return urlMatchesDomainProperty(targetUrl, property.siteUrl);
}

export function buildSearchAnalyticsRequest(targetUrl: string, filters: GscFilters): SearchAnalyticsRequestBody {
  return {
    ...baseSearchAnalyticsRequest(targetUrl, filters),
    dimensions: ["query"],
    rowLimit: 50,
  };
}

export function buildSearchAnalyticsSummaryRequest(targetUrl: string, filters: GscFilters): SearchAnalyticsRequestBody {
  return {
    ...baseSearchAnalyticsRequest(targetUrl, filters),
    rowLimit: 1,
  };
}

function baseSearchAnalyticsRequest(targetUrl: string, filters: GscFilters): SearchAnalyticsRequestBody {
  const requestFilters: SearchAnalyticsRequestBody["dimensionFilterGroups"][number]["filters"] = [
    { dimension: "page", operator: "equals", expression: targetUrl },
  ];
  if (filters.country.trim() !== "") {
    requestFilters.push({ dimension: "country", operator: "equals", expression: filters.country.trim().toLowerCase() });
  }
  if (filters.device !== "") {
    requestFilters.push({ dimension: "device", operator: "equals", expression: filters.device });
  }

  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    searchType: filters.searchType,
    dimensionFilterGroups: [{ filters: requestFilters }],
  };
}

export function normalizeSearchAnalyticsSummary(response: SearchAnalyticsApiResponse): GscReportSummary {
  const row = response.rows?.[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

export function normalizeSearchAnalyticsRows(response: SearchAnalyticsApiResponse): GscReportRow[] {
  return (response.rows ?? [])
    .map((row) => ({
      query: row.keys?.[0] ?? "",
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    }))
    .filter((row) => row.query !== "")
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.position - b.position);
}

export function gscCacheKey(property: GscProperty, targetUrl: string, filters: GscFilters): string {
  return JSON.stringify({ property: property.siteUrl, targetUrl, filters });
}

export function normalizeStoredPreferences(value: unknown): GscPreferences {
  const defaults = defaultGscPreferences();
  if (!isRecord(value)) {
    return defaults;
  }
  const selectedProperties = isRecord(value["selectedProperties"]) ? stringRecord(value["selectedProperties"]) : defaults.selectedProperties;
  const filters = normalizeFilters(value["filters"], defaults.filters);
  return { selectedProperties, filters };
}

export function normalizeFilters(value: unknown, fallback: GscFilters = DEFAULT_GSC_FILTERS): GscFilters {
  if (!isRecord(value)) {
    return { ...fallback };
  }
  return {
    startDate: stringValue(value["startDate"], fallback.startDate),
    endDate: stringValue(value["endDate"], fallback.endDate),
    searchType: searchTypeValue(value["searchType"], fallback.searchType),
    country: stringValue(value["country"], fallback.country).trim().toLowerCase(),
    device: deviceValue(value["device"], fallback.device),
  };
}

function normalizeHttpUrl(value: string | undefined): string | undefined {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function urlMatchesPrefixProperty(targetUrl: string, propertyUrl: string): boolean {
  const normalizedTarget = normalizeComparableUrl(targetUrl);
  const normalizedProperty = normalizeComparableUrl(propertyUrl);
  return normalizedTarget !== undefined && normalizedProperty !== undefined && normalizedTarget.startsWith(normalizedProperty);
}

function urlMatchesDomainProperty(targetUrl: string, siteUrl: string): boolean {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    const domain = siteUrl.replace(/^sc-domain:/, "").toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function normalizeComparableUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.endsWith("/") ? url.href : `${url.href}/`;
  } catch {
    return undefined;
  }
}

function daysAgoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function searchTypeValue(value: unknown, fallback: GscSearchType): GscSearchType {
  return isGscSearchType(value) ? value : fallback;
}

function deviceValue(value: unknown, fallback: GscDevice): GscDevice {
  return value === "" || value === "DESKTOP" || value === "MOBILE" || value === "TABLET" ? value : fallback;
}

function isGscSearchType(value: unknown): value is GscSearchType {
  return value === "web" || value === "image" || value === "video" || value === "news" || value === "discover" || value === "googleNews";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
