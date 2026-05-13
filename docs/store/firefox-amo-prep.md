# Firefox Add-ons Preparation

## Listing Draft

- Name: On-Page SEO Sidebar
- Short description: Inspect and validate on-page structured data locally from Firefox's sidebar.
- Category: Developer Tools or Productivity
- Primary audience: In-house SEO teams checking structured data during page QA.

## Permission Justification

- Requested permissions: `scripting`, `tabs`, and optional `http://*/*` / `https://*/*` host access.
- Sidebar access: provided through Firefox `sidebar_action` so the tool can run beside the active page.
- Scripting and host access: required to analyze structured data from the active page DOM across public sites, staging sites, SPAs, and localhost.
- Tabs access: required to detect active-tab changes and navigation so analysis stays current in the sidebar.
- Data collection permissions: none required and none optional; the extension does not collect or transmit user data.
- Remote code: none.

## Privacy Statement Draft

On-Page SEO Sidebar does not collect, transmit, sell, or share user data. Structured data analysis runs locally in the browser against the active tab's current DOM. Page content, URLs, schema data, findings, and analysis results are not sent to external services and are not stored after the sidebar/page session ends.

## Manual QA Checklist

- Load `dist/firefox/` as a temporary add-on in latest stable Firefox from `about:debugging`.
- Open the sidebar on a public page with JSON-LD and verify the panel detects sources, entities, raw JSON, and findings.
- Open the sidebar on a page with malformed JSON-LD and verify an error includes raw parser detail plus a friendly hint.
- Open a Microdata fixture/page and verify entity properties, source display, and Google findings.
- Open an RDFa fixture/page and verify entity properties, source display, and Google findings.
- Test an SPA route transition and verify analysis updates automatically after the URL changes.
- Test localhost and an authenticated staging page.
- Confirm permission-denied and restricted-page messages are browser-neutral and actionable.
- Confirm the extension package uses only the declared sidebar, scripting, tabs, and host access permissions and makes no network calls from the panel bundle.

## Release Checklist

- Run `npm run check`.
- Build and package with `npm run package:firefox`.
- Run `npm run lint:firefox`.
- Upload the generated Firefox zip from `release/`.
- Review `dist/firefox/manifest.json` for minimal permissions and AMO-ready `browser_specific_settings.gecko` metadata.
- Review bundled Google rich result rules against current Google Search Central docs.
- Add final screenshots, icon assets, listing copy, and privacy disclosure in AMO.
