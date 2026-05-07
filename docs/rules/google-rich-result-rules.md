# Google Rich Result Rules

## Scope

The bundled Google rich result rules in `src/rules/googleRichResults.ts` are local validation metadata for the sidebar Findings tab.

## Current Status

- Rule status: `partial`
- Last reviewed date: stored per rule in the catalog
- Findings reliability: work in progress and not manually verified yet

## Maintenance Rules

- Every rule must include a Google Search Central source URL.
- Every rule must include a `lastReviewed` date.
- Rules remain `partial` until manually checked against representative real-world pages and Google documentation.
- Keep the Findings reliability note visible while any major rule coverage remains `partial`.
- Prefer fixture coverage for each rich result type before changing a rule to `verified`.

## Manual Review Checklist

- Compare required fields against the current Google documentation.
- Compare recommended fields against the current Google documentation.
- Check value-shape assumptions for dates, URLs, images, ratings, prices, and nested objects.
- Add or update fixture pages for the rule type.
- Record the new `lastReviewed` date.
- Update `notes` with known limitations.
