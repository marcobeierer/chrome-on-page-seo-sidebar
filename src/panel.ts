import { analyzeExtractedData } from "./analyzer/analysis";
import type { AnalysisResult, ExtractedPageData, Finding, HreflangLink, PageSeoData, SchemaNode, SourceBlock, StructuredDataFormat } from "./analyzer/types";
import { DEFAULT_GSC_FILTERS, gscTargetUrl, normalizeFilters, selectBestGscProperty, sitePreferenceKey } from "./gsc/helpers";
import type { GscApiError, GscPreferences, GscProperty, GscReportResponse, GscRuntimeRequest, GscRuntimeResponse } from "./gsc/types";
import { inspectedPageAnalysis } from "./inspectedPage";
import { copyControl, tooltipControl } from "./panel/copyControls";
import { childGroups, type ChildGroup, treeMatchesQuery, treeRoots } from "./panel/treeModel";
import { sourceCodeBlock, sourceDisplayText } from "./panel/sourceFormat";

let currentResult: AnalysisResult | null = null;
type TopTab = "gsc" | "help" | "page" | "schema";
type HelpTopic = "help-chrome-signin" | "help-connect-gsc" | "help-matching-property" | "help-property-access" | "help-rate-limit";

const TOP_TABS: TopTab[] = ["page", "schema", "gsc", "help"];

let activeTopTab: TopTab = "page";
let activeView: "findings" | "tree" | "source" = "tree";
let isAnalyzing = false;
let pageDataOpen = true;
let lastObservedUrl: string | null = null;
let lastActiveTabId: number | null = null;
let pendingRefresh: number | undefined;
let gscState: GscPanelState = initialGscState();
let gscFiltersOpen = false;
let gscQueryFilter = "";
let gscSort: GscSortState = { key: "clicks", direction: "desc" };
let gscRequestVersion = 0;
let gscAutoLoadPending = false;

type GscSortKey = "clicks" | "ctr" | "impressions" | "position" | "query";

interface GscSortState {
  key: GscSortKey;
  direction: "asc" | "desc";
}

interface GscPanelState {
  loading: boolean;
  connected: boolean;
  properties: GscProperty[];
  preferences: GscPreferences;
  selectedProperty?: GscProperty | undefined;
  targetUrl?: string | undefined;
  report?: GscReportResponse | undefined;
  error?: GscApiError | undefined;
}

const refreshButton = requireElement<HTMLButtonElement>("refresh");
const shortcutSettingsButton = requireElement<HTMLButtonElement>("shortcut-settings");
const searchInput = requireElement<HTMLInputElement>("search");
const severitySelect = requireElement<HTMLSelectElement>("severity");
const formatSelect = requireElement<HTMLSelectElement>("format");
const gscConnectButton = requireElement<HTMLButtonElement>("gsc-connect");
const gscDisconnectButton = requireElement<HTMLButtonElement>("gsc-disconnect");
const gscRefreshButton = requireElement<HTMLButtonElement>("gsc-refresh");
const gscPropertySelect = requireElement<HTMLSelectElement>("gsc-property");
const gscFilterDetails = requireElement<HTMLDetailsElement>("gsc-filter-details");
const gscQueryFilterInput = requireElement<HTMLInputElement>("gsc-query-filter");
const gscStartDateInput = requireElement<HTMLInputElement>("gsc-start-date");
const gscEndDateInput = requireElement<HTMLInputElement>("gsc-end-date");
const gscSearchTypeSelect = requireElement<HTMLSelectElement>("gsc-search-type");
const gscCountryInput = requireElement<HTMLInputElement>("gsc-country");
const gscDeviceSelect = requireElement<HTMLSelectElement>("gsc-device");

refreshButton.addEventListener("click", () => {
  if (pendingRefresh !== undefined) {
    window.clearTimeout(pendingRefresh);
    pendingRefresh = undefined;
  }
  setStatus("Manual refresh requested.");
  void refreshAnalysis(true);
});
shortcutSettingsButton.addEventListener("click", () => {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});
tooltipControl(shortcutSettingsButton, "Shortcut", "Configure activation shortcut");
searchInput.addEventListener("input", render);
severitySelect.addEventListener("change", render);
formatSelect.addEventListener("change", render);
gscConnectButton.addEventListener("click", () => {
  void connectGsc();
});
gscDisconnectButton.addEventListener("click", () => {
  void disconnectGsc();
});
gscRefreshButton.addEventListener("click", () => {
  void loadGscReport(true);
});
gscPropertySelect.addEventListener("change", () => {
  void selectGscProperty(gscPropertySelect.value);
});
gscFilterDetails.addEventListener("toggle", () => {
  gscFiltersOpen = gscFilterDetails.open;
});
gscQueryFilterInput.addEventListener("input", () => {
  gscQueryFilter = gscQueryFilterInput.value;
  renderGsc();
});
for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-gsc-range]"))) {
  button.addEventListener("click", () => {
    const days = Number(button.dataset["gscRange"]);
    if (Number.isFinite(days)) {
      void applyGscQuickRange(days);
    }
  });
}
for (const control of [gscStartDateInput, gscEndDateInput, gscSearchTypeSelect, gscCountryInput, gscDeviceSelect]) {
  control.addEventListener("change", () => {
    void updateGscFiltersFromControls();
  });
}

for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>(".top-tab"))) {
  tab.addEventListener("click", () => {
    activateTopTab(topTabFromDataset(tab.dataset["topTab"]));
  });
  tab.addEventListener("keydown", (event) => {
    handleTopTabKeydown(event);
  });
}

for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"))) {
  tab.addEventListener("click", () => {
    activateView(tab.dataset["view"] as typeof activeView);
  });
}

