# Chrome Web Store Preparation

## Listing Draft

- Name: On-Page SEO Sidebar
- Short description: Inspect and validate on-page structured data locally from Chrome's side panel.
- Category: Developer Tools or Productivity
- Primary audience: In-house SEO teams checking structured data during page QA.

## Permission Justification

- Requested permissions: `sidePanel`, `scripting`, `tabs`, and `<all_urls>` host access.
- Side panel access: required to open the extension as a browser sidebar from the toolbar.
- Scripting and host access: required to analyze structured data from the active page DOM across public sites, staging sites, SPAs, and localhost.
- Tabs access: required to detect active-tab changes and navigation so analysis stays current in the sidebar.
- Remote code: none.

## Privacy Statement Draft

On-Page SEO Sidebar does not collect, transmit, sell, or share user data. Structured data analysis runs locally in the browser against the active tab's current DOM. Page content, URLs, schema data, findings, and analysis results are not sent to external services and are not stored after the side panel/page session ends.

## Manual QA Checklist

- Load `dist/chrome/` as an unpacked extension in latest stable Chrome.
- Open the side panel on a public page with JSON-LD and verify the panel detects sources, entities, raw JSON, and findings.
- Open the side panel on a page with malformed JSON-LD and verify an error includes raw parser detail plus a friendly hint.
- Open a Microdata fixture/page and verify entity properties, source display, and Google findings.
- Open an RDFa fixture/page and verify entity properties, source display, and Google findings.
- Test an SPA route transition and verify analysis updates automatically after the URL changes.
- Test localhost and an authenticated staging page.
- Confirm the extension package uses only the declared side panel, scripting, tabs, and host access permissions and makes no network calls from the panel bundle.
- Capture screenshots for the summary, findings, tree, and source views before submission.

## Release Checklist

- Run `npm run check`.
- Run `npm audit`.
- Build and package with `npm run package:chrome` or `npm run package:store`.
- Upload the generated zip from `release/`.
- Review the generated `dist/chrome/manifest.json` for minimal permissions.
- Review bundled Google rich result rules against current Google Search Central docs.
- Add final screenshots, icon assets, listing copy, and privacy disclosure in Chrome Web Store Developer Dashboard.
