# On-Page SEO Sidebar

Chrome side panel extension for local on-page SEO structured data QA.

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/on-page-seo-sidebar/jlcmjobmcfmldeafdnolahifcfajegah).

## Current Features

- Manifest V3 side panel opened from the toolbar.
- Automatic current-DOM analysis from the active tab, with manual refresh available.
- Page title, meta description, canonical, and hreflang extraction.
- JSON-LD extraction with malformed JSON-LD parser findings.
- Microdata and RDFa extraction from rendered DOM markup.
- Normalized schema tree with graph links where identifiers are available.
- Bundled Google rich result rule catalog with errors, warnings, and info findings.
- Summary dashboard, findings view, tree view, source view, and search/filter controls.
- Local-only analysis with no extension network calls or telemetry.

## Development

Install dependencies:

```sh
npm install
```

Run the full verification suite:

```sh
npm run check
```

Build the unpacked extension:

```sh
npm run build
```

Load `dist/` as an unpacked extension in Chrome, then click the extension toolbar button to open the `On-Page SEO Sidebar` side panel.

Use Chrome's extension activation shortcut settings at `chrome://extensions/shortcuts` if you want to open it from the keyboard.

## Notes

- Results are session-only.
- Original HTML comparison is intentionally deferred; the current DOM is the source of truth.
- The Google rule catalog is bundled and should be reviewed when Google Search Central documentation changes.
