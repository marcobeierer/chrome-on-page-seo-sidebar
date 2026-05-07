import type { Finding, SchemaLink, SchemaNode, SourceBlock } from "./types";

interface JsonLdParseResult {
  nodes: SchemaNode[];
  findings: Finding[];
}

export function parseJsonLdSource(source: SourceBlock): JsonLdParseResult {
  try {
    const parsed = JSON.parse(source.raw) as unknown;
    const nodes = normalizeJsonLd(parsed, source.id);
    return { nodes, findings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      nodes: [],
      findings: [
        {
          id: `${source.id}:json-parse`,
          severity: "error",
          title: "Invalid JSON-LD",
          message,
          hint: friendlyJsonError(message),
          sourceId: source.id,
          format: "json-ld",
        },
      ],
    };
  }
}

export function normalizeJsonLd(value: unknown, sourceId: string): SchemaNode[] {
  const nodes: SchemaNode[] = [];
  const roots = unwrapJsonLdRoots(value);
  roots.forEach((root, index) => visitJsonLdObject(root, sourceId, `jsonld-${index + 1}`, nodes));
  return nodes;
}

function unwrapJsonLdRoots(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(unwrapJsonLdRoots);
  }
  if (!isRecord(value)) {
    return [];
  }
  const graph = value["@graph"];
  const graphRoots = Array.isArray(graph) ? graph.filter(isRecord) : [];
  const hasOwnEntity = value["@type"] !== undefined || value["@id"] !== undefined;
  if (graphRoots.length > 0 && !hasOwnEntity) {
    return graphRoots;
  }
  if (graphRoots.length > 0) {
    const { ["@graph"]: _graph, ...rest } = value;
    return [rest, ...graphRoots];
  }
  return [value];
}

function visitJsonLdObject(
  object: Record<string, unknown>,
  sourceId: string,
  fallbackId: string,
  nodes: SchemaNode[],
): string | undefined {
  const types = readTypes(object["@type"]);
  const nodeId = typeof object["@id"] === "string" ? object["@id"] : undefined;
  const isEntity = types.length > 0 || nodeId !== undefined;
  const currentId = nodeId ?? `${sourceId}:${fallbackId}`;
  const links: SchemaLink[] = [];
  const properties: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(object)) {
    if (key.startsWith("@")) {
      continue;
    }
    properties[key] = normalizeJsonLdValue(rawValue, sourceId, `${fallbackId}.${key}`, nodes, links, key);
  }

  if (isEntity) {
    nodes.push({
      id: currentId,
      sourceId,
      format: "json-ld",
      types,
      ...(nodeId !== undefined ? { nodeId } : {}),
      properties,
      links,
    });
  }

  return isEntity ? currentId : undefined;
}

function normalizeJsonLdValue(
  value: unknown,
  sourceId: string,
  fallbackId: string,
  nodes: SchemaNode[],
  links: SchemaLink[],
  property: string,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeJsonLdValue(entry, sourceId, `${fallbackId}[${index}]`, nodes, links, property));
  }
  if (!isRecord(value)) {
    return value;
  }
  if (typeof value["@id"] === "string" && Object.keys(value).length === 1) {
    links.push({ property, target: value["@id"] });
    return value["@id"];
  }
  const nestedId = visitJsonLdObject(value, sourceId, fallbackId, nodes);
  if (nestedId !== undefined) {
    links.push({ property, target: nestedId });
    return nestedId;
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    normalized[key] = normalizeJsonLdValue(entry, sourceId, `${fallbackId}.${key}`, nodes, links, key);
  }
  return normalized;
}

function readTypes(value: unknown): string[] {
  if (typeof value === "string") {
    return [compactType(value)];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").map(compactType);
  }
  return [];
}

function compactType(type: string): string {
  const hashIndex = type.lastIndexOf("#");
  const slashIndex = type.lastIndexOf("/");
  const index = Math.max(hashIndex, slashIndex);
  return index >= 0 ? type.slice(index + 1) : type;
}

function friendlyJsonError(message: string): string {
  if (/unexpected token/i.test(message)) {
    return "Check for trailing commas, comments, unquoted keys, or text outside the JSON object.";
  }
  if (/unexpected end/i.test(message)) {
    return "The JSON-LD block appears incomplete. Check closing braces, brackets, and quotes.";
  }
  return "Validate the JSON-LD syntax and ensure the script contains valid JSON.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
