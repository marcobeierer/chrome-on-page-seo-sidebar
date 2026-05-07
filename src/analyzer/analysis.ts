import { parseJsonLdSource } from "./jsonld";
import type {
  AnalysisResult,
  AnalysisSummary,
  ExtractedPageData,
  Finding,
  FindingSeverity,
  RichResultRule,
  RuleField,
  RuleValueShape,
  SchemaNode,
  StructuredDataFormat,
} from "./types";
import { googleRichResultRules } from "../rules/googleRichResults";

export function analyzeExtractedData(extracted: ExtractedPageData): AnalysisResult {
  const findings: Finding[] = [];
  const nodes: SchemaNode[] = [...extracted.nodes];

  for (const source of extracted.sources.filter((entry) => entry.format === "json-ld")) {
    const parsed = parseJsonLdSource(source);
    nodes.push(...parsed.nodes);
    findings.push(...parsed.findings);
  }

  findings.push(...findDuplicateAndConflictingEntities(nodes));
  findings.push(...validateRichResults(nodes, googleRichResultRules));

  return {
    ...extracted,
    nodes,
    findings,
    summary: summarize(extracted.sources, nodes, findings),
  };
}

export function validateRichResults(nodes: SchemaNode[], rules: RichResultRule[]): Finding[] {
  const findings: Finding[] = [];

  for (const node of nodes) {
    for (const rule of rules) {
      if (!node.types.some((type) => rule.schemaTypes.includes(type))) {
        continue;
      }

      findings.push({
        id: `${node.id}:${rule.id}:recognized`,
        severity: "info",
        title: `${rule.name} candidate detected`,
        message: `${node.types.join(", ")} can be evaluated against Google's ${rule.name} structured data guidance.`,
        hint: "Review errors and warnings for fields that can affect rich result eligibility.",
        sourceId: node.sourceId,
        nodeId: node.id,
        format: node.format,
        ruleId: rule.id,
      });

      for (const field of rule.required) {
        const values = readNonEmptyPathValues(node, nodes, field.path);
        if (values.length === 0) {
          findings.push(fieldFinding("error", node, rule, field.path, `Missing required ${field.path}`, field.hint));
        } else {
          findings.push(...validateFieldShape(node, rule, field, values));
        }
      }

      for (const field of rule.recommended) {
        const values = readNonEmptyPathValues(node, nodes, field.path);
        if (values.length === 0) {
          findings.push(fieldFinding("warning", node, rule, field.path, `Missing recommended ${field.path}`, field.hint));
        } else {
          findings.push(...validateFieldShape(node, rule, field, values));
        }
      }
    }
  }

  return findings;
}

function validateFieldShape(node: SchemaNode, rule: RichResultRule, field: RuleField, values: unknown[]): Finding[] {
  if (field.valueShape === undefined || field.valueShape === "non-empty") {
    return [];
  }
  const invalid = values.find((value) => !matchesValueShape(value, field.valueShape!));
  if (invalid === undefined) {
    return [];
  }
  return [
    {
      id: `${node.id}:${rule.id}:shape:${field.path}`,
      severity: "warning",
      title: `Unexpected ${field.path} value shape`,
      message: `${rule.name} ${field.path} is present but does not look like ${describeShape(field.valueShape)}.`,
      hint: `Review ${field.path}; Google rich result guidance expects a ${describeShape(field.valueShape)} value here.`,
      sourceId: node.sourceId,
      nodeId: node.id,
      format: node.format,
      ruleId: rule.id,
      property: field.path,
    },
  ];
}

function fieldFinding(
  severity: FindingSeverity,
  node: SchemaNode,
  rule: RichResultRule,
  property: string,
  title: string,
  hint: string,
): Finding {
  return {
    id: `${node.id}:${rule.id}:${severity}:${property}`,
    severity,
    title,
    message: `${rule.name} structured data is missing ${property}.`,
    hint,
    sourceId: node.sourceId,
    nodeId: node.id,
    format: node.format,
    ruleId: rule.id,
    property,
  };
}

function findDuplicateAndConflictingEntities(nodes: SchemaNode[]): Finding[] {
  const findings: Finding[] = [];
  const byIdentifier = new Map<string, SchemaNode[]>();
  const byTypeAndName = new Map<string, SchemaNode[]>();

  for (const node of nodes) {
    if (node.nodeId !== undefined && node.nodeId.trim() !== "") {
      append(byIdentifier, node.nodeId, node);
    }
    const name = stringValue(node.properties["name"] ?? node.properties["headline"]);
    if (name !== undefined && node.types.length > 0) {
      append(byTypeAndName, `${node.types.join("+")}::${name.toLowerCase()}`, node);
    }
  }

  for (const [identifier, matches] of byIdentifier) {
    if (matches.length > 1) {
      findings.push(duplicateFinding(matches[0]!, `Duplicate @id/itemid/resource`, `Multiple structured data entities use ${identifier}.`, "Confirm repeated identifiers describe the same entity and do not conflict."));
      findings.push(...findConflictsForIdentifier(identifier, matches));
    }
  }

  for (const matches of byTypeAndName.values()) {
    const sourceIds = new Set(matches.map((node) => node.sourceId));
    if (matches.length > 1 && sourceIds.size > 1) {
      findings.push(duplicateFinding(matches[0]!, "Potential duplicate entity", "Multiple source blocks describe the same type and name.", "Check whether these entities should be consolidated or clarified."));
    }
  }

  return findings;
}