for (const card of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-summary-target]"))) {
  card.addEventListener("click", () => {
    const target = card.dataset["summaryTarget"] as typeof activeView;
    const severity = card.dataset["summarySeverity"];
    if (severity !== undefined) {
      severitySelect.value = severity;
    }
    activateView(target);
    scrollTabsIntoView();
  });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  lastActiveTabId = activeInfo.tabId;
  lastObservedUrl = null;
  scheduleAnalysis("Active tab changed. Analyzing current page...", 250);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId !== lastActiveTabId) {
    return;
  }
  if (changeInfo.url !== undefined) {
    lastObservedUrl = changeInfo.url;
    scheduleAnalysis("Page navigation detected. Reanalyzing current DOM...", 500);
    return;
  }
  if (changeInfo.status === "complete") {
    scheduleAnalysis("Page loaded. Reanalyzing current DOM...", 250);
  }
});

window.setInterval(() => {
  void refreshIfUrlChanged();
}, 1000);

setStatus("Opening panel. Analyzing current DOM...");
scheduleAnalysis("Analyzing current DOM...", 0);
renderGsc();

async function refreshAnalysis(canRequestAccess = false): Promise<void> {
  if (isAnalyzing) {
    scheduleAnalysis("Analysis already running. Rechecking shortly...", 300);
    return;
  }

  isAnalyzing = true;
  refreshButton.disabled = true;
  setStatus("Analyzing current DOM...");

  try {
    const extracted = await evaluateActiveTabPage(canRequestAccess);
    currentResult = analyzeExtractedData(extracted);
    lastObservedUrl = currentResult.url;
    setStatus(`Analyzed ${currentResult.title || currentResult.url} at ${formatTime(currentResult.analyzedAt)}.`);
    syncGscTargetWithCurrentPage();
    render();
    if (activeTopTab === "gsc" && gscState.connected) {
      void loadGscReport(false);
    }
  } catch (error) {
    currentResult = null;
    syncGscTargetWithCurrentPage();
    setStatus(error instanceof Error ? error.message : String(error), true);
    render();
  } finally {
    isAnalyzing = false;
    refreshButton.disabled = false;
  }
}

function scheduleAnalysis(message: string, delayMs: number): void {
  if (pendingRefresh !== undefined) {
    window.clearTimeout(pendingRefresh);
  }
  setStatus(message);
  pendingRefresh = window.setTimeout(() => {
    pendingRefresh = undefined;
    void refreshAnalysis();
  }, delayMs);
}

async function refreshIfUrlChanged(): Promise<void> {
  if (isAnalyzing || pendingRefresh !== undefined) {
    return;
  }
  try {
    const url = await evaluateActiveTabFunction(() => window.location.href);
    if (lastObservedUrl !== null && url !== lastObservedUrl) {
      lastObservedUrl = url;
      scheduleAnalysis("URL change detected. Reanalyzing current DOM...", 300);
      return;
    }
    lastObservedUrl = url;
  } catch {
    // The active tab may be between navigations. The next poll or navigation event will retry.
  }
}

function evaluateActiveTabPage(canRequestAccess: boolean): Promise<ExtractedPageData> {
  return evaluateActiveTabFunction(inspectedPageAnalysis, canRequestAccess);
}

async function evaluateActiveTabFunction<T>(func: () => T, canRequestAccess = false): Promise<T> {
  const tab = await getActiveTab();
  if (tab.id === undefined) {
    throw new Error("No active tab is available for analysis.");
  }
  if (isRestrictedUrl(tab.url)) {
    throw new Error("Chrome does not allow extensions to analyze this page. Open a normal website, staging page, or localhost URL.");
  }

  lastActiveTabId = tab.id;
  if (canRequestAccess) {
    const granted = await requestTabAccess(tab.url);
    if (!granted) {
      throw new Error(missingTabAccessMessage(tab.url));
    }
  }

  try {
    return await executeActiveTabFunction(tab.id, func);
  } catch (error) {
    if (!isMissingHostPermissionError(error)) {
      throw error;
    }
    throw new Error(missingTabAccessMessage(tab.url));
  }
}

async function executeActiveTabFunction<T>(tabId: number, func: () => T): Promise<T> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
  });

  if (result === undefined) {
    throw new Error("The page did not return analysis data.");
  }
  return result.result as T;
}

async function requestTabAccess(url: string | undefined): Promise<boolean> {
  const origin = permissionOrigin(url);
  if (origin === undefined) {
    return false;
  }
  return chrome.permissions.request({ origins: [origin] });
}

function permissionOrigin(url: string | undefined): string | undefined {
  try {
    const parsed = new URL(url ?? "");
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return undefined;
  }
}

function isMissingHostPermissionError(error: unknown): boolean {
  return error instanceof Error && /must request permission to access this host/i.test(error.message);
}

function missingTabAccessMessage(url: string | undefined): string {
  const origin = pageOrigin(url);
  return `Chrome has not granted access to ${origin}. Click Refresh and allow site access to analyze this page.`;
}

function pageOrigin(url: string | undefined): string {
  try {
    return new URL(url ?? "").origin;
  } catch {
    return "this page";
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab === undefined) {
    throw new Error("No active tab found. Select a page and reopen the sidebar.");
  }
  return tab;
}

function isRestrictedUrl(url: string | undefined): boolean {
  return url !== undefined && /^(chrome|chrome-extension|edge|about):/i.test(url);
}

function render(): void {
  renderPageData();
  renderSummary();
  if (activeView === "findings") renderFindings();
  if (activeView === "tree") renderTree();
  if (activeView === "source") renderSources();
  renderGsc();
}

