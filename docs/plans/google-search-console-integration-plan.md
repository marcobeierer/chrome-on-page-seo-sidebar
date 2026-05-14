# Google Search Console Integration Plan

## Summary

Add an authenticated Google Search Console tab to the existing side panel so users can see page-level Search Console query performance for the currently inspected page. The current structured-data sidebar remains the first top-level tab; the new second tab shows GSC data for the canonical URL when available, with property selection, report filters, and a short in-memory cache.

## Context

The extension is currently a Vanilla TypeScript Manifest V3 Chrome side panel. It analyzes the active tab's rendered DOM, extracts on-page metadata and structured data, and intentionally makes no extension network calls. The existing UI already has internal Tree, Source, and Findings tabs for structured-data views. Adding GSC changes the product from strictly local analysis to a hybrid model: on-page analysis stays local-only, while the GSC tab performs explicit authenticated read-only Google API calls after user sign-in.

## Goals

- Add top-level sidebar tabs: `On-page` for the current content and `GSC` for Search Console data.
- Authenticate with Google from the extension using OAuth and read-only Search Console access.
- Auto-detect Search Console properties available to the signed-in user and choose the best match for the current page, with a manual override selector.
- Query Search Console for the current page's canonical URL when present, falling back to the active tab URL.
- Show the top 50 query rows for the page sorted by clicks, including clicks, impressions, CTR, and average position.
- Provide report filters for date range, search type, country, and device.
- Cache GSC API responses in memory for up to 15 minutes, without persisting GSC result rows to extension storage.
- Persist non-sensitive preferences, such as selected property per site and last-used filters, in `chrome.storage.local`.
- Keep the GSC integration Chrome-only for the first implementation.

## Non-Goals

- Firefox support for GSC authentication in the first implementation.
- A backend service for OAuth, token exchange, data enrichment, or analytics.
- Manual API key or pasted-token authentication.
- Persisted GSC report history per URL.
- Exporting GSC reports.
- Querying all pages in a property or building a full Search Console dashboard.
- Changing the structured-data extraction and validation behavior beyond wrapping it in the first top-level tab.

## Scope

- `public/manifest.json` for OAuth, `identity`, `storage`, and allowed Google API hosts.
- `src/background.ts` for OAuth token handling, GSC API calls, property discovery, preference access, and in-memory response caching.
- `src/panel.ts`, `public/panel.html`, and `public/panel.css` for top-level tab layout, GSC states, controls, and report table rendering.
- New TypeScript types/modules for GSC properties, filters, query results, errors, and cache keys.
- Existing package tests that currently assert no network calls and local-only behavior.
- Store/privacy documentation and invariants that describe the new authenticated network boundary.

## Assumptions

- Chrome-only OAuth uses the Chrome Identity API and the Search Console read-only scope: `https://www.googleapis.com/auth/webmasters.readonly`.
- The implementation uses a Google Cloud `Chrome Extension` OAuth client configured for the pinned extension ID.
- Users must have Chrome browser sign-in enabled for `chrome.identity.getAuthToken`.
- The API client should call the official Google Search Console APIs directly from the extension background service worker.
- The default date range is the last 28 days, with the implementation choosing complete days to avoid partial current-day reporting.
- Search type defaults to web search.
- Country and device filters can start as simple controls with `All` states; a richer country picker can be added later.
- A 15-minute memory cache is a maximum TTL, not a guarantee: Manifest V3 service worker suspension may clear it earlier.

## Decisions

- Use OAuth in the extension rather than a backend because the first implementation should stay lightweight and avoid storing user Search Console data outside the browser.
- Use `chrome.identity.getAuthToken` rather than a manual OAuth redirect flow because the extension is Chrome-only and can rely on Chrome's native identity integration.
- Keep GSC calls in the background service worker rather than the panel so network/auth boundaries are centralized and easier to test.
- Preserve the existing internal Tree, Source, and Findings tabs inside the new `On-page` top-level tab.
- Use canonical URL first because GSC page reporting should align with the SEO URL that Google is expected to index.
- Query the Search Analytics API with the `query` dimension and a `page equals <target URL>` filter for the page-level keyword table.
- Persist preferences but not GSC report rows because preferences improve usability without retaining sensitive search performance data.
- Treat GSC errors as first-class UI states: signed out, no matching property, API access denied, quota/rate limited, no data, and network failure.

