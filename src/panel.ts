import { analyzeExtractedData } from "./analyzer/analysis";
import type { AnalysisResult, ExtractedPageData, Finding, SchemaNode, SourceBlock, StructuredDataFormat } from "./analyzer/types";
import { inspectedPageAnalysis } from "./inspectedPage";

let currentResult: AnalysisResult | null = null;
let activeView: "findings" | "tree" | "source" = "tree";
let isAnalyzing = false;
let lastObservedUrl: string | null = null;
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

chrome.devtools.network.onNavigated.addListener((url) => {
  lastObservedUrl = url;
  scheduleAnalysis("Page navigation detected. Reanalyzing current DOM...", 500);
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
    const extracted = await evaluateInspectedPage();
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
    const url = await evaluateInspectedExpression<string>("window.location.href");
    if (lastObservedUrl !== null && url !== lastObservedUrl) {
      lastObservedUrl = url;
      scheduleAnalysis("URL change detected. Reanalyzing current DOM...", 300);
      return;
    }
    lastObservedUrl = url;
  } catch {
    // The inspected page may be between navigations. The next poll or navigation event will retry.
  }
}

function evaluateInspectedPage(): Promise<ExtractedPageData> {
  const expression = `(${inspectedPageAnalysis.toString()})()`;
  return evaluateInspectedExpression<ExtractedPageData>(expression);
}

function evaluateInspectedExpression<T>(expression: string): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(expression, { useContentScriptContext: false }, (result, exceptionInfo) => {
      if (exceptionInfo !== undefined && exceptionInfo.isException) {
        reject(new Error(exceptionInfo.value ?? exceptionInfo.description ?? "Unable to inspect the current page."));
        return;
      }
      resolve(result as T);
    });
  });
}

function render(): void {
  renderSummary();
  if (activeView === "findings") renderFindings();
  if (activeView === "tree") renderTree();
  if (activeView === "source") renderSources();
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
  const nodes = filterNodes(result.nodes);
  view.replaceChildren(...nodes.map((node) => nodeDetails(node)));
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

function nodeDetails(node: SchemaNode): HTMLElement {
  const details = document.createElement("details");
  details.className = "node";
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent = `${node.types.join(", ") || "Untyped entity"} (${node.format})`;

  const id = document.createElement("p");
  id.className = "meta";
  id.textContent = `Node: ${node.nodeId ?? node.id} / Source: ${node.sourceId}`;

  const links = document.createElement("p");
  links.className = "meta";
  links.textContent = node.links.length > 0 ? `Links: ${node.links.map((link) => `${link.property} -> ${link.target}`).join(", ")}` : "Links: none";

  const properties = propertyTable(node.properties);

  details.replaceChildren(summary, id, links, properties);
  return details;
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
  summary.textContent = `${source.label} (${source.format})`;

  const selector = document.createElement("p");
  selector.className = "meta";
  selector.textContent = source.selector !== undefined ? `Source: ${source.selector}` : "Source location unavailable";

  const code = sourceCodeBlock(source);

  details.replaceChildren(summary, selector, code);
  return details;
}

function jsonCodeBlock(value: unknown): HTMLElement {
  return codeBlock(JSON.stringify(value, null, 2), "json", true);
}

function sourceCodeBlock(source: SourceBlock): HTMLElement {
  if (source.format === "json-ld") {
    try {
      return jsonCodeBlock(JSON.parse(source.raw));
    } catch {
      return codeBlock(source.raw, "raw", false);
    }
  }
  return codeBlock(source.raw, "raw", false);
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
