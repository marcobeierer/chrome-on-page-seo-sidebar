# Firefox Compatibility Plan

## Summary

Add a Firefox-compatible extension package while preserving the existing Chrome side panel package. The analyzer, UI, extraction, normalization, and validation code should stay shared; only browser integration, manifest generation, browser-facing copy, packaging, and verification should diverge where Firefox and Chrome APIs differ.

## Context

The current extension is a Chrome Manifest V3 side panel extension. The core on-page SEO analysis runs locally in `src/inspectedPage.ts` and is browser-agnostic, but the extension shell currently depends on Chrome-specific integration points:

- `public/manifest.json` uses `side_panel`, `minimum_chrome_version`, `background.service_worker`, and the `sidePanel` permission.
- `src/background.ts` calls `chrome.sidePanel.setPanelBehavior()`.
- `src/panel.ts` uses `chrome.*` APIs directly and includes Chrome-specific shortcut and permission messages.
- Packaging and E2E package tests assume one Chrome-only `dist/` output.

Firefox supports browser sidebars through `sidebar_action` and `sidebarAction`, not Chrome's `side_panel` and `sidePanel` APIs. Firefox Manifest V3 also needs background scripts instead of Chrome-only service-worker background behavior.

## Goals

- Produce a Firefox package that can be loaded as a temporary add-on and submitted to addons.mozilla.org.
- Preserve the existing Chrome package behavior and Chrome Web Store compatibility.
- Keep the analyzer, UI rendering, local-only privacy model, and session-only results shared across browsers.
- Generate browser-specific manifests from shared source data instead of maintaining two mostly duplicated static manifests.
- Replace hard-coded Chrome-facing runtime copy with browser-neutral or browser-specific copy.
- Add package tests and linting that catch Chrome/Firefox manifest drift.

## Non-Goals

- Replacing the current Vanilla TypeScript implementation.
- Rewriting the analyzer, schema normalization, rich result rules, or panel UI layout.
- Making Chrome and Firefox sidebar opening behavior pixel-perfect or behavior-identical where browser UI differs.
- Adding Safari, Edge, or other browser packages in this pass.
- Adding telemetry, remote validation, remote rule fetching, or persisted analysis history.

## Scope

- Browser-specific manifest generation and package output directories.
- Extension API wrapper for shared access to `tabs`, `scripting`, `permissions`, and runtime APIs.
- Background integration for Chrome `sidePanel` and Firefox `sidebarAction`.
- Browser-neutral panel copy and restricted URL handling.
- Build, package, and test scripts for Chrome and Firefox.
- Documentation updates for local development and release checks.

## Assumptions

- The Firefox target can use Manifest V3 with `sidebar_action`.
- The shared panel page can run inside both Chrome's side panel and Firefox's sidebar.
- `chrome.scripting.executeScript` / `browser.scripting.executeScript` can remain the active-tab analysis bridge with `activeTab`, `scripting`, and explicit host access behavior.
- A Firefox package needs an AMO/gecko extension ID before final submission.
- `web-ext` is acceptable as a dev dependency if needed for Firefox linting and temporary-addon development.

## Decisions

- Keep separate built outputs, for example `dist/chrome/` and `dist/firefox/`, rather than making one manifest serve both browsers.
- Use one shared panel bundle unless a concrete Firefox runtime incompatibility appears.
- Use feature detection in background code for browser behavior: `sidePanel` for Chrome, `sidebarAction` for Firefox.
- Prefer browser-neutral user-facing language such as “This browser” unless browser-specific guidance is necessary.
- Keep permissions minimal and explicit per browser; Firefox must not request Chrome-only `sidePanel` permission.

## Implementation Plan

### Phase 1: Split Manifest Generation

- Replace direct copying of `public/manifest.json` with a build step that generates browser-specific manifests.
- Keep shared manifest data for name, short name, version, description, icons, action metadata, default locale, homepage URL, optional host permissions, and shared permissions.
- Generate the Chrome manifest with `side_panel`, `background.service_worker`, `minimum_chrome_version`, and `sidePanel` permission.
- Generate the Firefox manifest with `sidebar_action`, `background.scripts`, no `minimum_chrome_version`, no `sidePanel` permission, and `browser_specific_settings.gecko`.
- Preserve localizable manifest fields for both packages.

### Phase 2: Add Browser-Safe Extension API Access

- Introduce a small extension API module that resolves `globalThis.browser ?? globalThis.chrome`.
- Use the wrapper in shared panel code for tabs, scripting, and permissions calls.
- Keep TypeScript types narrow and local instead of spreading browser-specific globals throughout the app.
- Normalize callback/promise behavior only where the two namespaces differ in practice.

### Phase 3: Adapt Background Integration

- Replace Chrome-only `chrome.sidePanel.setPanelBehavior()` calls with a background entry that feature-detects sidebar support.
- For Chrome, keep `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` on install/startup.
- For Firefox, configure toolbar/sidebar behavior through `sidebarAction` and `action.onClicked` if needed.
- Ensure the Firefox background is valid as `background.scripts` and the Chrome background remains valid as `background.service_worker`.