## Implementation Plan

### Phase 1: Manifest, OAuth, And API Boundary

- Add the `identity` and `storage` permissions to the Manifest V3 configuration.
- Add OAuth client configuration and the read-only Search Console scope.
- Add Google API host access required for Search Console requests.
- Create typed message contracts between the panel and background service worker for sign-in, sign-out, property discovery, preference reads/writes, and page report queries.
- Implement background-side token acquisition and token removal/retry behavior for expired or revoked tokens.

### Phase 2: GSC Data Model And API Client

- Define GSC property, filter, report row, report response, and error types.
- Implement `sites.list` property discovery.
- Implement best-match property selection for the target URL, preferring the longest matching URL-prefix property and then matching domain properties.
- Implement Search Analytics report requests with `query` dimension, `page` filter, configurable date range, search type, optional country/device filters, `rowLimit: 50`, and default sort by clicks.
- Normalize API rows into UI-ready fields: query, clicks, impressions, CTR percentage, and average position.

### Phase 3: Preferences And Memory Cache

- Store selected property preference per site/page host in `chrome.storage.local`.
- Store last-used GSC filters in `chrome.storage.local`.
- Add an in-memory cache keyed by selected property, target page URL, date range, search type, country, and device.
- Enforce a maximum 15-minute TTL and clear cached rows on sign-out or account/token changes.
- Ensure cached GSC rows are never written to persistent extension storage.

### Phase 4: Top-Level Tabbed Sidebar UI

- Wrap existing status, page metadata, summary, filters, Tree/Source/Findings tabs, and views in an `On-page` top-level tab panel.
- Add a `GSC` top-level tab panel with connection state, target URL, selected property, filters, refresh action, cache freshness, and a keyword table.
- Keep the existing structured-data internal tabs operational only inside the `On-page` tab.
- Make top-level tabs keyboard-accessible with correct `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, and focus behavior.
- Add empty/error states for signed out, missing page analysis, no accessible property, denied access, no data, and API failure.

### Phase 5: Current Page Integration

- Reuse the current analysis result to determine the GSC target URL: canonical URL if present, otherwise current active tab URL.
- Detect when the active page changes and invalidate or refresh the GSC tab state for the new target URL.
- If canonical URL and current tab URL differ, show the selected target URL clearly in the GSC tab.
- If the chosen canonical URL does not match an accessible property, surface the mismatch and let users pick another property or fall back to the current URL only in a later enhancement.

### Phase 6: Verification, Store, And Documentation

- Update package tests so local-only assertions apply to the `On-page` analysis path while allowing explicit GSC calls from the background service worker.
- Add unit tests for property matching, cache key generation, TTL expiration, preference serialization, and report normalization.
- Add background/API tests with mocked `chrome.identity`, `chrome.storage`, and `fetch`.
- Add DOM/package tests for the top-level tab shell and GSC required controls/states.
- Update Chrome Web Store permission justifications and privacy copy to disclose optional authenticated Google Search Console access.

## Implementation Checklist

- [x] Create GSC TypeScript types for auth state, properties, filters, rows, responses, and errors.
- [x] Add `identity` and `storage` permissions to `public/manifest.json`.
- [x] Add OAuth client metadata and `https://www.googleapis.com/auth/webmasters.readonly` scope to the manifest.
- [x] Add required Google API host access for Search Console requests.
- [x] Define panel-to-background runtime message contracts for all GSC actions.
- [x] Implement OAuth token acquisition in the background service worker.
- [x] Implement sign-out/token removal behavior.
- [x] Implement Search Console property discovery via `sites.list`.
- [x] Implement best-match property selection for URL-prefix and domain properties.
- [x] Implement preference storage for selected property per site and last-used filters.
- [x] Implement Search Analytics query requests for target page URLs.
- [x] Implement date range, search type, country, and device filter handling.
- [x] Normalize query rows into clicks, impressions, CTR, and average position fields.
- [x] Implement 15-minute in-memory response cache with cache-key coverage for all filters.
- [x] Clear GSC memory cache on sign-out and account/token changes.
- [x] Add top-level `On-page` and `GSC` tabs in `public/panel.html`.
- [x] Move existing structured-data UI into the `On-page` top-level tab panel.
- [x] Add GSC connection controls, property selector, target URL display, filters, refresh control, and table shell.
- [x] Render GSC signed-out, loading, no-property, no-data, cached, and error states.
- [x] Preserve the existing Tree, Source, and Findings internal tabs inside `On-page`.
- [x] Update CSS for nested tab layout and narrow side panel widths.
- [x] Update package tests for new permissions and the allowed GSC network boundary.
- [x] Add tests for GSC property matching.
- [x] Add tests for cache TTL and cache invalidation.
- [x] Add tests for preference persistence without persisting GSC rows.
- [x] Add tests for Search Analytics request construction and response normalization.
- [x] Add tests for GSC tab shell and required controls.
- [x] Update README feature notes and privacy wording.
- [x] Update Chrome Web Store prep documentation for OAuth, GSC scope, Google API calls, and storage behavior.

