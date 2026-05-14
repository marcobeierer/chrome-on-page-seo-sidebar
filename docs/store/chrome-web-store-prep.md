# Chrome Web Store Preparation

## Listing Draft

- Name: On-Page SEO Sidebar
- Short description: Inspect and validate on-page structured data locally from Chrome's side panel.
- Category: Developer Tools or Productivity
- Primary audience: In-house SEO teams checking structured data and page-level Search Console performance during page QA.

## Permission Justification

- Requested permissions: `sidePanel`, `scripting`, `tabs`, `identity`, `storage`, Google API host access, and optional page host access.
- Side panel access: required to open the extension as a browser sidebar from the toolbar.
- Scripting and host access: required to analyze structured data from the active page DOM across public sites, staging sites, SPAs, and localhost.
- Tabs access: required to detect active-tab changes and navigation so analysis stays current in the sidebar.
- Identity access: required for optional Google OAuth sign-in to Google Search Console.
- Storage access: required to remember non-sensitive GSC preferences such as selected property and filters.
- Google API host access: required to call Google Search Console APIs after explicit user sign-in.
- Search Console OAuth scope: `https://www.googleapis.com/auth/webmasters.readonly` for read-only Search Console property and Search Analytics data.
- Remote code: none.

## Google OAuth Client Setup

The GSC integration uses Chrome Identity API via `chrome.identity.getAuthToken`. Users must have Chrome browser sign-in enabled and must sign into Chrome with a Google account that has Search Console access. The OAuth client must be a Google Cloud `Chrome Extension` OAuth client tied to the extension ID.

### Get The Extension ID

For local unpacked testing:

- Run `npm run build`.
- Open `chrome://extensions` in Chrome.
- Enable Developer mode.
- Click `Load unpacked`.
- Select the repository's `dist/` folder.
- Copy the `ID` shown on the extension card.

For the published extension:

- Open the Chrome Web Store Developer Dashboard.
- Open the extension item.
- Copy the extension ID from the dashboard details or from the Chrome Web Store URL.

Current production extension ID:

```text
jlcmjobmcfmldeafdnolahifcfajegah
```

Current OAuth client ID:

- `69058266264-ld7v1ub46c76dicqgi0ul04hknq611ti.apps.googleusercontent.com`

Unpacked extension IDs can change unless the extension key is pinned. Use a stable ID for repeatable OAuth testing, or create the production OAuth client with the published Chrome Web Store extension ID.

### Create The OAuth Client

- Open Google Cloud Console.
- Select or create the project used for this extension.
- Enable the Google Search Console API.
- Go to `APIs & Services` > `Credentials`.
- Create an OAuth client ID.
- Choose `Chrome Extension` as the application type.
- Paste the Chrome extension ID.
- Copy the generated OAuth client ID.
- Add it to `public/manifest.json` under `oauth2.client_id`.

`public/manifest.json` contains the OAuth client ID:

```json
"client_id": "69058266264-ld7v1ub46c76dicqgi0ul04hknq611ti.apps.googleusercontent.com"
```

The build copies this value into `dist/manifest.json`.

Build behavior:

- `npm run build` creates the unpacked extension in `dist/`.
- `npm run package:store` runs the same build before creating the store zip.

Do not load or submit `public/manifest.json` directly; load or package the generated `dist/` output.

### Local OAuth Troubleshooting

- Chrome browser sign-in must be enabled for `chrome.identity.getAuthToken`.
- If Chrome reports `The user turned off browser signin`, enable Chrome sign-in in Chrome settings and sign into Chrome before connecting GSC.
- If Google reports a client mismatch, confirm the OAuth client type is `Chrome Extension` and the exact extension ID matches `chrome://extensions`.
- If using an unpacked extension, confirm the extension ID has not changed since creating the OAuth client.

## Privacy Statement Draft

On-Page SEO Sidebar does not sell or share user data. Structured data analysis runs locally in the browser against the active tab's current DOM. Page content, schema data, findings, and on-page analysis results are not sent to external services and are not stored after the side panel/page session ends.

If the user connects Google Search Console, the extension uses Google's read-only Search Console API to list accessible properties and request page-level Search Analytics rows for the selected page URL. Search Console report rows are cached in memory for up to 15 minutes and are not written to extension storage. The extension may store non-sensitive GSC preferences such as selected property and filters locally in Chrome storage.

## Manual QA Checklist

- Load `dist/` as an unpacked extension in latest stable Chrome.
- Open the side panel on a public page with JSON-LD and verify the panel detects sources, entities, raw JSON, and findings.
- Open the side panel on a page with malformed JSON-LD and verify an error includes raw parser detail plus a friendly hint.
- Open a Microdata fixture/page and verify entity properties, source display, and Google findings.
- Open an RDFa fixture/page and verify entity properties, source display, and Google findings.
- Test an SPA route transition and verify analysis updates automatically after the URL changes.
- Test localhost and an authenticated staging page.
- Connect a Google account with Search Console access and verify property discovery, page query rows, date range, search type, country, and device filters.
- Verify GSC sign-out clears visible report data and cached rows.
- Confirm the extension package uses only the declared side panel, scripting, tabs, identity, storage, page host, and Google API permissions.
- Confirm the panel bundle makes no direct network calls and GSC API calls are centralized in the background service worker.
- Capture screenshots for the summary, findings, tree, and source views before submission.

## Release Checklist

- Run `npm run check`.
- Run `npm audit`.
- Build and package with `npm run package:store`.
- Upload the generated zip from `release/`.
- Review `public/manifest.json` for minimal permissions.
- Review `dist/manifest.json` after `npm run build` and confirm it contains the expected OAuth client ID.
- Review bundled Google rich result rules against current Google Search Central docs.
- Add final screenshots, icon assets, listing copy, and privacy disclosure in Chrome Web Store Developer Dashboard.