### Phase 4: Make Runtime Copy Browser-Aware

- Replace `chrome://extensions/shortcuts` usage with browser-aware shortcut guidance or hide/disable the shortcut settings button when no direct settings URL is available.
- Replace Chrome-specific errors with browser-neutral wording for restricted pages and missing host permissions.
- Add `moz-extension:` and Firefox-protected pages to restricted URL handling.
- Update locale descriptions so they do not describe the product as Chrome-only in Firefox packages.

### Phase 5: Build And Package Per Browser

- Update `scripts/build.mjs` to accept a target browser or build both outputs.
- Keep sourcemaps and `test-api.mjs` behavior appropriate for tests without shipping them in store zips.
- Update `scripts/package-store.mjs` or add target-specific packaging scripts for Chrome and Firefox archives.
- Add npm scripts for browser-specific workflows, such as `build:chrome`, `build:firefox`, `package:chrome`, and `package:firefox`.

### Phase 6: Tests And Linting

- Split package tests so Chrome-specific assertions inspect the Chrome output and Firefox-specific assertions inspect the Firefox output.
- Assert Chrome keeps `side_panel`, `sidePanel`, and `background.service_worker`.
- Assert Firefox keeps `sidebar_action`, omits `sidePanel`, omits `minimum_chrome_version`, includes `browser_specific_settings.gecko`, and uses `background.scripts`.
- Keep local-only assertions for both packages: no `fetch`, no `XMLHttpRequest`, no broad persisted storage usage, and expected optional host permissions.
- Add `web-ext lint` for the Firefox package if the dependency is added.

### Phase 7: Manual Firefox QA

- Load the Firefox build as a temporary add-on through `about:debugging`.
- Open the sidebar through Firefox's sidebar UI and toolbar action behavior.
- Verify automatic analysis on sidebar open, active-tab changes, full navigations, SPA URL changes, and manual refresh.
- Verify permission prompts and refresh behavior on public sites, localhost, and authenticated staging-like pages.
- Verify protected pages show useful restricted-page messaging.
- Verify copy controls, search, severity filters, format filters, Tree, Source, Findings, and Page data behavior.

## Implementation Checklist

### Manifest And Build Output

- [ ] Decide final output layout: `dist/chrome/` and `dist/firefox/`, or equivalent target-specific folders.
- [ ] Add shared manifest source data or a manifest generation helper.
- [ ] Generate Chrome manifest with `side_panel.default_path` set to `panel.html`.
- [ ] Generate Chrome manifest with `background.service_worker` set to `background.js` and `type` set to `module`.
- [ ] Generate Chrome manifest with `minimum_chrome_version` and the `sidePanel` permission.
- [ ] Generate Firefox manifest with `sidebar_action.default_panel` set to `panel.html`.
- [ ] Generate Firefox manifest with `background.scripts` set to `background.js`.
- [ ] Generate Firefox manifest without `minimum_chrome_version`.
- [ ] Generate Firefox manifest without the `sidePanel` permission.
- [ ] Add `browser_specific_settings.gecko` with an AMO-ready extension ID, Firefox 142+ minimum version, and no-data-collection declaration.
- [ ] Confirm locales and icons are copied into both browser outputs.

### Extension API Compatibility

- [ ] Add a small cross-browser extension API module.
- [ ] Replace direct `chrome.tabs.*` usage in panel code with the wrapper.
- [ ] Replace direct `chrome.scripting.executeScript` usage with the wrapper.
- [ ] Replace direct `chrome.permissions.request` usage with the wrapper.
- [ ] Keep active-tab analysis return value handling compatible with both browsers.
- [ ] Add or adjust TypeScript declarations so `npm run typecheck` remains clean.

### Background Behavior

- [ ] Feature-detect `sidePanel` before calling Chrome side panel APIs.
- [ ] Feature-detect `sidebarAction` for Firefox sidebar behavior.
- [ ] Add Firefox toolbar-click behavior if the default sidebar action does not open/toggle as desired.
- [ ] Ensure background code can run as a Chrome MV3 service worker.
- [ ] Ensure background code can run as a Firefox MV3 background script.
- [ ] Verify unsupported browser APIs are not called unguarded.

### Runtime Copy And Restricted Pages

- [ ] Replace Chrome-specific missing-permission message text.
- [ ] Replace Chrome-specific restricted-page message text.
- [ ] Decide whether the shortcut settings button should be browser-aware, hidden in Firefox, or replaced with generic guidance.
- [ ] Replace `chrome://extensions/shortcuts` with target-specific behavior or remove direct navigation for Firefox.
- [ ] Add `moz-extension:` to restricted URL detection.
- [ ] Review Firefox protected URLs and add practical restrictions or error handling.
- [ ] Update English locale descriptions for browser-neutral or target-specific wording.
- [ ] Update German locale descriptions for browser-neutral or target-specific wording.

### Packaging Scripts

