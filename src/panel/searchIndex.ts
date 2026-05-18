import type { AnalysisResult, Finding, SchemaNode, SourceBlock } from "../analyzer/types";

export interface SearchIndex {
  findings: WeakMap<Finding, string>;
  nodes: WeakMap<SchemaNode, string>;
  sources: WeakMap<SourceBlock, string>;
}

export function emptySearchIndex(): SearchIndex {
  return {
    findings: new WeakMap(),
    nodes: new WeakMap(),
    sources: new WeakMap(),
  };
}

export function buildSearchIndex(result: AnalysisResult): SearchIndex {
  const index = emptySearchIndex();
  for (const finding of result.findings) {
    index.findings.set(finding, findingSearchText(finding));
  }
  for (const node of result.nodes) {
    index.nodes.set(node, nodeSearchText(node));
  }
  for (const source of result.sources) {
    index.sources.set(source, sourceSearchText(source));
  }
  return index;
}

export function getFindingSearchText(index: SearchIndex, finding: Finding): string {
  return index.findings.get(finding) ?? findingSearchText(finding);
}

export function getNodeSearchText(index: SearchIndex, node: SchemaNode): string {
  return index.nodes.get(node) ?? nodeSearchText(node);
}

export function getSourceSearchText(index: SearchIndex, source: SourceBlock): string {
  return index.sources.get(source) ?? sourceSearchText(source);
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
