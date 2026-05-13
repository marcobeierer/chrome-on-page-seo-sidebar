# Browser Extension Schema Invariants

## Scope

These invariants apply to the browser sidebar extension for local on-page SEO structured-data extraction, normalization, validation, and display.

## Invariants

### Product And Panel Naming

- Rule: The extension, store listing, package-facing documentation, side panel UI, and icon accessibility labels must use `On-Page SEO Sidebar`.
- Why: The product is a browser side panel, so the visible release surfaces should use the full descriptive name consistently.
- Enforced in: generated browser manifests, `package.json`, README, store-prep docs, panel HTML, icon accessibility labels, and store materials.
- Verified by: Build/package checks, manual Chrome and Firefox extension loads, and text search before release.
- Edge cases: Historical planning docs may mention earlier working names, but user-facing release surfaces should not.

### Local-Only Analysis

- Rule: Page content, structured data, URLs, findings, and analysis results must not be transmitted to external services.
- Why: The extension must be safe for authenticated staging pages and support extension store privacy claims of no data collection.
- Enforced in: Extension architecture, network usage, dependency choices, and store disclosures.
- Verified by: Code review, package inspection, E2E monitoring for network requests, and privacy disclosure review.
- Edge cases: Loading bundled extension assets is allowed; remote rule fetching, telemetry, AI analysis, and analytics are not allowed in the first release.

### Session-Only Results

- Rule: Analysis results must remain in memory for the current side panel/page session only.
- Why: Users chose no history, bookmarks, exports, or persisted page audits for the first release.
- Enforced in: UI state management and storage API usage.
- Verified by: Tests or manual QA confirming results disappear after panel/page session closure and no page analysis is written to extension storage.
- Edge cases: Persisting non-sensitive UI preferences is out of scope unless explicitly approved later.

### Current DOM Is Primary

- Rule: The primary analyzed source is the currently rendered DOM of the active browser tab.
- Why: The first milestone must support public pages, staging pages, SPAs, and localhost while avoiding original-response capture complexity.
- Enforced in: Analysis bridge and extraction pipeline.
- Verified by: Fixture and manual SPA checks where schema is injected after load and appears after manual refresh.
- Edge cases: Original HTML comparison is deferred; missing original HTML must not block analysis.

### Page Metadata Is First-Class On-Page Data

- Rule: Each page analysis must extract and display the active tab's document title, meta description, canonical link, and hreflang alternate links when present.
- Why: On-page SEO QA needs core HTML metadata alongside structured data to understand the page's search-facing signals.
- Enforced in: Active-tab extraction, `ExtractedPageData.page`, and the side panel page data section.
- Verified by: Package/UI checks for the page data section and manual QA against pages with and without each metadata field.
- Edge cases: Missing metadata should display as `Not found`; multiple hreflang links should all be shown; canonical and hreflang URLs should use the browser-resolved `href` when available.

### Page Metadata Collapse State Is Stable

- Rule: The page data block must be collapsible and preserve its open/collapsed state across side panel view switches and ordinary rerenders.
- Why: Users collapse page metadata to focus on schema data; changing tabs must not unexpectedly reopen it.
- Enforced in: Side panel UI state and page data rendering.
- Verified by: Manual QA switching between Tree, Source, and Findings after collapsing Page data.
- Edge cases: A full side panel reload may reset the default state; that is acceptable because state is session-only.

### Analysis Runs On Open And Navigation

- Rule: Schema analysis must run automatically when the sidebar opens, when the active tab changes, when the browser reports active-tab navigation, when the active tab URL changes in SPA-style navigation, and when the user triggers manual refresh.
- Why: In-house SEO QA should show useful results immediately and stay current across pages without requiring developer tools to be open.
- Enforced in: Sidebar startup, active-tab events, current URL checks through the browser scripting API, and the manual refresh action.
- Verified by: E2E-style package tests for automatic analysis/navigation wiring, manual QA across full page loads and SPA route changes, and type checks around the analysis scheduler.
- Edge cases: DOM mutations that do not change URL are not automatic analysis triggers; users can still manually refresh after client-side schema changes that keep the same URL.

### Analysis Scheduling Is Bounded

