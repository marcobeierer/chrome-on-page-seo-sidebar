export type StructuredDataFormat = "json-ld" | "microdata" | "rdfa";

export type FindingSeverity = "error" | "warning" | "info";

export interface SourceBlock {
  id: string;
  format: StructuredDataFormat;
  label: string;
  raw: string;
  selector?: string;
  valid?: boolean;
  error?: string;
}

export interface SchemaNode {
  id: string;
  sourceId: string;
  format: StructuredDataFormat;
  types: string[];
  nodeId?: string;
  properties: Record<string, unknown>;
  links: SchemaLink[];
}

export interface SchemaLink {
  property: string;
  target: string;
}

export interface ExtractedPageData {
  url: string;
  title: string;
  analyzedAt: string;
  sources: SourceBlock[];
  nodes: SchemaNode[];
}

export interface AnalysisResult extends ExtractedPageData {
  findings: Finding[];
  summary: AnalysisSummary;
}

export interface AnalysisSummary {
  sourceCount: number;
  nodeCount: number;
  formatCounts: Record<StructuredDataFormat, number>;
  typeCounts: Record<string, number>;
  findingCounts: Record<FindingSeverity, number>;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  title: string;
  message: string;
  hint: string;
  sourceId?: string;
  nodeId?: string;
  format?: StructuredDataFormat;
  ruleId?: string;
  property?: string;
}

export interface RichResultRule {
  id: string;
  name: string;
  schemaTypes: string[];
  sourceUrl: string;
  required: RuleField[];
  recommended: RuleField[];
}

export interface RuleField {
  path: string;
  hint: string;
  valueShape?: RuleValueShape;
}

export type RuleValueShape = "date" | "number" | "rating" | "url" | "url-or-object" | "non-empty";
