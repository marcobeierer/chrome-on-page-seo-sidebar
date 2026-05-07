import { analyzeExtractedData } from "./analyzer/analysis";
import type { AnalysisResult, ExtractedPageData, Finding, HreflangLink, PageSeoData, SchemaNode, SourceBlock, StructuredDataFormat } from "./analyzer/types";
import { inspectedPageAnalysis } from "./inspectedPage";

let currentResult: AnalysisResult | null = null;
let activeView: "findings" | "tree" | "source" = "tree";
let isAnalyzing = false;
let pageDataOpen = true;
let lastObservedUrl: string | null = null;
let lastActiveTabId: number | null = null;
let pendingRefresh: number | undefined;

const refreshButton = requireElement<HTMLButtonElement>("refresh");
const statusElement = requireElement<HTMLElement>("status");
const searchInput = requireElement<HTMLInputElement>("search");
const severitySelect = requireElement<HTMLSelectElement>("severity");
const formatSelect = requireElement<HTMLSelectElement>("format");

refreshButton.addEventListener("click", () => {
  scheduleAnalysis("Manual refresh requested.", 0);
});
searchInput.addEventListener("input", render);
severitySelect.addEventListener("change", render);
formatSelect.addEventListener("change", render);

for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"))) {
  tab.addEventListener("click", () => {
    activeView = tab.dataset["view"] as typeof activeView;
    for (const entry of Array.from(document.querySelectorAll(".tab, .view"))) {
      entry.classList.remove("active");
    }
    tab.classList.add("active");
    requireElement<HTMLElement>(`${activeView}-view`).classList.add("active");
    render();
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

async function refreshAnalysis(): Promise<void> {
  if (isAnalyzing) {
    scheduleAnalysis("Analysis already running. Rechecking shortly...", 300);
    return;
  }

  isAnalyzing = true;
  refreshButton.disabled = true;
  setStatus("Analyzing current DOM...");

  try {
    const extracted = await evaluateActiveTabPage();
    currentResult = analyzeExtractedData(extracted);
    lastObservedUrl = currentResult.url;
    setStatus(`Analyzed ${currentResult.title || currentResult.url} at ${formatTime(currentResult.analyzedAt)}.`);
    render();
  } catch (error) {
    currentResult = null;
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

function evaluateActiveTabPage(): Promise<ExtractedPageData> {
  return evaluateActiveTabFunction(inspectedPageAnalysis);
}

async function evaluateActiveTabFunction<T>(func: () => T): Promise<T> {
  const tab = await getActiveTab();
  if (tab.id === undefined) {
    throw new Error("No active tab is available for analysis.");
  }
  if (isRestrictedUrl(tab.url)) {
    throw new Error("Chrome does not allow extensions to analyze this page. Open a normal website, staging page, or localhost URL.");
  }

  lastActiveTabId = tab.id;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func,
  });

  if (result === undefined) {
    throw new Error("The page did not return analysis data.");
  }
  return result.result as T;
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
  const roots = treeRoots(nodes).filter((node) => treeMatchesQuery(node, nodes, new Set()));
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
    copyChip("ID", "Node", node.nodeId ?? node.id),
    copyChip("SRC", "Source", node.sourceId),
  );
  if (node.links.length > 0) {
    actions.append(copyChip("LNK", "Links", node.links.map((link) => `${link.property} -> ${link.target}`).join("\n")));
  }
  summary.replaceChildren(title, actions);

  const properties = propertyTable(node.properties);
  const children = childGroups(node, allNodes, ancestors);
  const childTree = children.length > 0 ? childTreeElement(children, allNodes, new Set([...ancestors, node.id])) : undefined;

  details.replaceChildren(summary, properties, ...(childTree !== undefined ? [childTree] : []));
  return details;
}

interface ChildGroup {
  property: string;
  nodes: SchemaNode[];
}

function treeRoots(nodes: SchemaNode[]): SchemaNode[] {
  const childIds = new Set<string>();
  for (const node of nodes) {
    for (const link of node.links) {
      const child = findLinkedNode(link.target, nodes);
      if (child !== undefined) {
        childIds.add(child.id);
      }
    }
  }
  return nodes.filter((node) => !childIds.has(node.id));
}

function childGroups(node: SchemaNode, allNodes: SchemaNode[], ancestors: Set<string>): ChildGroup[] {
  const groups = new Map<string, SchemaNode[]>();
  for (const link of node.links) {
    const child = findLinkedNode(link.target, allNodes);
    if (child === undefined || ancestors.has(child.id) || child.id === node.id || !treeMatchesQuery(child, allNodes, new Set(ancestors))) {
      continue;
    }
    const group = groups.get(link.property) ?? [];
    if (!group.some((entry) => entry.id === child.id)) {
      group.push(child);
    }
    groups.set(link.property, group);
  }
  return Array.from(groups, ([property, groupNodes]) => ({ property, nodes: groupNodes }));
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

function findLinkedNode(target: string, nodes: SchemaNode[]): SchemaNode | undefined {
  return nodes.find((node) => node.id === target || node.nodeId === target);
}

function treeMatchesQuery(node: SchemaNode, allNodes: SchemaNode[], seen: Set<string>): boolean {
  if (seen.has(node.id)) {
    return false;
  }
  if (matchesQuery(nodeSearchText(node))) {
    return true;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(node.id);
  return node.links.some((link) => {
    const child = findLinkedNode(link.target, allNodes);
    return child !== undefined && treeMatchesQuery(child, allNodes, nextSeen);
  });
}

function copyChip(label: string, name: string, value: string): HTMLButtonElement {
  const button = document.createElement("button");
  const popover = document.createElement("div");

  popover.className = "copy-popover";
  popover.popover = "manual";
  const content = document.createElement("span");
  content.className = "copy-popover-value";
  content.textContent = value;
  const hint = document.createElement("span");
  hint.className = "copy-popover-hint";
  hint.textContent = "Click to copy";
  popover.replaceChildren(content, hint);
  document.body.append(popover);

  button.className = "copy-chip";
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", `Copy ${name.toLowerCase()}`);
  button.addEventListener("mouseenter", () => showCopyPopover(button, popover, name));
  button.addEventListener("mouseleave", () => hideCopyPopover(popover));
  button.addEventListener("focus", () => showCopyPopover(button, popover, name));
  button.addEventListener("blur", () => hideCopyPopover(popover));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void copyToClipboard(value, name);
  });
  return button;
}

function showCopyPopover(anchor: HTMLElement, popover: HTMLElement, name: string): void {
  const rect = anchor.getBoundingClientRect();
  popover.dataset["label"] = name;
  popover.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;
  popover.style.top = `${rect.bottom + 6}px`;
  if (!popover.matches(":popover-open")) {
    popover.showPopover();
  }
}

function hideCopyPopover(popover: HTMLElement): void {
  if (popover.matches(":popover-open")) {
    popover.hidePopover();
  }
}

async function copyToClipboard(value: string, name: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    setStatus(`Copied ${name.toLowerCase()} to clipboard.`);
  } catch {
    setStatus(`Could not copy ${name.toLowerCase()} to clipboard.`, true);
  }
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
    actions.append(copyChip("LOC", "Location", source.selector));
  }
  actions.append(copyIconButton("Source", sourceDisplayText(source)));
  summary.replaceChildren(title, actions);

  const code = sourceCodeBlock(source);

  details.replaceChildren(summary, code);
  return details;
}