- Rule: Only one analysis run should execute at a time, and pending automatic reanalysis should be coalesced instead of stacking repeated runs.
- Why: The side panel should remain responsive during navigation bursts and SPA route changes.
- Enforced in: Panel analysis scheduler state such as in-flight and pending-refresh tracking.
- Verified by: Code review and E2E/manual navigation checks confirming repeated navigation events do not create concurrent analyses.
- Edge cases: If the active tab is temporarily unavailable during navigation, the next tab event, URL poll, or manual refresh may retry analysis.

### Equal First-Class Format Support

- Rule: JSON-LD, Microdata, and RDFa must all be detected, normalized, displayed, and validated as first-class structured-data sources.
- Why: The MVP scope requires all structured data formats at equal depth.
- Enforced in: Extractor interfaces, normalized node model, validators, fixtures, and UI labels.
- Verified by: Unit and fixture tests for each format and mixed-format pages.
- Edge cases: Format-specific source display can differ, but findings and normalized nodes must remain comparable.

### Malformed JSON-LD Is Visible

- Rule: Invalid JSON-LD blocks must be shown as findings instead of being ignored.
- Why: In-house SEO users need to catch broken implementations during QA.
- Enforced in: JSON-LD extraction and parser error handling.
- Verified by: Fixture tests with malformed JSON-LD and UI tests showing both raw parse error and friendly explanation.
- Edge cases: Best-effort partial parsing is optional; the original invalid block must remain visible either way.

### Source Blocks Are Not Hidden By Normalization

- Rule: Normalization and graph linking must not remove or hide original source blocks.
- Why: Users need to inspect what was authored and diagnose duplicates or conflicts.
- Enforced in: Data model storing source references separately from normalized nodes.
- Verified by: Tests showing duplicate or linked nodes still reference their original source blocks.
- Edge cases: The graph view may link or group related nodes, but raw/source views must preserve source-level visibility.

### Duplicate Entities Produce Warnings

- Rule: Duplicate or conflicting structured-data entities must produce warnings rather than being silently merged.
- Why: Duplicate schema can create SEO QA ambiguity and should be actionable.
- Enforced in: Normalization and findings generation.
- Verified by: Fixture tests with repeated `@id`, repeated entity types, and mixed-format duplicates.
- Edge cases: Shared references are not necessarily duplicates; duplicate warnings should prefer clear evidence such as same identifier or conflicting values for the same entity.

### Google Rules Are Bundled And Reproducible

- Rule: Google rich result validation rules must be bundled with the extension release.
- Why: Validation must work offline/local-only and produce reproducible results for a given extension version.
- Enforced in: Rule catalog packaging and validator initialization.
- Verified by: Build checks confirming rule files are included and runtime checks do not fetch remote rule metadata.
- Edge cases: Updating rules requires a new extension release unless a future privacy-approved update mechanism is explicitly designed.

### Findings Use Errors, Warnings, And Info

- Rule: All analysis findings must map to one of error, warning, or info.
- Why: This severity model was chosen for the first release and keeps UI filtering consistent.
- Enforced in: Findings type definitions and validator outputs.
- Verified by: Type checks and tests requiring severity on every finding.
- Edge cases: UI labels may include friendly copy, but underlying severity values must remain stable.

### Findings Reliability Is Disclosed

- Rule: The Findings tab must display a visible note that findings are a work in progress and may not be reliable because they have not been verified manually yet.
- Why: Validation rules and recommendations are still being refined, so users must not mistake findings for fully verified audit results.
- Enforced in: Findings tab UI copy and package tests.
- Verified by: E2E package tests checking the note text and manual UI review.
- Edge cases: The note can be removed only after the validation catalog and findings behavior have been manually verified against representative real-world pages.

### Sidebar Permissions Are Explicit

- Rule: Each browser package must request only the sidebar permissions required for automatic active-page analysis: Chrome uses `sidePanel`, `scripting`, `tabs`, and optional host access; Firefox uses `sidebar_action`, `scripting`, `tabs`, and optional host access.
- Why: A browser sidebar must analyze the active tab from normal browsing contexts and stay current across public sites, staging sites, SPAs, and localhost.
- Enforced in: generated manifests, architecture decisions, tests, store-prep docs, and store permission justifications.
- Verified by: E2E package tests, manual manifest review, Chrome Web Store checks, and AMO checks.
- Edge cases: More permissions, remote code, telemetry, or original HTML network capture require an explicit later decision.

## Cross-References

- Related plan: `docs/plans/chrome-extension-on-page-seo-schema-plan.md`