function topTabFromDataset(value: string | undefined): TopTab {
  return value === "schema" || value === "gsc" || value === "help" ? value : "page";
}

function activateTopTab(tab: TopTab): void {
  activeTopTab = tab;
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".top-tab"))) {
    const active = button.dataset["topTab"] === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const panel of Array.from(document.querySelectorAll<HTMLElement>(".top-panel"))) {
    const active = panel.id === `${tab}-panel`;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  }
  if (tab === "gsc" && !gscState.connected && !gscState.loading) {
    void initializeGsc(false);
  }
  if (tab === "gsc" && gscState.connected && gscState.report === undefined && !gscState.loading) {
    void loadGscReport(false);
  }
}

function handleTopTabKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }
  event.preventDefault();
  const currentIndex = Math.max(TOP_TABS.indexOf(activeTopTab), 0);
  const direction = event.key === "ArrowRight" ? 1 : -1;
  const nextTab = TOP_TABS[(currentIndex + direction + TOP_TABS.length) % TOP_TABS.length] ?? "page";
  activateTopTab(nextTab);
  document.querySelector<HTMLButtonElement>(`.top-tab[data-top-tab="${nextTab}"]`)?.focus();
}

function activateView(view: typeof activeView): void {
  activeView = view;
  for (const entry of Array.from(document.querySelectorAll(".tab, .view"))) {
    entry.classList.remove("active");
  }
  document.querySelector<HTMLButtonElement>(`.tab[data-view="${view}"]`)?.classList.add("active");
  requireElement<HTMLElement>(`${view}-view`).classList.add("active");
  render();
}

