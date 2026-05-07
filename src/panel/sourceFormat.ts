import type { SourceBlock } from "../analyzer/types";

export function sourceDisplayText(source: SourceBlock): string {
  if (source.format === "json-ld") {
    try {
      return JSON.stringify(JSON.parse(source.raw), null, 2);
    } catch {
      return source.raw;
    }
  }
  if (source.format === "microdata") {
    return formatHtmlSnippet(source.raw);
  }
  return source.raw;
}

export function sourceCodeBlock(source: SourceBlock): HTMLElement {
  const displayText = sourceDisplayText(source);
  if (source.format === "json-ld" && displayText !== source.raw) {
    return codeBlock(displayText, "json", true);
  }
  return codeBlock(displayText, "raw", false);
}

function formatHtmlSnippet(html: string): string {
  const doc = new DOMParser().parseFromString(`<template>${html}</template>`, "text/html");
  const template = doc.querySelector("template");
  if (template === null) {
    return html;
  }
  const formatted = Array.from(template.content.childNodes).map((node) => formatHtmlNode(node, 0)).join("\n");
  return formatted.trim() || html;
}

function formatHtmlNode(node: Node, depth: number): string {
  const indent = "  ".repeat(depth);
  if (node.nodeType === Node.TEXT_NODE) {
    return `${indent}${(node.textContent ?? "").trim()}`.trimEnd();
  }
  if (!(node instanceof Element)) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  const attrs = Array.from(node.attributes).map((attr) => `${attr.name}="${attr.value}"`).join(" ");
  const open = attrs === "" ? `<${tag}>` : `<${tag} ${attrs}>`;
  if (isVoidElement(tag)) {
    return `${indent}${open}`;
  }

  const children = Array.from(node.childNodes).map((child) => formatHtmlNode(child, depth + 1)).filter((line) => line.trim() !== "");
  if (children.length === 0) {
    return `${indent}${open}</${tag}>`;
  }
  if (children.length === 1 && !children[0]!.trimStart().startsWith("<")) {
    return `${indent}${open}${children[0]!.trim()}</${tag}>`;
  }
  return [`${indent}${open}`, ...children, `${indent}</${tag}>`].join("\n");
}

function isVoidElement(tag: string): boolean {
  return ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"].includes(tag);
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
