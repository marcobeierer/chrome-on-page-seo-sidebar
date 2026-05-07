# Engineering Quality Hardening Plan

## Summary

Improve the extension from prototype-quality implementation toward maintainable MVP-quality engineering by addressing four review findings: popover lifecycle leaks, weak extraction test coverage, oversized panel module, and unverified validation rule data.

## Context

The current side panel extension builds and passes its test suite. The architecture is coherent, but the UI has accumulated logic in `src/panel.ts`, DOM extraction is not tested with realistic HTML fixtures, copy popovers are appended to `document.body` without lifecycle cleanup, and Google rich result rules are still manually approximated.

## Goals

- Prevent stale copy popovers and event closures from accumulating across rerenders.
- Add realistic DOM extraction tests for page metadata, JSON-LD, Microdata, RDFa, and mixed/nested examples.
- Split `src/panel.ts` into smaller modules with clear responsibilities.
- Make the Google rich result rule catalog more maintainable and auditable.

## Non-Goals

- Replacing the current Vanilla TypeScript approach with a UI framework.
- Fully verifying every Google rich result rule manually in this pass.
- Changing the visual design or product scope beyond quality hardening.
- Adding telemetry, remote rules, or server-side validation.

## Scope

- `src/panel.ts` and new panel UI helper modules.
- `src/inspectedPage.ts` extraction behavior and testability.
- `tests/` fixture coverage for realistic HTML extraction.
- `src/rules/googleRichResults.ts` rule metadata structure and rule maintenance docs.
- Existing docs and invariants where behavior changes.

## Assumptions

- The project should stay dependency-light, but a small DOM test dependency is acceptable if Node's built-in test runner cannot cover extraction realistically.
- Existing UI behavior should remain the same unless explicitly improved by the cleanup.
- Findings should keep the current reliability warning until rule validation has been manually verified.

## Decisions

- Prefer small extraction/refactor steps over a broad rewrite.
- Keep browser-facing behavior unchanged while moving code into modules.
- Treat rule catalog hardening as metadata/documentation plus fixture scaffolding first, not as a claim of full Google parity.

## Implementation Plan

### Phase 1: Fix Popover Lifecycle

- Replace global body-appended popovers with popovers owned by their node/source/header container, or introduce a tracked popover registry that removes stale popovers before rerendering a view.
- Ensure popovers are hidden and removed when Tree or Source views are replaced.
- Reuse one helper for copy chips, copy icon buttons, and tooltip-only buttons.

### Phase 2: Add Realistic Extraction Tests

- Introduce a DOM-capable test setup for `inspectedPageAnalysis`.
- Add fixture HTML for page metadata: title, meta description, canonical, hreflang, and missing fields.
- Add JSON-LD fixture tests for valid, malformed, `@graph`, nested objects, and arrays.
- Add Microdata fixture tests for nested `itemscope`, ownership, URL/value extraction, and source block capture.
- Add RDFa fixture tests for `typeof`, `property`, `resource`, `about`, `href`, `content`, and nested entities.
- Add mixed-format fixture tests that run real extraction instead of manually constructing nodes.

### Phase 3: Split Panel Module

- Move Chrome active-tab analysis and scheduling helpers into a focused module.
- Move tree rendering and tree hierarchy helpers into a focused module.
- Move source rendering, source formatting, and copy-source behavior into a focused module.
- Move copy popover/clipboard controls into a reusable UI helper module.
- Keep `src/panel.ts` as the composition layer that wires DOM controls, state, and render calls.

### Phase 4: Harden Rule Catalog Maintenance

- Extend rule metadata with source URL, last-reviewed date, rule status, and notes for known partial coverage.
- Separate required/recommended/value-shape rules from UI hint wording if it improves readability.
- Add fixture scaffolding per major rich result type for future manual verification.
- Update docs to explain how to review and update bundled rules.
- Keep the Findings reliability notice until representative manual verification is complete.

## Implementation Checklist

### Popover Lifecycle

- [ ] Identify all current popover creation paths in Tree, Source, and toolbar controls.
- [ ] Implement a reusable popover helper with explicit cleanup.
- [ ] Ensure rerendering Tree removes stale Tree popovers.
- [ ] Ensure rerendering Source removes stale Source popovers.
- [ ] Ensure toolbar shortcut tooltip does not create duplicate popovers.
- [ ] Add package or DOM-level test coverage where practical.

### DOM Extraction Tests

- [ ] Choose and install a minimal DOM test dependency if needed.
- [ ] Export or wrap `inspectedPageAnalysis` so it can run against fixture documents safely.
- [ ] Add page metadata fixture tests.
- [ ] Add JSON-LD extraction fixture tests.
- [ ] Add malformed JSON-LD fixture/analysis test.
- [ ] Add Microdata extraction fixture tests.
- [ ] Add RDFa extraction fixture tests.
- [ ] Replace manually constructed mixed-format fixture coverage with extraction-based coverage.

### Panel Refactor

- [ ] Create panel module boundaries and filenames.
- [ ] Move active-tab Chrome API analysis/scheduling code out of `panel.ts`.
- [ ] Move Tree rendering/hierarchy code out of `panel.ts`.
- [ ] Move Source rendering/formatting code out of `panel.ts`.
- [ ] Move popover/copy controls out of `panel.ts`.
- [ ] Keep behavior unchanged and run verification after each module move.
- [ ] Confirm `panel.ts` becomes a concise composition file.

### Rule Catalog Hardening

- [ ] Add rule metadata fields for status, source URL, and last-reviewed date.
- [ ] Mark current rule coverage as partial where appropriate.
- [ ] Add or update rule maintenance docs.
- [ ] Add fixture scaffolding for rich result rule verification.
- [ ] Keep Findings reliability warning visible.

## Acceptance Criteria

- Repeated Tree/Source rerenders do not leave stale popovers in the DOM.
- Real HTML fixture tests exercise `inspectedPageAnalysis` for page metadata, JSON-LD, Microdata, RDFa, and mixed-format pages.
- `src/panel.ts` is reduced to orchestration/state wiring and no longer owns all rendering, formatting, popover, and Chrome API details.
- The rule catalog clearly communicates source, review status, and partial coverage.
- Existing user-facing behavior remains intact unless explicitly improved.
- `npm run check` passes.

## Verification

- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.
- Run `npm audit`.
- Manually load `dist/` as an unpacked extension.
- Manually verify Tree, Source, Findings, Page data, shortcut settings button, copy controls, and auto-analysis on navigation.
- Manually stress Tree/Source rerenders and confirm no stale popovers remain.

## Risks And Mitigations

- Refactoring `panel.ts` can introduce UI regressions. Mitigate with small moves and verification after each phase.
- DOM test setup can add dependency weight. Mitigate by choosing one minimal, well-maintained test DOM library and limiting it to dev dependencies.
- Rule catalog hardening can become too broad. Mitigate by improving metadata and scaffolding first, not claiming full validation certainty.
- Popover cleanup may break hover/focus behavior. Mitigate with manual keyboard and mouse QA.

## Dependencies

- A DOM test environment if native Node tests are insufficient.
- Representative HTML fixtures for real-world schema and metadata patterns.
- Google Search Central documentation for future manual rule verification.

## Open Questions

- Which DOM test library should be used if needed?
- Should rule verification fixtures live under `tests/fixtures/rich-results/` or alongside the rule catalog?
- What level of manual Google rule verification is required before removing the Findings reliability warning?