function scrollTabsIntoView(): void {
  document.querySelector<HTMLElement>(".tabs")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function renderPageData(): void {
  const view = requireElement<HTMLElement>("page-data");
  const page = currentResult?.page;
  if (page === undefined) {
    view.replaceChildren(emptyState("Page data", "Title, meta description, canonical, and hreflang data will appear after analysis."));
    return;
  }

  const details = document.createElement("details");
  details.className = "page-data-details";
  details.open = pageDataOpen;
  details.addEventListener("toggle", () => {
    pageDataOpen = details.open;
  });

  const summary = document.createElement("summary");
  summary.textContent = "Page data";

  const table = document.createElement("table");
  table.className = "metadata-table";
  const tbody = document.createElement("tbody");
  tbody.append(
    metadataRow("Title", page.title.value),
    metadataRow("Meta description", page.metaDescription?.value ?? "Not found", page.metaDescription === undefined),
    metadataRow("Canonical", page.canonical?.href ?? "Not found", page.canonical === undefined),
    hreflangRow(page),
  );
  table.append(tbody);

  details.replaceChildren(summary, table);
  view.replaceChildren(details);
}

function metadataRow(label: string, value: string, missing = false): HTMLTableRowElement {
  const row = document.createElement("tr");
  const heading = document.createElement("th");
  heading.scope = "row";
  heading.textContent = label;
  const cell = document.createElement("td");
  const content = document.createElement("span");
  content.className = missing ? "missing-value" : "metadata-value";
  content.textContent = value;
  cell.append(content);
  row.replaceChildren(heading, cell);
  return row;
}

function hreflangRow(page: PageSeoData): HTMLTableRowElement {
  const row = document.createElement("tr");
  const heading = document.createElement("th");
  heading.scope = "row";
  heading.textContent = "Hreflang";
  const cell = document.createElement("td");
  if (page.hreflang.length === 0) {
    const missing = document.createElement("span");
    missing.className = "missing-value";
    missing.textContent = "Not found";
    cell.append(missing);
  } else {
    cell.append(hreflangList(page.hreflang));
  }
  row.replaceChildren(heading, cell);
  return row;
}

function hreflangList(links: HreflangLink[]): HTMLElement {
  const list = document.createElement("ul");
  list.className = "hreflang-list";
  for (const link of links) {
    const item = document.createElement("li");
    const lang = document.createElement("strong");
    lang.textContent = link.hreflang;
    const href = document.createElement("span");
    href.textContent = link.href;
    item.replaceChildren(lang, href);
    list.append(item);
  }
  return list;
}

function renderSummary(): void {
  const summary = currentResult?.summary;
  setText("count-sources", String(summary?.sourceCount ?? 0));
  setText("count-nodes", String(summary?.nodeCount ?? 0));
  setText("count-errors", String(summary?.findingCounts.error ?? 0));
  setText("count-warnings", String(summary?.findingCounts.warning ?? 0));
  setText("count-info", String(summary?.findingCounts.info ?? 0));
  renderFindingsBadge(summary?.findingCounts.error ?? 0, summary?.findingCounts.warning ?? 0);
}

function renderFindingsBadge(errorCount: number, warningCount: number): void {
  const badge = requireElement<HTMLElement>("findings-badge");
  badge.classList.remove("error", "warning");

  if (errorCount > 0) {
    badge.hidden = false;
    badge.classList.add("error");
    badge.textContent = String(errorCount);
    badge.setAttribute("aria-label", `${errorCount} errors`);
    return;
  }

  if (warningCount > 0) {
    badge.hidden = false;
    badge.classList.add("warning");
    badge.textContent = String(warningCount);
    badge.setAttribute("aria-label", `${warningCount} warnings`);
    return;
  }

  badge.hidden = true;
  badge.textContent = "";
  badge.removeAttribute("aria-label");
}

function renderFindings(): void {
  const view = requireElement<HTMLElement>("findings-list");
  const result = currentResult;
  if (result === null) {
    view.replaceChildren(emptyState("No analysis yet", "Refresh to inspect JSON-LD, Microdata, and RDFa in the current DOM."));
    return;
  }
  const findings = filterFindings(result.findings);
  if (findings.length === 0) {
    view.replaceChildren(emptyState("No matching findings", "Adjust filters or inspect the schema tree for detected entities."));
    return;
  }
  view.replaceChildren(...findings.map((finding) => findingCard(finding, result)));
}

function renderTree(): void {
  const view = requireElement<HTMLElement>("tree-view");
  const result = currentResult;
  if (result === null || result.nodes.length === 0) {
    view.replaceChildren(emptyState("No entities detected", "Structured data entities will appear here after analysis."));
    return;
  }
  const nodes = result.nodes.filter((node) => matchesFormat(node.format));
  const roots = treeRoots(nodes).filter((node) => treeMatchesQuery(node, nodes, (entry) => matchesQuery(nodeSearchText(entry))));
  if (roots.length === 0) {
    view.replaceChildren(emptyState("No matching entities", "Adjust filters to show matching structured data entities."));
    return;
  }
  view.replaceChildren(...roots.map((node) => nodeDetails(node, nodes, new Set())));
}

function renderSources(): void {
  const view = requireElement<HTMLElement>("source-view");
  const result = currentResult;
  if (result === null || result.sources.length === 0) {
    view.replaceChildren(emptyState("No sources detected", "JSON-LD scripts, Microdata items, and RDFa entities will appear here."));
    return;
  }
  const sources = result.sources.filter((source) => matchesFormat(source.format) && matchesQuery(sourceSearchText(source)));
  view.replaceChildren(...sources.map(sourceDetails));
}

function initialGscState(): GscPanelState {
  return {
    loading: false,
    connected: false,
    properties: [],
    preferences: { selectedProperties: {}, filters: { ...DEFAULT_GSC_FILTERS } },
  };
}

function syncGscTargetWithCurrentPage(): void {
  const targetUrl = gscTargetUrl(currentResult?.url, currentResult?.page.canonical?.href);
  if (gscState.targetUrl === targetUrl) {
    return;
  }
  gscRequestVersion += 1;
  gscQueryFilter = "";
  gscState = { ...gscState, loading: false, targetUrl, report: undefined, error: undefined };
  selectBestKnownGscProperty();
  if (activeTopTab === "gsc" && gscState.connected && gscState.selectedProperty !== undefined && targetUrl !== undefined) {
    gscAutoLoadPending = true;
  }
}

async function initializeGsc(interactive: boolean): Promise<void> {
  syncGscTargetWithCurrentPage();
  gscState = { ...gscState, loading: true, error: undefined };
  renderGsc();
  try {
    const [preferences, properties] = await Promise.all([sendGscMessage<GscPreferences>({ type: "gsc:getPreferences" }), sendGscMessage<GscProperty[]>({ type: interactive ? "gsc:connect" : "gsc:listProperties" })]);
    gscState = { ...gscState, loading: false, connected: true, preferences, properties, error: undefined };
    selectBestKnownGscProperty();
    await persistCurrentGscSelection();
    renderGsc();
    if (gscState.selectedProperty !== undefined && gscState.targetUrl !== undefined) {
      void loadGscReport(false);
    }
  } catch (error) {
    gscState = { ...gscState, loading: false, connected: false, properties: [], report: undefined, error: normalizePanelGscError(error) };
    renderGsc();
  }
}

async function connectGsc(): Promise<void> {
  await initializeGsc(true);
  if (gscState.connected) {
    await loadGscReport(false);
  }
}

async function disconnectGsc(): Promise<void> {
  gscState = { ...gscState, loading: true, error: undefined };
  renderGsc();
  try {
    await sendGscMessage({ type: "gsc:disconnect" });
  } finally {
    gscState = { ...initialGscState(), targetUrl: gscState.targetUrl };
    renderGsc();
  }
}

async function loadGscReport(forceRefresh: boolean): Promise<void> {
  syncGscTargetWithCurrentPage();
  if (!gscState.connected) {
    await initializeGsc(false);
  }
  const targetUrl = gscState.targetUrl;
  const property = gscState.selectedProperty;
  if (!gscState.connected || targetUrl === undefined || property === undefined) {
    renderGsc();
    return;
  }
  gscAutoLoadPending = false;
  await persistCurrentGscSelection();

  const requestVersion = (gscRequestVersion += 1);
  const filters = { ...gscState.preferences.filters };
  gscState = { ...gscState, loading: true, error: undefined };
  renderGsc();
  try {
    const report = await sendGscMessage<GscReportResponse>({ type: "gsc:query", property, targetUrl, filters, forceRefresh });
    if (!isCurrentGscRequest(requestVersion, targetUrl, property, filters)) {
      return;
    }
    gscState = { ...gscState, loading: false, report, error: undefined };
  } catch (error) {
    if (!isCurrentGscRequest(requestVersion, targetUrl, property, filters)) {
      return;
    }
    gscState = { ...gscState, loading: false, report: undefined, error: normalizePanelGscError(error) };
  }
  renderGsc();
  if (gscAutoLoadPending && activeTopTab === "gsc" && gscState.connected && gscState.selectedProperty !== undefined && gscState.targetUrl !== undefined && !gscState.loading) {
    void loadGscReport(false);
  }
}

function isCurrentGscRequest(requestVersion: number, targetUrl: string, property: GscProperty, filters: GscReportResponse["filters"]): boolean {
  return (
    requestVersion === gscRequestVersion &&
    gscState.targetUrl === targetUrl &&
    gscState.selectedProperty?.siteUrl === property.siteUrl &&
    sameGscFilters(gscState.preferences.filters, filters)
  );
}

function sameGscFilters(a: GscReportResponse["filters"], b: GscReportResponse["filters"]): boolean {
  return a.startDate === b.startDate && a.endDate === b.endDate && a.searchType === b.searchType && a.country === b.country && a.device === b.device;
}

async function selectGscProperty(siteUrl: string): Promise<void> {
  const selectedProperty = gscState.properties.find((property) => property.siteUrl === siteUrl);
  if (selectedProperty === undefined) {
    return;
  }
  const targetUrl = gscState.targetUrl;
  const selectedProperties = { ...gscState.preferences.selectedProperties };
  if (targetUrl !== undefined) {
    selectedProperties[sitePreferenceKey(targetUrl)] = selectedProperty.siteUrl;
  }
  const preferences = { ...gscState.preferences, selectedProperties };
  gscState = { ...gscState, preferences, selectedProperty, report: undefined };
  await saveGscPreferences(preferences);
  await loadGscReport(false);
}

async function updateGscFiltersFromControls(): Promise<void> {
  const filters = normalizeFilters({
    startDate: gscStartDateInput.value,
    endDate: gscEndDateInput.value,
    searchType: gscSearchTypeSelect.value,
    country: gscCountryInput.value,
    device: gscDeviceSelect.value,
  });
  const preferences = { ...gscState.preferences, filters };
  gscState = { ...gscState, preferences, report: undefined };
  await saveGscPreferences(preferences);
  await loadGscReport(false);
}

async function applyGscQuickRange(days: number): Promise<void> {
  const range = gscDateRange(days);
  const preferences = {
    ...gscState.preferences,
    filters: { ...gscState.preferences.filters, ...range },
  };
  gscState = { ...gscState, preferences, report: undefined };
  await saveGscPreferences(preferences);
  await loadGscReport(false);
}

async function saveGscPreferences(preferences: GscPreferences): Promise<void> {
  try {
    await sendGscMessage({ type: "gsc:savePreferences", preferences });
  } catch (error) {
    gscState = { ...gscState, error: normalizePanelGscError(error) };
    renderGsc();
  }
}

async function persistCurrentGscSelection(): Promise<void> {
  const targetUrl = gscState.targetUrl;
  const selectedProperty = gscState.selectedProperty;
  if (targetUrl === undefined || selectedProperty === undefined) {
    return;
  }
  const key = sitePreferenceKey(targetUrl);
  if (gscState.preferences.selectedProperties[key] === selectedProperty.siteUrl) {
    return;
  }
  const preferences = {
    ...gscState.preferences,
    selectedProperties: { ...gscState.preferences.selectedProperties, [key]: selectedProperty.siteUrl },
  };
  gscState = { ...gscState, preferences };
  await saveGscPreferences(preferences);
}

function selectBestKnownGscProperty(): void {
  const targetUrl = gscState.targetUrl;
  if (targetUrl === undefined) {
    gscState = { ...gscState, selectedProperty: undefined };
    return;
  }
  const preferred = gscState.preferences.selectedProperties[sitePreferenceKey(targetUrl)];
  const selectedProperty = selectBestGscProperty(gscState.properties, targetUrl, preferred);
  gscState = { ...gscState, selectedProperty };
}

function renderGsc(): void {
  const status = requireElement<HTMLElement>("gsc-status");
  const target = requireElement<HTMLElement>("gsc-target-url");
  const propertyControl = document.querySelector<HTMLElement>(".gsc-property-control");
  const quickRanges = requireElement<HTMLElement>("gsc-quick-ranges");
  const queryFilterPanel = requireElement<HTMLElement>("gsc-query-filter-panel");
  const results = requireElement<HTMLElement>("gsc-results");

  target.textContent = gscState.targetUrl === undefined ? "Analyze a page to choose a Search Console target URL." : `Target URL: ${gscState.targetUrl}`;
  status.classList.toggle("error", gscState.error !== undefined);
  renderGscStatus(status);
  gscConnectButton.hidden = gscState.connected;
  gscDisconnectButton.hidden = !gscState.connected;
  gscRefreshButton.hidden = !gscState.connected || gscState.selectedProperty === undefined || gscState.targetUrl === undefined;
  gscConnectButton.disabled = gscState.loading;
  gscDisconnectButton.disabled = gscState.loading;
  gscRefreshButton.disabled = gscState.loading;

  if (propertyControl !== null) {
    propertyControl.hidden = !gscState.connected;
  }
  quickRanges.hidden = !gscState.connected;
  gscFilterDetails.hidden = !gscState.connected;
  gscFilterDetails.open = gscFiltersOpen;
  queryFilterPanel.hidden = gscState.report === undefined;
  renderGscControls();

  if (gscState.targetUrl === undefined) {
    results.replaceChildren(emptyState("No page target", "Analyze a normal HTTP or HTTPS page before loading Search Console data."));
    return;
  }
  if (gscState.loading) {
    results.replaceChildren(emptyState("Loading GSC data", "Fetching properties and page query rows from Google Search Console..."));
    return;
  }
  if (gscState.error !== undefined) {
    results.replaceChildren(emptyState(gscErrorTitle(gscState.error), gscState.error.message, helpLink(gscHelpTopic(gscState.error))));
    return;
  }
  if (!gscState.connected) {
    results.replaceChildren(emptyState("Connect Search Console", "Use a Google account with Search Console access to see this page's ranking queries."));
    return;
  }
  if (gscState.properties.length === 0) {
    results.replaceChildren(emptyState("No accessible properties", "The Google account signed into Chrome has no Search Console properties available here. Check that this Chrome profile uses the right Google account and that the site is verified in Search Console.", helpLink("help-property-access")));
    return;
  }
  if (gscState.selectedProperty === undefined) {
    results.replaceChildren(emptyState("No matching property", "No listed Search Console property clearly contains this page URL. Select the correct property manually or verify that this page belongs to a Search Console property on the signed-in Google account.", helpLink("help-matching-property")));
    return;
  }
  if (gscState.report === undefined) {
    results.replaceChildren(emptyState("No GSC report loaded", "Refresh GSC to load top queries for this page."));
    return;
  }
  const rows = visibleGscRows(gscState.report);
  if (gscState.report.rows.length === 0) {
    results.replaceChildren(emptyState("No query data", "Search Console returned no query rows for this page and filter set."), gscReportMeta(gscState.report));
    return;
  }
  if (rows.length === 0) {
    results.replaceChildren(emptyState("No matching queries", "Adjust the query filter to show Search Console rows."), gscReportMeta(gscState.report));
    return;
  }
  results.replaceChildren(gscReportMeta(gscState.report, rows.length), gscTotals(gscState.report, rows), gscTableHeading(), gscTable(rows));
}

function renderGscStatus(status: HTMLElement): void {
  if (gscState.error === undefined) {
    status.textContent = gscStatusText();
    return;
  }
  status.replaceChildren(document.createTextNode(gscState.error.message), document.createTextNode(" "), helpLink(gscHelpTopic(gscState.error)));
}

function gscErrorTitle(error: GscApiError): string {
  if (error.code === "browser-signin-disabled") return "Chrome Sign-in is off";
  if (error.code === "signed-out") return "Search Console is not connected";
  if (error.code === "PERMISSION_DENIED" || error.code === "http-403") return "Search Console access denied";
  if (error.code === "NOT_FOUND" || error.code === "http-404") return "Search Console property not found";
  if (error.code === "RESOURCE_EXHAUSTED" || error.code === "http-429") return "Search Console is rate limiting requests";
  return "GSC request failed";
}

function gscHelpTopic(error: GscApiError): HelpTopic {
  if (error.code === "browser-signin-disabled") return "help-chrome-signin";
  if (error.code === "PERMISSION_DENIED" || error.code === "http-403") return "help-property-access";
  if (error.code === "NOT_FOUND" || error.code === "http-404") return "help-matching-property";
  if (error.code === "RESOURCE_EXHAUSTED" || error.code === "http-429") return "help-rate-limit";
  return "help-connect-gsc";
}

function helpLink(topic: HelpTopic, label = "Open Help"): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = `#${topic}`;
  link.textContent = label;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openHelpTopic(topic);
  });
  return link;
}

