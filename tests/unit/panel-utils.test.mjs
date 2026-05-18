import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import {
  buildSearchIndex,
  childGroups,
  copyControl,
  createTreeIndex,
  getFindingSearchText,
  getNodeSearchText,
  getSourceSearchText,
  sourceCodeBlock,
  sourceDisplayText,
  treeMatchesQuery,
  treeRoots,
} from "../../dist/test-api.mjs";

test("tree model resolves roots, linked children, duplicate links, and cycles", () => {
  const parent = schemaNode({ id: "parent", types: ["Product"], links: [{ property: "offers", target: "https://example.com/#offer" }] });
  const child = schemaNode({ id: "child", nodeId: "https://example.com/#offer", types: ["Offer"], links: [{ property: "itemOffered", target: "parent" }] });
  const sibling = schemaNode({ id: "sibling", types: ["AggregateRating"], links: [] });
  parent.links.push({ property: "offers", target: "child" });

  const index = createTreeIndex([parent, child, sibling]);

  assert.deepEqual(treeRoots(index).map((node) => node.id), ["sibling"]);
  assert.deepEqual(childGroups(parent, index, new Set(), () => true), [{ property: "offers", nodes: [child] }]);
  assert.deepEqual(childGroups(parent, index, new Set(["child"]), () => true), []);
  assert.equal(treeMatchesQuery(parent, index, (node) => node.types.includes("Offer")), true);
  assert.equal(treeMatchesQuery(parent, index, (node) => node.types.includes("Review")), false);
});

test("search index includes findings, nodes, and source text", () => {
  const finding = {
    id: "finding-1",
    severity: "warning",
    title: "Missing recommended image",
    message: "Product image is missing.",
    hint: "Add an image URL.",
    sourceId: "json-ld-1",
    format: "json-ld",
    ruleId: "product",
    property: "image",
  };
  const node = schemaNode({ id: "product", types: ["Product"], properties: { name: "Desk" } });
  const source = { id: "json-ld-1", format: "json-ld", label: "JSON-LD script 1", raw: '{"name":"Desk"}', selector: "script:nth-of-type(1)" };
  const index = buildSearchIndex({ findings: [finding], nodes: [node], sources: [source] });

  assert.match(getFindingSearchText(index, finding), /Missing recommended image/);
  assert.match(getNodeSearchText(index, node), /Desk/);
  assert.match(getSourceSearchText(index, source), /JSON-LD script 1/);
});

test("source formatting prettifies JSON-LD and HTML snippets", () => {
  installDom();

  const jsonSource = { id: "json-ld-1", format: "json-ld", label: "JSON-LD", raw: '{"@type":"Product","name":"Desk"}' };
  const invalidJsonSource = { id: "json-ld-2", format: "json-ld", label: "JSON-LD", raw: '{"@type":"Product",}' };
  const microdataSource = { id: "microdata-1", format: "microdata", label: "Microdata", raw: '<article itemscope itemtype="https://schema.org/Article"><h1 itemprop="headline">Hello</h1></article>' };

  assert.match(sourceDisplayText(jsonSource), /\n  "name": "Desk"/);
  assert.equal(sourceDisplayText(invalidJsonSource), invalidJsonSource.raw);
  assert.match(sourceDisplayText(microdataSource), /\n  <h1 itemprop="headline">Hello<\/h1>/);
  assert.equal(sourceCodeBlock(jsonSource).querySelectorAll(".json-key").length > 0, true);
});

test("copy control writes to clipboard and reports status", () => {
  const { window } = installDom();
  const copied = [];
  const statuses = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async (value) => copied.push(value) } },
  });

  const control = copyControl({ name: "Source", value: "schema text", status: (message, isError) => statuses.push({ message, isError }) });
  const button = control.querySelector("button");

  button.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));

  return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
    assert.deepEqual(copied, ["schema text"]);
    assert.deepEqual(statuses, [{ message: "Copied source to clipboard.", isError: undefined }]);
  });
});

function schemaNode(overrides) {
  return {
    id: "node",
    sourceId: "source-1",
    format: "json-ld",
    types: [],
    properties: {},
    links: [],
    ...overrides,
  };
}

function installDom() {
  const { window } = parseHTML("<!doctype html><html><body></body></html>");
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.DOMParser = window.DOMParser;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  return { window };
}
