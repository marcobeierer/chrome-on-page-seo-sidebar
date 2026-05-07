import test from "node:test";
import assert from "node:assert/strict";
import { analyzeExtractedData, parseJsonLdSource } from "../../dist/test-api.mjs";

test("invalid JSON-LD creates a visible parser error", () => {
  const result = parseJsonLdSource({
    id: "json-ld-1",
    format: "json-ld",
    label: "JSON-LD script 1",
    raw: '{ "@type": "Product", }',
  });

  assert.equal(result.nodes.length, 0);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].severity, "error");
  assert.match(result.findings[0].hint, /JSON-LD|trailing|syntax/i);
});

test("JSON-LD product is parsed and validated with Google rule findings", () => {
  const result = analyzeExtractedData({
    url: "https://example.com/product",
    title: "Product",
    analyzedAt: "2026-05-07T00:00:00.000Z",
    sources: [
      {
        id: "json-ld-1",
        format: "json-ld",
        label: "JSON-LD script 1",
        raw: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          "@id": "https://example.com/product#product",
          name: "Test Product",
          image: "https://example.com/image.jpg",
        }),
      },
    ],
    nodes: [],
  });

  assert.equal(result.summary.nodeCount, 1);
  assert.equal(result.summary.typeCounts.Product, 1);
  assert.equal(result.findings.some((finding) => finding.ruleId === "product" && finding.severity === "info"), true);
  assert.equal(result.findings.some((finding) => finding.property === "offers.price" && finding.severity === "warning"), true);
});

test("duplicate identifiers produce warnings", () => {
  const result = analyzeExtractedData({
    url: "https://example.com",
    title: "Duplicate",
    analyzedAt: "2026-05-07T00:00:00.000Z",
    sources: [
      {
        id: "json-ld-1",
        format: "json-ld",
        label: "JSON-LD script 1",
        raw: JSON.stringify([
          { "@type": "Organization", "@id": "https://example.com/#org", name: "Example", url: "https://example.com" },
          { "@type": "Organization", "@id": "https://example.com/#org", name: "Example", url: "https://example.com" },
        ]),
      },
    ],
    nodes: [],
  });

  assert.equal(result.findings.some((finding) => finding.title.includes("Duplicate")), true);
});

test("conflicting repeated identifiers produce property warnings", () => {
  const result = analyzeExtractedData({
    url: "https://example.com",
    title: "Conflict",
    analyzedAt: "2026-05-07T00:00:00.000Z",
    sources: [
      {
        id: "json-ld-1",
        format: "json-ld",
        label: "JSON-LD script 1",
        raw: JSON.stringify([
          { "@type": "Organization", "@id": "https://example.com/#org", name: "Example A", url: "https://example.com" },
          { "@type": "Organization", "@id": "https://example.com/#org", name: "Example B", url: "https://example.com" },
        ]),
      },
    ],
    nodes: [],
  });

  assert.equal(result.findings.some((finding) => finding.title === "Conflicting name values"), true);
});

test("present fields with unexpected value shapes produce warnings", () => {
  const result = analyzeExtractedData({
    url: "https://example.com/product",
    title: "Product",
    analyzedAt: "2026-05-07T00:00:00.000Z",
    sources: [
      {
        id: "json-ld-1",
        format: "json-ld",
        label: "JSON-LD script 1",
        raw: JSON.stringify({
          "@type": "Product",
          name: "Test Product",
          image: "not a url",
          offers: { "@type": "Offer", price: "free", priceCurrency: "USD" },
        }),
      },
    ],
    nodes: [],
  });

  assert.equal(result.findings.some((finding) => finding.title === "Unexpected image value shape"), true);
  assert.equal(result.findings.some((finding) => finding.title === "Unexpected offers.price value shape"), true);
});
