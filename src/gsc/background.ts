import { GSC_API_ORIGIN } from "./types";
import type {
  GscApiError,
  GscPreferences,
  GscProperty,
  GscReportResponse,
  GscRuntimeRequest,
  GscRuntimeResponse,
  GscRuntimeValue,
  SearchAnalyticsApiResponse,
  SitesListApiResponse,
} from "./types";
import { GscMemoryCache } from "./cache";
import { buildSearchAnalyticsRequest, buildSearchAnalyticsSummaryRequest, normalizeGscProperties, normalizeSearchAnalyticsRows, normalizeSearchAnalyticsSummary, normalizeStoredPreferences } from "./helpers";

const STORAGE_KEY = "gscPreferences";
const cache = new GscMemoryCache();

export function registerGscRuntimeHandlers(): void {
  chrome.identity.onSignInChanged.addListener(() => {
    cache.clear();
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isGscRuntimeRequest(message)) {
      return false;
    }

    void handleGscRuntimeRequest(message)
      .then((value) => sendResponse({ ok: true, value } satisfies GscRuntimeResponse))
      .catch((error: unknown) => sendResponse({ ok: false, error: normalizeGscError(error) } satisfies GscRuntimeResponse));
    return true;
  });
}

async function handleGscRuntimeRequest(message: GscRuntimeRequest): Promise<GscRuntimeValue> {
  if (message.type === "gsc:connect") {
    return listProperties(true);
  }
  if (message.type === "gsc:disconnect") {
    await disconnectGsc();
    return { signedOut: true };
  }
  if (message.type === "gsc:listProperties") {
    return listProperties(false);
  }
  if (message.type === "gsc:getPreferences") {
    return getPreferences();
  }
  if (message.type === "gsc:savePreferences") {
    await savePreferences(message.preferences);
    return { saved: true };
  }
  if (message.type === "gsc:query") {
    return queryPage(message.property, message.targetUrl, message.filters, message.forceRefresh);
  }
  throw new Error("Unsupported GSC request.");
}

async function listProperties(interactive: boolean): Promise<GscProperty[]> {
  const token = await getAuthToken(interactive);
  const response = await fetchJson<SitesListApiResponse>(`${GSC_API_ORIGIN}/webmasters/v3/sites`, token);
  return normalizeGscProperties(response);
}

async function queryPage(property: GscProperty, targetUrl: string, filters: GscReportResponse["filters"], forceRefresh: boolean): Promise<GscReportResponse> {
  if (!forceRefresh) {
    const cached = cache.get(property, targetUrl, filters);
    if (cached !== undefined) {
      return cached;
    }
  }

  const token = await getAuthToken(false);
  const endpoint = `${GSC_API_ORIGIN}/webmasters/v3/sites/${encodeURIComponent(property.siteUrl)}/searchAnalytics/query`;
  const [rowsResponse, summaryResponse] = await Promise.all([
    fetchJson<SearchAnalyticsApiResponse>(endpoint, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSearchAnalyticsRequest(targetUrl, filters)),
    }),
    fetchJson<SearchAnalyticsApiResponse>(endpoint, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSearchAnalyticsSummaryRequest(targetUrl, filters)),
    }),
  ]);
  const report: GscReportResponse = {
    property,
    targetUrl,
    filters,
    summary: normalizeSearchAnalyticsSummary(summaryResponse),
    rows: normalizeSearchAnalyticsRows(rowsResponse),
    fetchedAt: new Date().toISOString(),
    cacheHit: false,
  };
  cache.set(report);
  return report;
}

async function getPreferences(): Promise<GscPreferences> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeStoredPreferences(stored[STORAGE_KEY]);
}

async function savePreferences(preferences: GscPreferences): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: preferences });
}

async function disconnectGsc(): Promise<void> {
  try {
    const token = await getAuthToken(false);
    await chrome.identity.removeCachedAuthToken({ token });
  } catch {
    // Already signed out or token unavailable.
  }
  cache.clear();
}

async function getAuthToken(interactive: boolean): Promise<string> {
  const result = await chrome.identity.getAuthToken({ interactive });
  const token = typeof result === "string" ? result : result?.token;
  if (token === undefined || token === "") {
    throw { code: "signed-out", message: "Connect Google Search Console to view page query data." } satisfies GscApiError;
  }
  return token;
}

async function fetchJson<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401) {
    await chrome.identity.removeCachedAuthToken({ token });
    cache.clear();
  }
  if (!response.ok) {
    throw await gscFetchError(response);
  }
  return (await response.json()) as T;
}

async function gscFetchError(response: Response): Promise<GscApiError> {
  try {
    const body = (await response.json()) as { error?: { status?: string; message?: string } };
    return { code: body.error?.status ?? `http-${response.status}`, message: body.error?.message ?? response.statusText };
  } catch {
    return { code: `http-${response.status}`, message: response.statusText };
  }
}

function normalizeGscError(error: unknown): GscApiError {
  if (isGscApiError(error)) {
    return error;
  }
  if (error instanceof Error) {
    const message = chrome.runtime.lastError?.message ?? error.message;
    if (/turned off browser signin|browser sign.?in/i.test(message)) {
      return { code: "browser-signin-disabled", message: "Chrome browser sign-in is turned off. Enable Chrome sign-in and sign into Chrome before connecting Google Search Console." };
    }
    if (/OAuth2 not granted|not signed in|user did not approve|Authorization page could not be loaded|canceled|cancelled/i.test(message)) {
      return { code: "signed-out", message: "Connect Google Search Console to view page query data." };
    }
    return { code: "error", message };
  }
  return { code: "error", message: String(error) };
}

function isGscApiError(error: unknown): error is GscApiError {
  return typeof error === "object" && error !== null && typeof (error as GscApiError).code === "string" && typeof (error as GscApiError).message === "string";
}

function isGscRuntimeRequest(message: unknown): message is GscRuntimeRequest {
  if (typeof message !== "object" || message === null || typeof (message as { type?: unknown }).type !== "string") {
    return false;
  }
  return (message as { type: string }).type.startsWith("gsc:");
}
