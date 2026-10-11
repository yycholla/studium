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