- [ ] Add `npm run build:chrome`.
- [ ] Add `npm run build:firefox`.
- [ ] Decide whether `npm run build` builds both targets or only the default target.
- [ ] Add target-specific package archive names.
- [ ] Ensure store archives exclude sourcemaps and test-only bundles.
- [ ] Add Firefox package linting with `web-ext lint` if `web-ext` is adopted.

### Automated Tests

- [ ] Update package tests to inspect Chrome and Firefox outputs separately.
- [ ] Assert the Chrome package keeps Chrome side panel behavior.
- [ ] Assert the Firefox package keeps Firefox sidebar behavior.
- [ ] Assert both packages keep local-only/no-network assumptions.
- [ ] Assert both packages include required HTML, CSS, JS bundles, icons, and locales.
- [ ] Assert browser-specific manifests do not include invalid keys or permissions.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.

### Manual QA

- [ ] Load the Chrome output unpacked in Chrome and verify current behavior did not regress.
- [ ] Load the Firefox output as a temporary add-on in Firefox.
- [ ] Verify sidebar open/toggle behavior in Firefox.
- [ ] Verify analysis on a normal public page in Firefox.
- [ ] Verify analysis on localhost in Firefox.
- [ ] Verify permission prompt and manual refresh behavior in Firefox.
- [ ] Verify active-tab change refresh in Firefox.
- [ ] Verify full-navigation refresh in Firefox.
- [ ] Verify SPA URL-change refresh in Firefox.
- [ ] Verify restricted-page messaging in Firefox.
- [ ] Verify Tree, Source, Findings, filters, search, Page data, and copy controls in Firefox.

### Documentation And Release Prep

- [ ] Update README development instructions for Chrome and Firefox.
- [ ] Add Firefox temporary-addon testing notes.
- [ ] Add AMO permission justification and privacy wording.
- [ ] Update invariants to describe browser sidebar packages instead of Chrome-only assumptions where applicable.
- [ ] Update store-prep docs or add an AMO preparation doc.
- [ ] Document any known Firefox behavior differences from Chrome.

## Acceptance Criteria

- Chrome and Firefox builds are generated from one codebase without manually editing manifests between targets.
- The Chrome package still loads unpacked in Chrome and opens as a side panel from the toolbar.
- The Firefox package loads as a temporary add-on and opens as a Firefox sidebar.
- Opening the sidebar/panel analyzes the active tab's current DOM in both browsers.
- Manual refresh, active-tab navigation, SPA URL-change polling, search/filtering, Tree, Source, Findings, Page data, and copy controls work in both browsers.
- Firefox package does not contain Chrome-only `side_panel`, `sidePanel`, or `minimum_chrome_version` fields.
- Chrome package does not lose its current `side_panel` integration.
- Both packages preserve the local-only and session-only privacy model.
- Automated package tests cover browser-specific manifest expectations.
- `npm run check` or the updated equivalent verification command passes.

## Verification

- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build` or both target-specific build commands.
- Run Chrome package tests against the Chrome output.
- Run Firefox package tests against the Firefox output.
- Run `web-ext lint` against the Firefox output if configured.
- Manually load the Chrome build in latest stable Chrome.
- Manually load the Firefox build in latest stable Firefox.
- Manually verify public websites, authenticated staging-like pages, SPAs, localhost, permission-denied flows, and restricted browser pages.
- Inspect final archives to confirm no sourcemaps, test-only bundles, telemetry, or unexpected network code are shipped.

## Risks And Mitigations

- Firefox sidebar behavior may not match Chrome side panel click behavior exactly. Mitigate by accepting browser-native sidebar behavior and documenting differences.
- Firefox MV3 background support differs from Chrome service workers. Mitigate with target-specific manifest generation and guarded background code.
- Optional host permission behavior and error messages may differ. Mitigate with manual permission-flow QA and browser-neutral fallback messages.
- Maintaining two packages can introduce manifest drift. Mitigate with generated manifests and package tests for both targets.
- `browser` and `chrome` namespace promise/callback differences can cause runtime bugs. Mitigate with a narrow API wrapper and manual Firefox checks around each used API.
- AMO review may require different copy, permissions, or IDs. Mitigate with an AMO-specific preparation doc and `web-ext lint` before submission.

## Dependencies

- Latest stable Chrome for regression testing.
- Latest stable Firefox for temporary-addon testing.
- Firefox WebExtension documentation for `sidebar_action`, `sidebarAction`, background scripts, permissions, and AMO metadata.
- Optional `web-ext` dev dependency for Firefox linting and local development.
- AMO/gecko extension ID before production submission.

## Open Questions

- Firefox minimum version is 142.0 because Firefox lints `optional_host_permissions` and `data_collection_permissions` as unsupported before that version across Firefox targets.
- What stable gecko extension ID should be used for AMO submission?
- Should `npm run build` build both browsers by default or keep Chrome as the default and require explicit Firefox builds?
- Should the shortcut settings button be hidden in Firefox or replaced with a generic help popover?
- Should release archives be named by browser target, version, or both?