function openHelpTopic(topic: HelpTopic): void {
  activateTopTab("help");
  window.history.replaceState(null, "", `#${topic}`);
  window.requestAnimationFrame(() => {
    const question = document.getElementById(topic);
    if (question instanceof HTMLDetailsElement) {
      question.open = true;
      question.scrollIntoView({ block: "start", behavior: "smooth" });
      question.querySelector<HTMLElement>("summary")?.focus();
    }
  });
}

function renderGscControls(): void {
  const propertyOptions = gscState.properties.map((property) => optionElement(property.siteUrl, property.displayName));
  if (gscState.selectedProperty === undefined) {
    const placeholder = optionElement("", "Select matching property");
    placeholder.disabled = true;
    propertyOptions.unshift(placeholder);
  }
  gscPropertySelect.replaceChildren(...propertyOptions);
  if (gscState.selectedProperty !== undefined) {
    gscPropertySelect.value = gscState.selectedProperty.siteUrl;
  } else {
    gscPropertySelect.value = "";
  }
  const filters = gscState.preferences.filters;
  gscQueryFilterInput.value = gscQueryFilter;
  gscStartDateInput.value = filters.startDate;
  gscEndDateInput.value = filters.endDate;
  gscSearchTypeSelect.value = filters.searchType;
  gscCountryInput.value = filters.country;
  gscDeviceSelect.value = filters.device;
  renderGscQuickRangeButtons(filters.startDate, filters.endDate);
}

