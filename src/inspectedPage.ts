import type { ExtractedPageData, HreflangLink, PageSeoData, PageSeoField, PageSeoLink, SchemaLink, SchemaNode, SourceBlock, StructuredDataFormat } from "./analyzer/types";

export function inspectedPageAnalysis(): ExtractedPageData {
  const sources: SourceBlock[] = [];
  const nodes: SchemaNode[] = [];
  const microdataIds = new Map<HTMLElement, { id: string; sourceId: string }>();
  const rdfaIds = new Map<HTMLElement, { id: string; sourceId: string }>();

  extractJsonLd(sources);
  extractMicrodata(sources, nodes);
  extractRdfa(sources, nodes);

  return {
    url: window.location.href,
    title: document.title,
    analyzedAt: new Date().toISOString(),
    page: extractPageSeoData(),
    sources,
    nodes,
  };

  function extractPageSeoData(): PageSeoData {
    const titleElement = document.querySelector("title");
    const metaDescription = firstMetaByName("description");
    const canonical = firstLinkByRel("canonical");
    const hreflangLinks = linksByRel("alternate")
      .map((link): HreflangLink | undefined => {
        const hreflang = link.getAttribute("hreflang")?.trim();
        const href = link.href || link.getAttribute("href")?.trim() || "";
        if (hreflang === undefined || hreflang === "" || href === "") {
          return undefined;
        }
        return {
          hreflang,
          href,
          value: href,
          selector: selectorFor(link),
        };
      })
      .filter((link): link is HreflangLink => link !== undefined);

    return {
      title: {
        value: (titleElement?.textContent ?? document.title).trim(),
        ...(titleElement !== null ? { selector: selectorFor(titleElement) } : {}),
      },
      ...(metaDescription !== undefined ? { metaDescription } : {}),
      ...(canonical !== undefined ? { canonical } : {}),
      hreflang: hreflangLinks,
    };
  }

  function firstMetaByName(name: string): PageSeoField | undefined {
    const meta = Array.from(document.querySelectorAll<HTMLMetaElement>("meta[name]")).find((entry) => entry.getAttribute("name")?.toLowerCase() === name);
    const value = meta?.getAttribute("content")?.trim();
    if (meta === undefined || value === undefined || value === "") {
      return undefined;
    }
    return { value, selector: selectorFor(meta) };
  }

  function firstLinkByRel(rel: string): PageSeoLink | undefined {
    const link = linksByRel(rel)[0];
    const href = link?.href || link?.getAttribute("href")?.trim() || "";
    if (link === undefined || href === "") {
      return undefined;
    }
    return { href, value: href, selector: selectorFor(link) };
  }

  function linksByRel(rel: string): HTMLLinkElement[] {
    return Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel]")).filter((link) => readTokens(link.getAttribute("rel")?.toLowerCase() ?? "").includes(rel));
  }

  function extractJsonLd(targetSources: SourceBlock[]): void {
    const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"], script[type="application/json+ld"]'));
    scripts.forEach((script, index) => {
      targetSources.push({
        id: `json-ld-${index + 1}`,
        format: "json-ld",
        label: `JSON-LD script ${index + 1}`,
        raw: script.textContent ?? "",
        selector: `script[type="${script.type}"]:nth-of-type(${index + 1})`,
      });
    });
  }

  function extractMicrodata(targetSources: SourceBlock[], targetNodes: SchemaNode[]): void {
    const items = Array.from(document.querySelectorAll<HTMLElement>("[itemscope]"));
    items.forEach((item, index) => {
      const sourceId = `microdata-${index + 1}`;
      const nodeId = item.getAttribute("itemid") ?? undefined;
      microdataIds.set(item, { id: nodeId ?? `${sourceId}:item`, sourceId });
    });
    items.forEach((item, index) => {
      const ids = microdataIds.get(item)!;
      targetSources.push({
        id: ids.sourceId,
        format: "microdata",
        label: `Microdata item ${index + 1}`,
        raw: item.outerHTML,
        selector: selectorFor(item),
      });
      targetNodes.push(readMicrodataItem(item, ids));
    });
  }

  function readMicrodataItem(item: HTMLElement, ids: { id: string; sourceId: string }): SchemaNode {
    const nodeId = item.getAttribute("itemid") ?? undefined;
    const properties: Record<string, unknown> = {};
    const links: SchemaLink[] = [];
    const props = Array.from(item.querySelectorAll<HTMLElement>("[itemprop]"));

    for (const prop of props) {
      if (microdataOwner(prop) !== item) {
        continue;
      }
      const name = prop.getAttribute("itemprop");
      if (name === null || name.trim() === "") {
        continue;
      }
      const value = readMicrodataValue(prop);
      addProperty(properties, name, value);
      if (prop.hasAttribute("itemscope")) {
        const target = microdataIds.get(prop)?.id ?? prop.getAttribute("itemid") ?? valueToString(value);
        links.push({ property: name, target });
      }
    }

    return {
      id: ids.id,
      sourceId: ids.sourceId,
      format: "microdata",
      types: readTokens(item.getAttribute("itemtype")).map(compactType),
      ...(nodeId !== undefined ? { nodeId } : {}),
      properties,
      links,
    };
  }

  function microdataOwner(prop: HTMLElement): HTMLElement | null {
    let current: Element | null = prop;
    if (prop.hasAttribute("itemscope")) {
      current = prop.parentElement;
    }
    while (current !== null) {
      if (current instanceof HTMLElement && current.hasAttribute("itemscope")) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function readMicrodataValue(prop: HTMLElement): unknown {
    if (prop.hasAttribute("itemscope")) {
      const itemId = prop.getAttribute("itemid");
      if (itemId !== null && itemId !== "") {
        return itemId;
      }
      const ids = microdataIds.get(prop);
      if (ids !== undefined) {
        return ids.id;
      }
      const itemTypes = readTokens(prop.getAttribute("itemtype")).map(compactType).join(", ");
      return itemTypes || prop.textContent?.trim() || "";
    }
    const tag = prop.tagName.toLowerCase();
    if (tag === "meta") return prop.getAttribute("content") ?? "";
    if (["audio", "embed", "iframe", "img", "source", "track", "video"].includes(tag)) return prop.getAttribute("src") ?? "";
    if (["a", "area", "link"].includes(tag)) return prop.getAttribute("href") ?? "";
    if (["data", "meter"].includes(tag)) return prop.getAttribute("value") ?? "";
    if (tag === "time") return prop.getAttribute("datetime") ?? prop.textContent?.trim() ?? "";
    return prop.textContent?.trim() ?? "";
  }

  function extractRdfa(targetSources: SourceBlock[], targetNodes: SchemaNode[]): void {
    const typed = Array.from(document.querySelectorAll<HTMLElement>("[typeof]"));
    typed.forEach((item, index) => {
      const sourceId = `rdfa-${index + 1}`;
      const nodeId = readRdfaIdentifier(item);
      rdfaIds.set(item, { id: nodeId ?? `${sourceId}:entity`, sourceId });
    });
    typed.forEach((item, index) => {
      const ids = rdfaIds.get(item)!;
      targetSources.push({
        id: ids.sourceId,
        format: "rdfa",
        label: `RDFa entity ${index + 1}`,
        raw: item.outerHTML,
        selector: selectorFor(item),
      });
      targetNodes.push(readRdfaItem(item, ids));
    });
  }

  function readRdfaItem(item: HTMLElement, ids: { id: string; sourceId: string }): SchemaNode {
    const nodeId = readRdfaIdentifier(item);
    const properties: Record<string, unknown> = {};
    const links: SchemaLink[] = [];
    const props = Array.from(item.querySelectorAll<HTMLElement>("[property]"));

    for (const prop of props) {
      if (rdfaOwner(prop) !== item) {
        continue;
      }
      const names = readTokens(prop.getAttribute("property")).map(compactType);
      for (const name of names) {
        const value = readRdfaValue(prop);
        addProperty(properties, name, value);
        const target = rdfaIds.get(prop)?.id ?? prop.getAttribute("resource") ?? prop.getAttribute("href") ?? undefined;
        if (target !== undefined) {
          links.push({ property: name, target });
        }
      }
    }

    return {
      id: ids.id,
      sourceId: ids.sourceId,
      format: "rdfa",
      types: readTokens(item.getAttribute("typeof")).map(compactType),
      ...(nodeId !== undefined ? { nodeId } : {}),
      properties,
      links,
    };
  }

  function rdfaOwner(prop: HTMLElement): HTMLElement | null {
    let current: Element | null = prop.parentElement;
    while (current !== null) {
      if (current instanceof HTMLElement && current.hasAttribute("typeof")) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function readRdfaValue(prop: HTMLElement): unknown {
    const typedReference = rdfaIds.get(prop);
    if (typedReference !== undefined) return typedReference.id;
    if (prop.hasAttribute("content")) return prop.getAttribute("content") ?? "";
    if (prop.hasAttribute("datetime")) return prop.getAttribute("datetime") ?? "";
    if (prop.hasAttribute("resource")) return prop.getAttribute("resource") ?? "";
    if (prop.hasAttribute("href")) return prop.getAttribute("href") ?? "";
    if (prop.hasAttribute("src")) return prop.getAttribute("src") ?? "";
    return prop.textContent?.trim() ?? "";
  }

  function readRdfaIdentifier(item: HTMLElement): string | undefined {
    return item.getAttribute("resource") ?? item.getAttribute("about") ?? item.getAttribute("href") ?? undefined;
  }

  function addProperty(properties: Record<string, unknown>, name: string, value: unknown): void {
    const existing = properties[name];
    if (existing === undefined) {
      properties[name] = value;
      return;
    }
    if (Array.isArray(existing)) {
      existing.push(value);
      return;
    }
    properties[name] = [existing, value];
  }

  function readTokens(value: string | null): string[] {
    return (value ?? "").split(/\s+/).map((entry) => entry.trim()).filter(Boolean);
  }

  function compactType(type: string): string {
    const hashIndex = type.lastIndexOf("#");
    const slashIndex = type.lastIndexOf("/");
    const index = Math.max(hashIndex, slashIndex);
    return index >= 0 ? type.slice(index + 1) : type;
  }

  function selectorFor(element: Element): string {
    const id = element.getAttribute("id");
    if (id !== null && id !== "") {
      return `#${id}`;
    }
    const type = element.getAttribute("itemtype") ?? element.getAttribute("typeof");
    if (type !== null && type !== "") {
      const attr: string = element.hasAttribute("itemtype") ? "itemtype" : "typeof";
      return `${element.tagName.toLowerCase()}[${attr}="${type}"]`;
    }
    const parts: string[] = [];
    let current: Element | null = element;
    while (current !== null && current !== document.documentElement) {
      const parent: HTMLElement | null = current.parentElement;
      if (parent === null) {
        break;
      }
      const tagName = current.tagName;
      const siblings = Array.from(parent.children).filter((child: Element) => child.tagName === tagName);
      const position = siblings.indexOf(current) + 1;
      parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${position})`);
      current = parent;
    }
    return parts.length > 0 ? parts.join(" > ") : element.tagName.toLowerCase();
  }

  function valueToString(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  }
}