## Acceptance Criteria

- The side panel has two top-level tabs: `On-page` and `GSC`.
- The `On-page` tab preserves the existing structured-data analysis experience, including page data, summary, filters, Tree, Source, and Findings.
- The `GSC` tab prompts unauthenticated users to connect Google Search Console.
- After OAuth approval, the extension can list accessible GSC properties and auto-select the best match for the current page.
- The GSC report targets the canonical URL when available and the active tab URL otherwise.
- The default GSC report shows the top 50 queries for the page over the last 28 days, sorted by clicks.
- The table displays query, clicks, impressions, CTR, and average position.
- Users can change date range, search type, country, and device filters.
- Selected property and last-used filters persist between browser sessions.
- GSC report rows are cached in memory for no more than 15 minutes and are not persisted to extension storage.
- Signing out removes the OAuth token and clears any in-memory GSC report cache.
- The extension does not send on-page structured-data analysis results anywhere except for the explicit GSC page URL used in authenticated Search Console API requests.
- `npm run check` passes after implementation.

## Verification

- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.
- Run `npm run check`.
- Manually load `dist/` as an unpacked Chrome extension.
- Manually verify top-level tab keyboard and mouse behavior.
- Manually verify OAuth sign-in, token reuse, and sign-out.
- Manually verify a page with an accessible URL-prefix property.
- Manually verify a page with an accessible domain property.
- Manually verify a page with a canonical URL different from the current tab URL.
- Manually verify no accessible property, no data, denied scope, and expired-token states.
- Inspect `chrome.storage.local` and confirm only preferences are stored, not GSC result rows.
- Inspect network behavior and confirm GSC network calls are limited to authenticated Google Search Console API requests.

## Risks And Mitigations

- OAuth client setup can block local development or store release. Mitigate by documenting required Google Cloud OAuth client setup and using separate development/release client IDs if needed.
- Chrome Web Store review may scrutinize the new OAuth scope and Google API network calls. Mitigate with read-only scope, clear UI consent, updated permission justification, and precise privacy copy.
- Manifest V3 service workers can suspend and clear memory cache earlier than 15 minutes. Mitigate by treating 15 minutes as a maximum TTL and allowing refetch when cache is gone.
- Search Console data may be delayed or unavailable for the current page. Mitigate with clear date range, no-data states, and API error details that do not expose tokens.
- Canonical URLs may point to a different property than the active tab. Mitigate by showing the target URL and property selector before querying.
- Country/device filter values can be confusing. Mitigate with simple `All` defaults and labels that match Search Console terminology.
- API quota or rate limiting may occur during repeated navigation. Mitigate with debounced requests, explicit refresh, and memory cache.

## Dependencies

- Google Cloud OAuth client configured for the Chrome extension.
- Chrome Web Store extension ID for production OAuth configuration.
- User Google account with access to at least one Search Console property.
- Google Search Console API availability and quota.
- Updated Chrome Web Store privacy and permission disclosures before release.

## Open Questions

- Which exact Search Console search type options should be exposed if Google changes available API values?
- Should a future release support querying both canonical and current URLs when they differ?
