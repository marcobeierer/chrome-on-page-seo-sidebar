# Chrome Extension On-Page SEO Schema Plan

## Summary

Build a Chrome Manifest V3 side panel extension for in-house SEO users to inspect and validate on-page structured data locally. The first release focuses on daily QA usability and Chrome Web Store approval, with equal-depth parsing for JSON-LD, Microdata, and RDFa, Google rich result checks, and a friendly sidebar UI.

## Context

The workspace currently contains no implementation code. The product will start as a new Vanilla TypeScript Chrome extension built with esbuild. The extension must not collect or transmit page data. Current DOM analysis is primary; original HTML comparison is intentionally deferred for now.

## Goals

- Provide a Chrome side panel for on-page SEO structured data analysis.
- Extract core on-page SEO metadata: title, meta description, canonical, and hreflang.
- Extract JSON-LD, Microdata, and RDFa from the current rendered DOM with equal parser depth.
- Validate detected structured data against bundled Google rich result rules covering all current Google rich result documentation.
- Show findings grouped as errors, warnings, and info.
- Provide a summary dashboard, schema tree explorer, pretty raw JSON/source view, findings list, and search/filter.
- Support public websites, authenticated staging pages, SPAs through automatic URL-change analysis plus manual refresh, and localhost.
- Keep analysis session-only and local-only.
- Prepare the first release for Chrome Web Store approval with explicit side panel permissions.

## Non-Goals

- Exporting reports as Markdown, JSON, PDF, or files.
- Server-side analysis, telemetry, remote AI explanations, or remote rule fetching.
- Historical result storage per URL.
- Browser support beyond Chrome.
- Automatic live re-scanning after DOM changes.
- Original HTML comparison in the first milestone.
- Page overlays, toolbar popup UX, or a DevTools panel UX.

## Scope

- Chrome extension files: `manifest.json`, background service worker, side panel HTML, panel scripts, page analysis scripts, icons, and store-facing metadata.
- TypeScript modules for extraction, normalization, validation, findings, and UI rendering.
- Bundled local rule data for Google rich result validation.
- Fixture-based parser and validator test data covering valid, malformed, nested, duplicate, and mixed-format structured data.
- E2E checks for loading the extension, opening the side panel, analyzing a page, filtering results, and refreshing analysis manually.

## Assumptions

- The first implementation can use plain HTML/CSS and Vanilla TypeScript without React, Svelte, or another UI framework.
- esbuild is acceptable as the only bundler.
- Chrome side panel, scripting, tabs, and host permissions required for active-tab analysis are acceptable.
- Original HTML fetching is out of scope until a later milestone, even though the long-term product may compare original HTML and rendered DOM.
- Inline help should be light and contextual, not a full onboarding flow.
- The product name and branding can be decided during implementation or just before store packaging.

## Decisions

- Use Chrome's side panel because the target workflow should be accessible beside normal browsing, similar to native browser sidebars.
- Keep all analysis local to simplify privacy, reduce store review risk, and support authenticated staging pages without transmitting sensitive page content.
- Analyze the current DOM as the source of truth for the first release because modern pages often inject schema after load and original response capture increases permission and implementation complexity.
- Use manual refresh instead of MutationObserver-based live updates to keep output deterministic and reduce UI churn.
- Bundle Google rich result rules with the extension so validation is reproducible and does not require network access.
- Use errors, warnings, and info because this maps cleanly to technical validation while remaining understandable for SEO QA.
- Prefer a SEO-friendly UI, with technical detail available in tree and raw views.

## Implementation Plan

### Phase 1: Project Scaffold

- Create a Manifest V3 extension scaffold with TypeScript, esbuild, static HTML/CSS, and npm scripts.
- Add side panel registration, toolbar action behavior, and a panel shell that can run inside Chrome's side panel.
- Add local-only privacy-safe defaults and no telemetry code paths.

### Phase 2: DOM Extraction

- Implement a side-panel-to-active-tab analysis bridge using `chrome.scripting.executeScript`.
- Extract JSON-LD blocks from `script[type="application/ld+json"]` with source index metadata.
- Extract Microdata entities from `itemscope`, `itemtype`, and `itemprop` markup.
- Extract RDFa entities from common RDFa attributes such as `vocab`, `typeof`, `property`, `resource`, `about`, and `content`.
- Return a normalized analysis payload plus raw source data for UI display.

### Phase 3: Parsing And Normalization

- Parse valid JSON-LD into graph nodes, including arrays, `@graph`, nested objects, and `@id` references.
- Report malformed JSON-LD with both raw parser errors and friendly short explanations.
- Normalize Microdata and RDFa into the same internal node model used by JSON-LD.
- Resolve graph links for `@id` and equivalent extracted identifiers where practical.
- Detect duplicate entities or repeated identifiers and emit warnings without silently merging source blocks.

### Phase 4: Google Rich Result Rules

- Build a local rule model for Google rich result types, required fields, recommended fields, accepted value shapes, and short hints.
- Encode all current Google rich result documentation into bundled rule files.
- Validate only detected page data, but support every rule type in the bundled rule catalog.
- Keep schema.org-wide validation limited to what is needed for Google rich result findings in this milestone.

