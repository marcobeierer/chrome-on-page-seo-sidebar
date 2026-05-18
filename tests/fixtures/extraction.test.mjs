import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { analyzeExtractedData, inspectedPageAnalysis } from "../../dist/test-api.mjs";

test("extracts page metadata from real HTML", () => {
  withDocument(`<!doctype html>
    <html>
      <head>
        <title>Example page</title>
        <meta name="description" content="A useful page description.">
        <link rel="canonical" href="https://example.com/page">
        <link rel="alternate" hreflang="en" href="https://example.com/en/page">
        <link rel="alternate" hreflang="de" href="https://example.com/de/page">
      </head>
      <body></body>
    </html>`);

  const extracted = inspectedPageAnalysis();

  assert.equal(extracted.page.title.value, "Example page");
  assert.equal(extracted.page.metaDescription?.value, "A useful page description.");
  assert.equal(extracted.page.canonical?.href, "https://example.com/page");
  assert.deepEqual(extracted.page.hreflang.map((link) => link.hreflang), ["en", "de"]);
});

test("extracts and analyzes JSON-LD from real HTML", () => {
  withDocument(`<!doctype html>
    <html>
      <head><title>Product</title></head>
      <body>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"Product","name":"Desk","image":"https://example.com/desk.jpg"}
        </script>
      </body>
    </html>`);

  const result = analyzeExtractedData(inspectedPageAnalysis());

  assert.equal(result.sources[0]?.format, "json-ld");
  assert.equal(result.nodes.some((node) => node.types.includes("Product")), true);
});

test("JSON-LD source selector points to the extracted script", () => {
  withDocument(`<!doctype html>
    <html>
      <head><title>Product</title></head>
      <body>
        <script>window.example = true;</script>
        <script type="application/ld+json">{"@type":"Product","name":"Desk"}</script>
      </body>
    </html>`);

  const extracted = inspectedPageAnalysis();
  const source = extracted.sources[0];

  assert.equal(source?.format, "json-ld");
  assert.equal(document.querySelector(source.selector)?.textContent, source.raw);
});

test("extracts nested Microdata ownership from real HTML", () => {
  withDocument(`<!doctype html>
    <html>
      <head><title>Article</title></head>
      <body>
        <article itemscope itemtype="https://schema.org/Article">
          <h1 itemprop="headline">Microdata headline</h1>
          <span itemprop="author" itemscope itemtype="https://schema.org/Person">
            <span itemprop="name">Ada</span>
          </span>
        </article>
      </body>
    </html>`);

  const extracted = inspectedPageAnalysis();
  const article = extracted.nodes.find((node) => node.types.includes("Article"));
  const person = extracted.nodes.find((node) => node.types.includes("Person"));

  assert.equal(extracted.sources.filter((source) => source.format === "microdata").length, 2);
  assert.equal(article?.properties["headline"], "Microdata headline");
  assert.equal(person?.properties["name"], "Ada");
  assert.equal(article?.links.some((link) => link.property === "author" && link.target === person?.id), true);
});

test("extracts RDFa properties and links from real HTML", () => {
  withDocument(`<!doctype html>
    <html>
      <head><title>Organization</title></head>
      <body>
        <div typeof="Organization" resource="https://example.com/#org">
          <span property="name">Example Org</span>
          <a property="url" href="https://example.com/">Website</a>
        </div>
      </body>
    </html>`);

  const extracted = inspectedPageAnalysis();
  const org = extracted.nodes.find((node) => node.types.includes("Organization"));

  assert.equal(extracted.sources[0]?.format, "rdfa");
  assert.equal(org?.nodeId, "https://example.com/#org");
  assert.equal(org?.properties["name"], "Example Org");
  assert.equal(org?.properties["url"], "https://example.com/");
});

function withDocument(html) {
  const { window } = parseHTML(html);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href: "https://example.com/current" },
  });
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLScriptElement = window.HTMLScriptElement;
  globalThis.HTMLMetaElement = window.HTMLMetaElement;
  globalThis.HTMLLinkElement = window.HTMLLinkElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
}