function renderGscQuickRangeButtons(startDate: string, endDate: string): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-gsc-range]"))) {
    const days = Number(button.dataset["gscRange"]);
    const range = gscDateRange(days);
    button.classList.toggle("active", range.startDate === startDate && range.endDate === endDate);
  }
}

function gscStatusText(): string {
  if (gscState.error !== undefined) {
    return gscState.error.message;
  }
  if (gscState.loading) {
    return "Loading Google Search Console data...";
  }
  if (!gscState.connected) {
    return "Connect Google Search Console to view query data for the current page.";
  }
  if (gscState.report?.cacheHit === true) {
    return "Showing cached Search Console data from the last 15 minutes.";
  }
  return "Google Search Console is connected.";
}

function optionElement(value: string, label: string): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function gscReportMeta(report: GscReportResponse, visibleRows = report.rows.length): HTMLElement {
  const meta = document.createElement("p");
  meta.className = "gsc-report-meta";
  const fetched = formatTime(report.fetchedAt);
  const rowText = visibleRows === report.rows.length ? `${report.rows.length} rows` : `${visibleRows} of ${report.rows.length} rows`;
  meta.textContent = `${report.property.displayName} / ${report.filters.startDate} to ${report.filters.endDate} / ${report.filters.searchType} / ${rowText} / ${report.cacheHit ? "cached" : `fetched ${fetched}`}`;
  return meta;
}

