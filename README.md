# On-Page SEO Sidebar

Chrome DevTools extension for local on-page SEO structured data QA.

## Current Features

- Manifest V3 DevTools panel.
- Automatic current-DOM analysis from the inspected page, with manual refresh available.
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

Load `dist/` as an unpacked extension in Chrome, then open DevTools and select the `On-Page SEO` panel.

## Notes

- Results are session-only.
- Original HTML comparison is intentionally deferred; the current DOM is the source of truth.
- The Google rule catalog is bundled and should be reviewed when Google Search Central documentation changes.