function copyIconButton(name: string, value: string): HTMLButtonElement {
  const button = document.createElement("button");
  const popover = document.createElement("div");
  const content = document.createElement("span");
  const hint = document.createElement("span");

  popover.className = "copy-popover";
  popover.popover = "manual";
  content.className = "copy-popover-value";
  content.textContent = `Copy full ${name.toLowerCase()}`;
  hint.className = "copy-popover-hint";
  hint.textContent = "Click to copy";
  popover.replaceChildren(content, hint);
  document.body.append(popover);

  button.className = "copy-chip copy-icon-chip";
  button.type = "button";
  button.setAttribute("aria-label", `Copy ${name.toLowerCase()}`);
  button.append(copyIconSvg());
  button.addEventListener("mouseenter", () => showCopyPopover(button, popover, name));
  button.addEventListener("mouseleave", () => hideCopyPopover(popover));
  button.addEventListener("focus", () => showCopyPopover(button, popover, name));
  button.addEventListener("blur", () => hideCopyPopover(popover));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void copyToClipboard(value, name);
  });
  return button;
}

function copyIconSvg(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const back = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  back.setAttribute("x", "5");
  back.setAttribute("y", "3");
  back.setAttribute("width", "8");
  back.setAttribute("height", "9");
  back.setAttribute("rx", "1.5");
  const front = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  front.setAttribute("x", "3");
  front.setAttribute("y", "5");
  front.setAttribute("width", "8");
  front.setAttribute("height", "9");
  front.setAttribute("rx", "1.5");
  svg.append(back, front);
  return svg;
}

function sourceCodeBlock(source: SourceBlock): HTMLElement {
  const displayText = sourceDisplayText(source);
  if (source.format === "json-ld" && displayText !== source.raw) {
    return codeBlock(displayText, "json", true);
  }
  return codeBlock(displayText, "raw", false);
}

function sourceDisplayText(source: SourceBlock): string {
  if (source.format === "json-ld") {
    try {
      return JSON.stringify(JSON.parse(source.raw), null, 2);
    } catch {
      return source.raw;
    }
  }
  return source.raw;
}

function codeBlock(content: string, language: "json" | "raw", highlightJson: boolean): HTMLElement {
  const pre = document.createElement("pre");
  pre.className = `code-block ${language}`;

  const code = document.createElement("code");
  if (highlightJson) {
    code.append(...jsonSyntaxNodes(content));
  } else {
    code.textContent = content;
  }
  pre.append(code);
  return pre;
}

function jsonSyntaxNodes(json: string): Node[] {
  const tokenPattern = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:?)|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const nodes: Node[] = [];
  let cursor = 0;

  for (const match of json.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(document.createTextNode(json.slice(cursor, index)));
    }
    const span = document.createElement("span");
    span.className = `json-${jsonTokenClass(token)}`;
    span.textContent = token;
    nodes.push(span);
    cursor = index + token.length;
  }

  if (cursor < json.length) {
    nodes.push(document.createTextNode(json.slice(cursor)));
  }
  return nodes;
}

function jsonTokenClass(token: string): string {
  if (token.endsWith(":")) return "key";
  if (token === "true" || token === "false") return "boolean";
  if (token === "null") return "null";
  if (/^-?\d/.test(token)) return "number";
  return "string";
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

function emptyState(title: string, body: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "empty";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = body;
  section.replaceChildren(heading, paragraph);
  return section;
}

function setStatus(message: string, isError = false): void {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
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