function gscTable(rows: GscReportResponse["rows"]): HTMLElement {
  const table = document.createElement("table");
  table.className = "gsc-table";
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  header.replaceChildren(
    gscSortHeader("query", "Query"),
    gscSortHeader("clicks", "Clicks"),
    gscSortHeader("impressions", "Impressions"),
    gscSortHeader("ctr", "CTR"),
    gscSortHeader("position", "Position"),
  );
  thead.append(header);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.append(gscCell(row.query, "query"), gscCell(String(row.clicks)), gscCell(String(row.impressions)), gscCell(formatPercent(row.ctr)), gscCell(row.position.toFixed(1)));
    tbody.append(tr);
  }
  table.replaceChildren(thead, tbody);
  return table;
}

function gscTableHeading(): HTMLElement {
  const heading = document.createElement("h3");
  heading.className = "gsc-table-heading";
  heading.textContent = "Top 50 queries by clicks";
  return heading;
}

function gscTotals(report: GscReportResponse, rows: GscReportResponse["rows"]): HTMLElement {
  const grid = document.createElement("section");
  grid.className = "gsc-totals";
  grid.setAttribute("aria-label", "Search Console totals");
  grid.replaceChildren(
    gscTotalCard(String(rows.length), gscQueryFilter.trim() === "" ? "Shown queries" : "Matching queries"),
    gscTotalCard(numberFormat(report.summary.clicks), "Total clicks"),
    gscTotalCard(numberFormat(report.summary.impressions), "Total impressions"),
  );
  return grid;
}

function gscTotalCard(value: string, label: string): HTMLElement {
  const card = document.createElement("div");
  const valueElement = document.createElement("strong");
  valueElement.textContent = value;
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  card.replaceChildren(valueElement, labelElement);
  return card;
}

function gscSortHeader(key: GscSortKey, label: string): HTMLTableCellElement {
  const th = document.createElement("th");
  const button = document.createElement("button");
  button.className = "gsc-sort-button";
  button.type = "button";
  const active = gscSort.key === key;
  button.textContent = active ? `${label} ${gscSort.direction === "asc" ? "▲" : "▼"}` : label;
  button.setAttribute("aria-sort", active ? (gscSort.direction === "asc" ? "ascending" : "descending") : "none");
  button.addEventListener("click", () => {
    sortGscRows(key);
  });
  th.append(button);
  return th;
}

function sortGscRows(key: GscSortKey): void {
  gscSort = gscSort.key === key ? { key, direction: gscSort.direction === "asc" ? "desc" : "asc" } : { key, direction: defaultGscSortDirection(key) };
  renderGsc();
}

function defaultGscSortDirection(key: GscSortKey): GscSortState["direction"] {
  return key === "query" || key === "position" ? "asc" : "desc";
}

function visibleGscRows(report: GscReportResponse): GscReportResponse["rows"] {
  const query = gscQueryFilter.trim().toLowerCase();
  const rows = query === "" ? [...report.rows] : report.rows.filter((row) => row.query.toLowerCase().includes(query));
  rows.sort((a, b) => compareGscRows(a, b));
  return rows;
}

function compareGscRows(a: GscReportResponse["rows"][number], b: GscReportResponse["rows"][number]): number {
  const direction = gscSort.direction === "asc" ? 1 : -1;
  if (gscSort.key === "query") {
    return a.query.localeCompare(b.query) * direction;
  }
  return (a[gscSort.key] - b[gscSort.key]) * direction || a.query.localeCompare(b.query);
}

function gscCell(value: string, className?: string): HTMLTableCellElement {
  const cell = document.createElement("td");
  if (className !== undefined) {
    cell.className = className;
  }
  cell.textContent = value;
  return cell;
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, style: "percent" }).format(value);
}

function numberFormat(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function gscDateRange(days: number): Pick<GscReportResponse["filters"], "endDate" | "startDate"> {
  return { startDate: daysAgoDate(days), endDate: daysAgoDate(1) };
}

function daysAgoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function sendGscMessage<T>(message: GscRuntimeRequest): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as GscRuntimeResponse<T>;
  if (!response.ok) {
    throw response.error;
  }
  return response.value;
}

function normalizePanelGscError(error: unknown): GscApiError {
  if (typeof error === "object" && error !== null && typeof (error as GscApiError).code === "string" && typeof (error as GscApiError).message === "string") {
    return error as GscApiError;
  }
  if (error instanceof Error) {
    return { code: "error", message: error.message };
  }
  return { code: "error", message: String(error) };
}

function findingCard(finding: Finding, result: AnalysisResult): HTMLElement {
  const article = document.createElement("article");
  article.className = `finding ${finding.severity}`;

  const title = document.createElement("h2");
  title.textContent = finding.title;

  const meta = document.createElement("p");
  meta.className = "meta";
  const source = finding.sourceId !== undefined ? result.sources.find((entry) => entry.id === finding.sourceId) : undefined;
  meta.textContent = [finding.severity.toUpperCase(), finding.format, source?.label, finding.property].filter(Boolean).join(" / ");

  const message = document.createElement("p");
  message.textContent = finding.message;

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = finding.hint;

  article.replaceChildren(title, meta, message, hint);
  return article;
}

function nodeDetails(node: SchemaNode, allNodes: SchemaNode[], ancestors: Set<string>): HTMLElement {
  const details = document.createElement("details");
  details.className = "node";
  details.open = true;

  const summary = document.createElement("summary");
  const title = document.createElement("span");
  title.textContent = `${node.types.join(", ") || "Untyped entity"} (${node.format})`;

  const actions = document.createElement("span");
  actions.className = "node-actions";
  actions.append(
    copyControl({ label: "ID", name: "Node", value: node.nodeId ?? node.id, status: setStatus }),
    copyControl({ label: "SRC", name: "Source", value: node.sourceId, status: setStatus }),
  );
  if (node.links.length > 0) {
    actions.append(copyControl({ label: "LNK", name: "Links", value: node.links.map((link) => `${link.property} -> ${link.target}`).join("\n"), status: setStatus }));
  }
  summary.replaceChildren(title, actions);

  const properties = propertyTable(node.properties);
  const children = childGroups(node, allNodes, ancestors, (child) => treeMatchesQuery(child, allNodes, (entry) => matchesQuery(nodeSearchText(entry))));
  const childTree = children.length > 0 ? childTreeElement(children, allNodes, new Set([...ancestors, node.id])) : undefined;

  details.replaceChildren(summary, properties, ...(childTree !== undefined ? [childTree] : []));
  return details;
}

