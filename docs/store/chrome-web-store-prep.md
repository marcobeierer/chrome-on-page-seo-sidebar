# Chrome Web Store Preparation

## Listing Draft

- Name: On-Page SEO Sidebar
- Short description: Inspect and validate on-page structured data locally from Chrome DevTools.
- Category: Developer Tools or Productivity
- Primary audience: In-house SEO teams checking structured data during page QA.

## Permission Justification

- Requested permissions: none beyond the Manifest V3 DevTools panel entry.
- DevTools access: required to create the `On-Page SEO` panel and evaluate the current inspected page DOM when analysis runs.
- Host permissions: none in the first release.
- Remote code: none.

## Privacy Statement Draft

On-Page SEO Sidebar does not collect, transmit, sell, or share user data. Structured data analysis runs locally in the browser against the currently inspected page DOM. Page content, URLs, schema data, findings, and analysis results are not sent to external services and are not stored after the DevTools/page session ends.

## Manual QA Checklist

- Load `dist/` as an unpacked extension in latest stable Chrome.
- Open DevTools on a public page with JSON-LD and verify the panel detects sources, entities, raw JSON, and findings.
- Open DevTools on a page with malformed JSON-LD and verify an error includes raw parser detail plus a friendly hint.
- Open a Microdata fixture/page and verify entity properties, source display, and Google findings.
- Open an RDFa fixture/page and verify entity properties, source display, and Google findings.
- Test an SPA route transition and verify analysis updates automatically after the URL changes.
- Test localhost and an authenticated staging page.
- Confirm the extension package has no host permissions and no network calls from the panel bundle.
- Capture screenshots for the summary, findings, tree, and source views before submission.

## Release Checklist

- Run `npm run check`.
- Run `npm audit`.
- Build with `npm run build`.
- Zip the contents of `dist/`, not the project root.
- Review `public/manifest.json` for minimal permissions.
- Review bundled Google rich result rules against current Google Search Central docs.
- Add final screenshots, icon assets, listing copy, and privacy disclosure in Chrome Web Store Developer Dashboard.