function findConflictsForIdentifier(identifier: string, matches: SchemaNode[]): Finding[] {
  const findings: Finding[] = [];
  const propertyNames = new Set(matches.flatMap((node) => Object.keys(node.properties)));
  for (const property of propertyNames) {
    const values = new Set<string>();
    for (const node of matches) {
      const value = node.properties[property];
      if (value !== undefined && isComparableValue(value)) {
        values.add(stableString(value));
      }
    }
    if (values.size > 1) {
      const node = matches[0]!;
      findings.push({
        id: `${node.id}:conflict:${property}`,
        severity: "warning",
        title: `Conflicting ${property} values`,
        message: `Entities with ${identifier} define different ${property} values.`,
        hint: "Keep repeated identifiers consistent or use distinct identifiers for distinct entities.",
        sourceId: node.sourceId,
        nodeId: node.id,
        format: node.format,
        property,
      });
    }
  }
  return findings;
}

function duplicateFinding(node: SchemaNode, title: string, message: string, hint: string): Finding {
  return {
    id: `${node.id}:duplicate:${title}`,
    severity: "warning",
    title,
    message,
    hint,
    sourceId: node.sourceId,
    nodeId: node.id,
    format: node.format,
  };
}

function summarize(sources: ExtractedPageData["sources"], nodes: SchemaNode[], findings: Finding[]): AnalysisSummary {
  const formatCounts: Record<StructuredDataFormat, number> = { "json-ld": 0, microdata: 0, rdfa: 0 };
  const typeCounts: Record<string, number> = {};
  const findingCounts: Record<FindingSeverity, number> = { error: 0, warning: 0, info: 0 };

  for (const source of sources) {
    formatCounts[source.format] += 1;
  }
  for (const node of nodes) {
    for (const type of node.types) {
      typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    }
  }
  for (const finding of findings) {
    findingCounts[finding.severity] += 1;
  }

  return {
    sourceCount: sources.length,
    nodeCount: nodes.length,
    formatCounts,
    typeCounts,
    findingCounts,
  };
}

function readNonEmptyPathValues(node: SchemaNode, allNodes: SchemaNode[], path: string): unknown[] {
  const values = readPathValues(node.properties, path.split("."), allNodes, new Set([node.id]));
  return values.filter((value) => value !== undefined && value !== null && !(typeof value === "string" && value.trim() === ""));
}

function readPathValues(value: unknown, parts: string[], allNodes: SchemaNode[], seen: Set<string>): unknown[] {
  if (parts.length === 0) {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => readPathValues(entry, parts, allNodes, seen));
  }
  if (typeof value === "string") {
    const linked = allNodes.find((node) => (node.nodeId ?? node.id) === value || node.id === value);
    if (linked !== undefined && !seen.has(linked.id)) {
      const nextSeen = new Set(seen);
      nextSeen.add(linked.id);
      return readPathValues(linked.properties, parts, allNodes, nextSeen);
    }
    return [];
  }
  if (!isRecord(value)) {
    return [];
  }
  const [head, ...tail] = parts;
  if (head === undefined || !(head in value)) {
    return [];
  }
  return readPathValues(value[head], tail, allNodes, seen);
}

function append(map: Map<string, SchemaNode[]>, key: string, node: SchemaNode): void {
  const existing = map.get(key) ?? [];
  existing.push(node);
  map.set(key, existing);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (Array.isArray(value)) {
    return stringValue(value[0]);
  }
  return undefined;
}

function matchesValueShape(value: unknown, shape: RuleValueShape): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => matchesValueShape(entry, shape));
  }
  if (shape === "url-or-object" && isRecord(value)) {
    return true;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return false;
  }
  const text = String(value).trim();
  if (text === "") return false;
  if (shape === "date") return !Number.isNaN(Date.parse(text));
  if (shape === "number") return Number.isFinite(Number(text));
  if (shape === "rating") return Number.isFinite(Number(text)) && Number(text) >= 0;
  if (shape === "url") return isLikelyUrl(text);
  if (shape === "url-or-object") return isLikelyUrl(text);
  return true;
}

function describeShape(shape: RuleValueShape): string {
  if (shape === "url-or-object") return "URL or structured object";
  if (shape === "non-empty") return "non-empty";
  return shape;
}

function isLikelyUrl(value: string): boolean {
  if (value.startsWith("#") || value.startsWith("/")) {
    return true;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isComparableValue(value: unknown): boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isComparableValue);
  }
  return false;
}

function stableString(value: unknown): string {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
