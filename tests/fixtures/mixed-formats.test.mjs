import test from "node:test";
import assert from "node:assert/strict";
import { analyzeExtractedData } from "../../dist/test-api.mjs";

test("mixed Microdata and RDFa nodes are first-class analysis inputs", () => {
  const result = analyzeExtractedData({
    url: "http://localhost:3000",
    title: "Mixed formats",
    analyzedAt: "2026-05-07T00:00:00.000Z",
    sources: [
      {
        id: "microdata-1",
        format: "microdata",
        label: "Microdata item 1",
        raw: '<article itemscope itemtype="https://schema.org/Article"><h1 itemprop="headline">Hello</h1></article>',
      },
      {
        id: "rdfa-1",
        format: "rdfa",
        label: "RDFa entity 1",
        raw: '<div typeof="Organization"><span property="name">Example</span></div>',
      },
    ],
    nodes: [
      {
        id: "microdata-1:item",
        sourceId: "microdata-1",
        format: "microdata",
        types: ["Article"],
        properties: { headline: "Hello" },
        links: [],
      },
      {
        id: "rdfa-1:entity",
        sourceId: "rdfa-1",
        format: "rdfa",
        types: ["Organization"],
        properties: { name: "Example", url: "https://example.com" },
        links: [],
      },
    ],
  });

  assert.equal(result.summary.formatCounts.microdata, 1);
  assert.equal(result.summary.formatCounts.rdfa, 1);
  assert.equal(result.summary.typeCounts.Article, 1);
  assert.equal(result.summary.typeCounts.Organization, 1);
  assert.equal(result.findings.some((finding) => finding.format === "microdata" && finding.ruleId === "article"), true);
  assert.equal(result.findings.some((finding) => finding.format === "rdfa" && finding.ruleId === "organization"), true);
});
