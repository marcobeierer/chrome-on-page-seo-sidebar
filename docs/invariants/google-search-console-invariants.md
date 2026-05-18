# Google Search Console Invariants

## Scope

These invariants apply to the optional Google Search Console integration in the Chrome side panel extension, including OAuth, property discovery, Search Analytics requests, caching, preference storage, and GSC tab display.

## Invariants

### GSC Access Is Explicit And Read-Only

- Rule: The extension may access Search Console only after the user explicitly connects a Google account, and it must request only read-only Search Console access.
- Why: GSC contains private site performance data, and the extension only needs to display metrics.
- Enforced in: Manifest OAuth scopes, background auth flow, UI copy, and Chrome Web Store disclosures.
- Verified by: Manifest review, OAuth consent review, package tests, and manual sign-in QA.
- Edge cases: Reauth for expired or revoked tokens is allowed; write scopes are not allowed for this feature.

### On-Page Analysis Remains Local-Only

- Rule: Structured-data extraction, metadata extraction, findings generation, and source rendering must continue to run locally without sending page content or analysis results to external services.
- Why: Existing privacy guarantees for authenticated staging pages and local QA must remain valid outside the explicit GSC API feature.
- Enforced in: Analysis pipeline, panel rendering, background message boundaries, and network tests.
- Verified by: Code review and tests confirming only the GSC background path performs Google API requests.
- Edge cases: The GSC tab may send the selected page URL as a Search Analytics page filter to Google after the user connects GSC.

### GSC Network Calls Stay In The Background Boundary

- Rule: GSC OAuth and Search Console API requests must be centralized in the background service worker, not scattered through panel rendering code.
- Why: A single network boundary makes permissions, token handling, cache behavior, testing, and privacy review simpler.
- Enforced in: Runtime message contracts and background API client modules.
- Verified by: Package tests and code review checking that panel code sends typed messages instead of calling `fetch` for GSC.
- Edge cases: The background service worker may be suspended by Chrome; callers must tolerate refetching after restart.

### Canonical URL Is The Primary GSC Target

- Rule: The GSC report must query the page canonical URL when one is present; otherwise it must query the active tab URL.
- Why: SEO reporting should align with the URL Google is expected to index and report for the page.
- Enforced in: GSC target URL selection logic using the current analysis result.
- Verified by: Unit tests for canonical/current URL selection and manual QA on pages with canonical URLs.
- Edge cases: If the canonical URL cannot be matched to an accessible property, the UI must explain the mismatch and allow property override rather than silently querying an unrelated property.

### Property Selection Is User-Visible

- Rule: The extension may auto-select the best matching Search Console property, but the selected property must be visible and overrideable before or while viewing GSC data.
- Why: Users can have overlapping URL-prefix and domain properties, and wrong property selection can produce empty or misleading reports.
- Enforced in: Property discovery, matching logic, and GSC tab controls.
- Verified by: Unit tests for property matching and manual QA with overlapping properties.
- Edge cases: Prefer the longest matching URL-prefix property, then matching domain properties; if no property matches, show a no-property state.

### GSC Reports Are Page-Scoped

- Rule: The default GSC report must query Search Analytics rows for the selected page URL, not property-wide keyword data.
- Why: The sidebar is page-contextual and should answer which queries the current page ranks for.
- Enforced in: Search Analytics request construction with a page filter and `query` dimension.
- Verified by: Request-construction tests and manual API inspection.
- Edge cases: Future property-wide dashboards require a separate plan and UI surface.

### Default Report Shape Is Stable

- Rule: The default keyword table must show the top 50 queries sorted by clicks, with clicks, impressions, CTR, and average position.
- Why: These metrics are enough to answer the first page-ranking question without turning the sidebar into a full analytics dashboard.
- Enforced in: API request row limit, normalization, and table rendering.
- Verified by: Unit tests for request defaults and UI tests for column presence.
- Edge cases: Users may change filters, but the default row limit and columns should remain stable unless explicitly redesigned.

### Required GSC Filters Are Available

- Rule: The GSC tab must provide filters for date range, search type, country, and device.
- Why: Search Console metrics are only meaningful with visible query context and segmentation controls.
- Enforced in: GSC tab UI state and Search Analytics request construction.
- Verified by: UI/package tests for controls and request tests for filter mapping.
- Edge cases: Each filter should support an `All` or default state where the Search Console API permits it.

### GSC Result Rows Are Not Persisted

- Rule: Search Console report rows must not be written to persistent extension storage.
- Why: Query and performance rows can reveal sensitive business information and should not become stored history.
- Enforced in: Cache implementation and storage access modules.
- Verified by: Tests for storage writes and manual inspection of `chrome.storage.local`.
- Edge cases: In-memory cache is allowed for up to 15 minutes; Chrome may clear it earlier by suspending the service worker.

### GSC Cache Has A Maximum 15-Minute TTL

- Rule: GSC API responses may be cached in memory for no longer than 15 minutes per property, target URL, and filter set.
- Why: Short caching reduces repeated API calls while keeping data fresh and non-persistent.
- Enforced in: Background cache key and TTL handling.
- Verified by: Unit tests for cache hit, expiration, and invalidation.
- Edge cases: Sign-out, account changes, token removal, or filter changes must bypass or clear stale cache entries.

### Only Preferences Persist

- Rule: The extension may persist selected property preferences and last-used GSC filters, but not OAuth tokens or GSC report rows.
- Why: Preferences improve usability without retaining sensitive query performance data.
- Enforced in: `chrome.storage.local` schema and Chrome Identity API token handling.
- Verified by: Storage tests and manual storage inspection.
- Edge cases: Chrome may cache OAuth tokens outside extension storage. Explicit sign-out must remove the cached auth token where Chrome Identity APIs allow it.

### GSC Error States Are Actionable

- Rule: Signed-out, no-property, no-data, denied-access, quota/rate-limit, expired-token, and network-failure states must render as clear GSC tab states.
- Why: Search Console availability depends on user account, site permissions, API quota, and reporting delays.
- Enforced in: Background error normalization and GSC tab rendering.
- Verified by: Unit tests with mocked API errors and manual QA.
- Edge cases: Error UI must not expose OAuth tokens, raw credentials, or unnecessarily verbose API internals.

## Cross-References

- Related plan: `docs/plans/google-search-console-integration-plan.md`
- Existing schema invariants: `docs/invariants/chrome-extension-schema-invariants.md`
