# Design QA

Date: 2026-10-11. Final result: passed

## Visual truth and evidence

The exact approved input was `upload/image-edit-target-4eab9996bae05443.png` in the working session. It was opened and inspected before implementation. Its durable optimized copy is [selected-reference.webp](docs/design/selected-reference.webp). The target combines the approved forest botanical direction with the first concept's sidebar/grid and the second concept's clearer copy/icons; list view is an additional required presentation.

The browser ran the real Topcoat static export through a temporary development-server adapter. No React reconstruction was used. Final implementation evidence is [implementation-grid.webp](docs/design/implementation-grid.webp). The full-view [comparison](docs/design/comparison-full.webp) places the source above the implementation; the [focused comparison](docs/design/comparison-focus.webp) covers the title, search/filter/view controls, top-right foliage, and first card row.

Source: 1487 × 1058 pixels, normalized to 1296 × 922. Implementation: a 1440 × 1024 CSS iframe viewport, rendered at 0.9 scale within a 1363 × 936 browser capture, cropped to the 1296 × 922 content region. Capture density was 1; the source normalization is approximately 0.872. Both comparisons use equal content dimensions, with no browser chrome or adapter padding included. State: Chatpendium, all categories, empty search, ASCII off, no favorites, Grid selected, first 12 of 54 expressions, first expression highlighted.

## Findings

No actionable P0/P1/P2 findings remain after the final full-view and focused comparisons.

| Surface | Assessment |
| --- | --- |
| Typography | Large Georgia title and uppercase wordmark retain the bookish hierarchy. Source Sans 3 provides consistent small controls and raw expressions. Both locally served weights load. The title's initial undersizing was corrected. Literal strings use actual catalog spacing rather than generated mock glyphs. |
| Layout and spacing | The 296px sidebar, three-column grid, compact header, aligned search controls, restrained 4px corners, and fine rules retain the reference's proportions. The real 54-entry catalog retains pagination and help, adding document height beyond the concept. |
| Colors and states | Forest backgrounds, warm paper text, moss selection, brass borders, and sage copy/focus treatment match the reference direction. Active controls also expose pressed/current states. |
| Images and icons | Original transparent botanical raster assets match the approved leaf treatment without stretching or visible transparency halos. Phosphor library icons provide a consistent light stroke; filled stars remain accessible. Both WebP images load from the export and embedded server routes. |
| Copy and content | The reference's heading, description, prompt, category labels, names, and anonymous-use message are retained. Raw expressions and compatibility constraints come from the existing validated catalog. The redundant chat preview is removed. |
| Responsive behavior | Grid and single-column list tested at desktop, 768px, 390px, and 320px. Controls remain reachable, and measured visible cards have no horizontal content overflow. Mobile categories deliberately scroll horizontally. |

## Comparison history

1. Initial desktop comparison identified a narrower sidebar and lower card density than the approved reference (P2). Sidebar width changed from 276px to 296px, card minimum height to 134px, and card names to 17px. A fresh full and focused capture verified the revised layout.
2. The focused comparison identified an undersized title (P2). The desktop catalog title now scales to 78px with a 1.04 line height; mobile retains 40px. The final focused comparison shows the restored title hierarchy.
3. Responsive review found list view inherited the grid columns from the higher-priority responsive CSS layer (P2). A final responsive `#results[data-view='list']` rule enforces one column. Fresh 320px and 390px review found no card overflow; [the final 390px list capture](docs/design/implementation-mobile-list.webp) shows readable names and reachable favorite/copy controls. Tablet grid and list also have no measured card overflow.

## Browser interactions and console

Checked Grid/List switching and reload persistence, search, category and ASCII filters, empty-state reset, favorites and count/filter updates, copying with the manual-copy dialog, and hub/account navigation. The isolated HTTP preview lacks browser clipboard access, so successful exact-string clipboard writes are covered by the DOM suite; manual copying was verified in the browser. The account page handles unavailable preview service endpoints and keeps the catalog link usable. No live OAuth or in-game chat validation was attempted.

Checked captured warning/error console entries. There were no application-origin warnings or errors. The cloud browser emitted extension metadata errors from `chrome-extension://…/content-script.bundle.js`; these belong to the browser extension, not the site.

## Automated validation