function childTreeElement(groups: ChildGroup[], allNodes: SchemaNode[], ancestors: Set<string>): HTMLElement {
  const container = document.createElement("section");
  container.className = "child-tree";
  for (const group of groups) {
    const groupElement = document.createElement("section");
    groupElement.className = "child-group";
    const label = document.createElement("h3");
    label.textContent = group.property;
    groupElement.replaceChildren(label, ...group.nodes.map((child) => nodeDetails(child, allNodes, ancestors)));
    container.append(groupElement);
  }
  return container;
}

function propertyTable(properties: Record<string, unknown>): HTMLElement {
  const table = document.createElement("table");
  table.className = "property-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const propertyHeader = document.createElement("th");
  propertyHeader.textContent = "Property";
  const valueHeader = document.createElement("th");
  valueHeader.textContent = "Value";
  headerRow.replaceChildren(propertyHeader, valueHeader);
  thead.append(headerRow);

  const tbody = document.createElement("tbody");
  const entries = Object.entries(properties);
  if (entries.length === 0) {
    const row = document.createElement("tr");
    const empty = document.createElement("td");
    empty.colSpan = 2;
    empty.className = "empty-cell";
    empty.textContent = "No properties detected.";
    row.append(empty);
    tbody.append(row);
  } else {
    for (const [key, value] of entries) {
      const row = document.createElement("tr");
      const property = document.createElement("th");
      property.scope = "row";
      property.textContent = key;
      const propertyValue = document.createElement("td");
      propertyValue.append(valueElement(value));
      row.replaceChildren(property, propertyValue);
      tbody.append(row);
    }
  }

  table.replaceChildren(thead, tbody);
  return table;
}

function valueElement(value: unknown): HTMLElement {
  if (Array.isArray(value)) {
    const list = document.createElement("ul");
    list.className = "value-list";
    for (const entry of value) {
      const item = document.createElement("li");
      item.append(valueElement(entry));
      list.append(item);
    }
    return list;
  }
  if (isRecord(value)) {
    const nested = document.createElement("dl");
    nested.className = "value-object";
    for (const [key, entry] of Object.entries(value)) {
      const term = document.createElement("dt");
      term.textContent = key;
      const description = document.createElement("dd");
      description.append(valueElement(entry));
      nested.append(term, description);
    }
    return nested;
  }
  const span = document.createElement("span");
  span.className = `value value-${valueType(value)}`;
  span.textContent = value === null ? "null" : String(value);
  return span;
}

function sourceDetails(source: SourceBlock): HTMLElement {
  const details = document.createElement("details");
  details.className = "source";
  details.open = source.format === "json-ld";

  const summary = document.createElement("summary");
  const title = document.createElement("span");
  title.textContent = `${source.label} (${source.format})`;

  const actions = document.createElement("span");
  actions.className = "node-actions";
  if (source.selector !== undefined) {
    actions.append(copyControl({ label: "LOC", name: "Location", value: source.selector, status: setStatus }));
  }
  actions.append(copyControl({ name: "Source", value: sourceDisplayText(source), status: setStatus, icon: true }));
  summary.replaceChildren(title, actions);

  const code = sourceCodeBlock(source);

  details.replaceChildren(summary, code);
  return details;
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function filterFindings(findings: Finding[]): Finding[] {
  return findings.filter((finding) => matchesSeverity(finding.severity) && matchesFormat(finding.format) && matchesQuery(findingSearchText(finding)));
}

function filterNodes(nodes: SchemaNode[]): SchemaNode[] {
  return nodes.filter((node) => matchesFormat(node.format) && matchesQuery(nodeSearchText(node)));
}

function matchesSeverity(severity: string): boolean {
  return severitySelect.value === "all" || severitySelect.value === severity;
}

function matchesFormat(format: StructuredDataFormat | undefined): boolean {
  return formatSelect.value === "all" || formatSelect.value === format;
}

function matchesQuery(text: string): boolean {
  const query = searchInput.value.trim().toLowerCase();
  return query === "" || text.toLowerCase().includes(query);
}

function findingSearchText(finding: Finding): string {
  return [finding.title, finding.message, finding.hint, finding.severity, finding.format, finding.property, finding.ruleId].filter(Boolean).join(" ");
}

function nodeSearchText(node: SchemaNode): string {
  return [node.id, node.nodeId, node.sourceId, node.format, node.types.join(" "), JSON.stringify(node.properties)].filter(Boolean).join(" ");
}

function sourceSearchText(source: SourceBlock): string {
  return [source.id, source.label, source.format, source.selector, source.raw].filter(Boolean).join(" ");
}

function emptyState(title: string, body: string, action?: HTMLElement): HTMLElement {
  const section = document.createElement("section");
  section.className = "empty";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = body;
  section.replaceChildren(heading, paragraph, ...(action === undefined ? [] : [action]));
  return section;
}

function setStatus(message: string, isError = false): void {
  for (const status of Array.from(document.querySelectorAll<HTMLElement>(".analysis-status"))) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }
}

function setText(id: string, value: string): void {
  requireElement<HTMLElement>(id).textContent = value;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}
