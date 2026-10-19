import type { GscApiError, GscInspectionResponse, GscProperty } from "../gsc/types";

interface GscIndexStatusOptions {
  inspectionUrl: string;
  property?: GscProperty | undefined;
  inspection?: GscInspectionResponse | undefined;
  loading: boolean;
  error?: GscApiError | undefined;
}

export function gscIndexStatusCard(options: GscIndexStatusOptions): HTMLElement {
  const { inspectionUrl, property, inspection, loading, error } = options;
  const currentInspection = inspection?.inspectionUrl === inspectionUrl && inspection?.property.siteUrl === property?.siteUrl ? inspection : undefined;
  const result = currentInspection?.result;
  const verdict = !loading && error === undefined ? result?.verdict : undefined;
  const state = loading ? "loading" : verdict === "PASS" ? "indexed" : verdict === "FAIL" || verdict === "NEUTRAL" ? "not-indexed" : "unknown";
  const card = document.createElement("section");
  card.className = `gsc-index-status ${state}`;
  card.setAttribute("aria-label", "Current page indexing");
  card.setAttribute("role", "status");

  const heading = document.createElement("h3");
  heading.textContent = "Indexing status";
  heading.title = "Based on Google's stored index data, not a live test.";
  const status = document.createElement("strong");
  status.textContent = state === "loading" ? "Checking indexing status..." : state === "indexed" ? "Indexed" : state === "not-indexed" ? "Not indexed" : "Indexing status unavailable";
  const detail = document.createElement("p");
  if (!loading && error !== undefined) {
    detail.textContent = error.message;
  } else if (!loading && property === undefined) {
    detail.textContent = "Select a Search Console property that contains this page URL.";
  } else if (state === "not-indexed") {
    detail.textContent = result?.coverageState ?? "";
  } else if (state === "unknown") {
    detail.textContent = "Click Refresh GSC to try again.";
  }
  card.append(heading, status);
  if (detail.textContent !== "") {
    card.append(detail);
  }

  if (!loading && property !== undefined) {
    const requestIndexing = state === "not-indexed" && (property.permissionLevel === "siteOwner" || property.permissionLevel === "siteFullUser");
    const action = document.createElement("a");
    action.className = "secondary-button";
    action.textContent = requestIndexing ? "Request indexing in Search Console" : "Open URL Inspection";
    action.href = inspectionLink(result?.inspectionResultLink, property);
    action.target = "_blank";
    action.rel = "noopener noreferrer";
    card.append(action);

    if (state === "not-indexed" && !requestIndexing) {
      const note = document.createElement("p");
      note.textContent = "Requesting indexing requires owner or full-user access.";
      card.append(note);
    }
  }

  return card;
}

function inspectionLink(value: string | undefined, property: GscProperty): string {
  try {
    const url = new URL(value ?? "");
    if (url.origin === "https://search.google.com" && url.pathname.startsWith("/search-console/")) {
      return url.href;
    }
  } catch {
    // Fall back to Google's URL Inspection entry point when no report link is available.
  }
  const url = new URL("https://search.google.com/search-console");
  url.searchParams.set("action", "inspect");
  url.searchParams.set("resource_id", property.siteUrl);
  return url.href;
}
