# Chrome Extension Schema Invariants

## Scope

These invariants apply to the Chrome DevTools extension for local on-page SEO structured-data extraction, normalization, validation, and display.

## Invariants

### Local-Only Analysis

- Rule: Page content, structured data, URLs, findings, and analysis results must not be transmitted to external services.
- Why: The extension must be safe for authenticated staging pages and support the Chrome Web Store privacy claim of no data collection.
- Enforced in: Extension architecture, network usage, dependency choices, and store disclosures.
- Verified by: Code review, package inspection, E2E monitoring for network requests, and privacy disclosure review.
- Edge cases: Loading bundled extension assets is allowed; remote rule fetching, telemetry, AI analysis, and analytics are not allowed in the first release.

### Session-Only Results

- Rule: Analysis results must remain in memory for the current DevTools/page session only.
- Why: Users chose no history, bookmarks, exports, or persisted page audits for the first release.
- Enforced in: UI state management and storage API usage.
- Verified by: Tests or manual QA confirming results disappear after panel/page session closure and no page analysis is written to extension storage.
- Edge cases: Persisting non-sensitive UI preferences is out of scope unless explicitly approved later.

### Current DOM Is Primary

- Rule: The primary analyzed source is the currently rendered DOM of the inspected page.
- Why: The first milestone must support public pages, staging pages, SPAs, and localhost while avoiding original-response capture complexity.
- Enforced in: Analysis bridge and extraction pipeline.
- Verified by: Fixture and manual SPA checks where schema is injected after load and appears after manual refresh.
- Edge cases: Original HTML comparison is deferred; missing original HTML must not block analysis.

### Analysis Runs On Open And Navigation

- Rule: Schema analysis must run automatically when the DevTools panel opens, when Chrome reports inspected-page navigation, when the inspected page URL changes in SPA-style navigation, and when the user triggers manual refresh.
- Why: In-house SEO QA should show useful results immediately and stay current across route changes without requiring broad host permissions or page overlays.
- Enforced in: DevTools panel startup, `chrome.devtools.network.onNavigated`, current URL checks through inspected-window evaluation, and the manual refresh action.
- Verified by: E2E-style package tests for automatic analysis/navigation wiring, manual QA across full page loads and SPA route changes, and type checks around the analysis scheduler.
- Edge cases: DOM mutations that do not change URL are not automatic analysis triggers; users can still manually refresh after client-side schema changes that keep the same URL.

### Analysis Scheduling Is Bounded

- Rule: Only one analysis run should execute at a time, and pending automatic reanalysis should be coalesced instead of stacking repeated runs.
- Why: DevTools should remain responsive during navigation bursts and SPA route changes.
- Enforced in: Panel analysis scheduler state such as in-flight and pending-refresh tracking.
- Verified by: Code review and E2E/manual navigation checks confirming repeated navigation events do not create concurrent analyses.
- Edge cases: If an inspected page is temporarily unavailable during navigation, the next navigation event, URL poll, or manual refresh may retry analysis.

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

### Minimal Permissions By Default

- Rule: The extension must request the smallest Chrome permission set that supports DevTools panel analysis.
- Why: Minimal permissions improve user trust and Chrome Web Store review likelihood.
- Enforced in: `manifest.json`, architecture decisions, and review checklist.
- Verified by: Manual manifest review and Chrome Web Store submission checks.
- Edge cases: Additional permissions for original HTML fetching or broad host access require an explicit later decision.

## Cross-References

- Related plan: `docs/plans/chrome-extension-on-page-seo-schema-plan.md`