- `cargo fmt --check` and `cargo test --workspace --locked`: passed (13 Rust tests).
- `node tests/dom.mjs`: passed (8 tests), including exact Unicode copying, favorites, blocked storage, grid/list restoration, and cross-tab preference reset.
- `node tests/account-dom.mjs`: passed (4 tests).
- `node tests/auth.mjs`: passed (10 tests).
- `node tests/deploy.mjs`: passed (4 tests).
- JavaScript syntax checks for the app and updated browser suite: passed.
- Static export and `npm run deploy:check`: passed; dry run only.
- `git diff --check`: passed.

The standalone Playwright suite was updated for the new controls but not executed in this session. Browser interaction and responsive checks used the cloud browser. OS font fallback and actual FFXIV rendering remain environment-dependent.

## Follow-up polish

P3: The reference contains faint paper grain and tiny rule-end ornaments; these are omitted from the implementation. The generated branch follows the same botanical treatment but is not a pixel-identical extraction. The real catalog includes Show more and accessible compatibility help below the grid, so the footer is lower than the mock. These differences do not block the approved baseline or browsing behavior.

## Implementation checklist

- [x] Use the exact selected reference and generate fitting botanical assets.
- [x] Implement the sidebar, both catalog presentations, persistence, and clearer copy.
- [x] Embed and export local images, fonts, and library icons.
- [x] Fix P2 differences and repeat full/focused and responsive review.
- [x] Document the reusable baseline and run regression checks.

Final result: passed

## Favicon and tool-tile follow-up

Added the generated simplified sprig favicon in a 64px PNG plus an ICO containing 16, 32, 48, and 64px images. Inspected the actual 16px variant enlarged without smoothing to confirm its recognizable leaf silhouette. Both assets are embedded with their correct content types and emitted byte-for-byte by the exporter; all five HTML pages include the shared icon links. The generated source and exact production prompt are described in `docs/DESIGN.md`.

Restored the Chatpendium tile's original angled/staggered expression arrangement, distinct gold/sage/rose accents, and added the existing botanical branch as a quiet backdrop. The [updated All tools browser capture](docs/design/implementation-hub.webp) is 1363 × 936 pixels at a 1363 × 936 CSS viewport, density 1. Also inspected the hub at 390px: no horizontal page overflow, and the bounding boxes of all three expressions remain inside the illustration. The tile still links to Chatpendium.

Reran all 13 Rust tests (including favicon response types/signatures), formatting, static export, and whitespace checks. Final result: passed


## Character portrait and account menu

Result: passed. The approved botanical reference remains the baseline. The user-authorized change replaces the header note and central Account link with a top-right character portrait control; the sidebar, grid/list layouts, favicon, and expressive tool tile remain consistent with the selected direction. Added Phosphor library symbols without modifying their paths.

The [desktop capture](docs/design/implementation-header-character.webp) shows the actual exported All tools page at 1363 × 936 CSS pixels, density 1, with the character menu open. The [mobile capture](docs/design/implementation-header-character-mobile.webp) shows the actual Chatpendium page inside a 320 × 740 CSS viewport; the outer QA frame was cropped away. Captures use an isolated development account fixture with a public XIVAuth test headshot and a sample character without an image. They demonstrate signed-in UI, not a real production sign-in. No fixture adapter or sample account data is shipped.

Compared the approved baseline and current rendering at full page and focused header scales. Brass portrait rims, forest menu surfaces, sage selection, editorial type, and licensed line icons fit the existing design. The new menu stays above decorative foliage. Fixed a P2 narrow-screen issue: the portrait originally wrapped below the wordmark at 320px; a compact wordmark now keeps both in the top row. No remaining P0–P2 visual findings.

Browser checks: real portrait loaded at 256px natural width, selection updated the header and returned focus, ArrowDown opened the picker, Escape dismissed it, sign-out removed names and portraits and exposed Sign in, and account-page portraits rendered. At 320px and 768px, document scroll width equals client width and the menu stays inside the viewport. Application browser warnings/errors: none.

Validation: 13 Rust tests; 15 auth/SQLite tests including migration preservation and URL validation; Workers runtime callback/redirect tests; 4 deployment tests; 8 catalog DOM tests; 9 account/header DOM tests including hostile/missing/broken portraits, CSRF selection, duplicate submission, empty characters, failed selection, keyboard dismissal, sign-out, and expired-session cleanup. Formatting, JavaScript syntax, static export, whitespace checks, and Wrangler deployment dry run passed. Local tests use mock provider responses; live OAuth consent and production D1 were not exercised.

Deployment requirement: apply migration 0002 before the updated Worker (the existing main-branch workflow applies pending migrations). Existing records remain valid and receive portraits on next sign-in or Refresh characters. No new OAuth scopes or stored provider tokens.