### Phase 5: Findings And Search

- Convert parser, normalization, duplicate, and rule results into findings with severity, type, message, hint, source, and related node references.
- Add search/filter across schema type, property, severity, source format, and text.
- Ensure findings remain stable after manual refresh unless page data changes.

### Phase 6: Side Panel UI

- Build a SEO-friendly summary dashboard with counts for formats, types, nodes, and findings.
- Build a tree explorer for normalized schema nodes and graph links.
- Build a pretty raw view for JSON-LD and equivalent formatted source representations for Microdata/RDFa.
- Build a findings list with short actionable hints and source references.
- Add compact inline help for terms and empty states.

### Phase 7: Testing And Release Preparation

- Add unit tests for parsers, graph normalization, duplicate detection, and validators.
- Add fixture tests using saved HTML examples for public pages, staging-like markup, SPAs, localhost-like pages, malformed JSON-LD, nested graphs, Microdata, RDFa, and mixed-format pages.
- Add practical E2E tests for extension loading and core side panel workflows.
- Prepare Chrome Web Store assets, icons, minimal permission justification, and privacy disclosures stating no data is collected or transmitted.

## Implementation Checklist

- [ ] Initialize npm project with TypeScript, esbuild, lint/test tooling, and build scripts.
- [ ] Add Manifest V3 extension structure and side panel registration.
- [ ] Implement active-tab side panel analysis bridge with explicit sidebar permissions.
- [ ] Implement JSON-LD extraction with source metadata.
- [ ] Implement Microdata extraction and normalization.
- [ ] Implement RDFa extraction and normalization.
- [ ] Implement JSON-LD parser error reporting with raw and friendly messages.
- [ ] Implement normalized schema node model and graph link resolution.
- [ ] Implement duplicate/conflict detection warnings.
- [ ] Create bundled Google rich result rule catalog covering all current rich result docs.
- [ ] Implement validator engine and severity mapping.
- [ ] Build summary dashboard.
- [ ] Build schema tree explorer.
- [ ] Build pretty raw/source view.
- [ ] Build findings list with short hints.
- [ ] Build search and filter controls.
- [ ] Add unit tests for extraction, normalization, validation, and findings.
- [ ] Add fixture tests for representative HTML/schema examples.
- [ ] Add E2E tests for unpacked extension workflows.
- [ ] Add store-ready icons, metadata drafts, permission justification, and privacy statement.

## Acceptance Criteria

- The extension can be loaded unpacked in latest stable Chrome.
- Clicking the extension toolbar action opens a dedicated on-page SEO/schema analytics side panel.
- Opening the side panel analyzes the active tab's current DOM automatically.
- Clicking manual refresh analyzes the active tab's current DOM.
- JSON-LD, Microdata, and RDFa are detected and shown with equal first-class treatment.
- Malformed JSON-LD appears as an error with the raw parser failure and a friendly explanation.
- The UI shows summary counts, schema tree, pretty raw/source data, findings, and search/filter.
- Google rich result validation rules are bundled locally and cover all current Google rich result documentation.
- Findings are grouped as errors, warnings, and info with short hints.
- Duplicate structured-data entities are warned about without hiding original source blocks.
- No page data is sent over the network by the extension.
- Results are session-only and not persisted after the panel/page session ends.
- The extension is packaged with explicit side panel permissions and store review materials.

## Verification

- Run TypeScript type checks.
- Run unit tests for parser, normalizer, duplicate detection, and validator modules.
- Run fixture tests against saved HTML examples for each supported format and edge case.
- Run E2E tests in Chrome for loading the unpacked extension, opening the side panel, analyzing pages, manual refresh, search/filter, and raw/tree/finding views.
- Manually verify public websites, authenticated staging pages, SPAs, and localhost pages.
- Manually inspect the built extension package for unexpected network calls, broad permissions, or persisted page data.

## Risks And Mitigations

- Complete Google rich result coverage is large and documentation changes over time. Mitigate by encoding rules as data files, documenting source URLs per rule, and testing rule fixtures.
- Equal-depth Microdata and RDFa support can be more complex than JSON-LD. Mitigate by sharing a normalized node model and using fixtures for nested and mixed-format cases.
- Sidebar active-tab analysis requires explicit scripting, tabs, and host permissions. Mitigate store review risk with clear permission justifications and no data transmission.
- SPA schema may change after route transitions. Mitigate with a prominent manual refresh action and timestamped analysis results.
- Store review may reject unclear permission or privacy language. Mitigate with explicit local-only implementation and plain-language store disclosures.
- SEO-friendly UI can hide useful technical detail. Mitigate by keeping summary friendly while preserving tree, source, and finding details.

## Dependencies

- Latest stable Chrome and Manifest V3 APIs.
- Access to Google Search Central rich result documentation during rule authoring.
- Representative HTML fixtures for JSON-LD, Microdata, RDFa, malformed data, and mixed-format pages.
- Product name, icon, screenshots, and store listing copy before final Web Store submission.

## Open Questions

- What product name and visual identity should be used for the Chrome Web Store listing?
- Which real-world URLs should become fixture references for early QA?
- Should the extension use only custom CSS, or is a small CSS reset/design token layer acceptable?
