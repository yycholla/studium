# The Studium

An FFXIV companion hub for `studium.yycholla.com`. Its first tool, **Chatpendium**, is a searchable library of text expressions at `/chatpendium`. The home page at `/` introduces the collection and links to each tool. Built with **Rust and Topcoat**, with server-rendered HTML, CSS, and a small vanilla JavaScript enhancement. No Node build, database, account, game plugin, or external runtime service is required.

An optional [Chatpendium Dalamud companion](plugin/README.md) adds an in-game picker and Chat 2 context menu, using a Rust core with a C# adapter. The website remains usable on its own.

## Development environment and automatic deployment

Run `devenv shell` for the project's Rust, Node, npm, and supporting tools. Wrangler and jsdom are installed from the npm lockfile. Use `studium-dev`, `studium-check`, `studium-build`, or `studium-deploy` inside the shell.

GitHub Actions runs the same devenv checks, then applies D1 migrations and deploys successful `main` builds to Cloudflare. Add the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to enable production deployment. The XIVAuth client secret stays in the Cloudflare Worker.

See [development and deployment setup](deploy/DEVELOPMENT.md) for commands, permissions, and first-time configuration.

## Run

Install Rust **1.95 or newer** and a native C linker, then:

```sh
cargo run --locked
```

Open <http://localhost:3000>. `HOST` defaults to `127.0.0.1`; `PORT` defaults to `3000`. On NixOS, `nix-shell` provides the compiler and Cargo from your configured nixpkgs. For a different port:

```sh
PORT=8080 cargo run --locked
```

Topcoat is pinned to **0.5.0**, the version available in the development machine's offline cache. It is experimental; update it deliberately alongside its view/router API changes. `Cargo.lock` pins the dependency graph. This is an actual Topcoat application using `#[page]`, `#[component]`, `view!`, explicit router registration, and `topcoat::start`.

## Chatpendium features

- 54 text faces and symbols, searchable by name, mood, literal text, and aliases such as `gg`, `sprout`, or `floor tank`.
- Category filters, an ASCII-only filter, and 12-at-a-time browsing.
- Copy buttons with accessible feedback and a manual-copy dialog when clipboard permission is unavailable.
- Local favorites, including synchronization across browser tabs.
- Grid and list views, with your preference remembered on this browser.
- Shareable filter URLs, `/` to focus search, and Escape to clear it.
- Responsive layout, reduced-motion support, keyboard controls, and a selectable catalog even without JavaScript.

The approved design baseline combines a dark scholarly archive with botanical illustrations: forest surfaces, warm paper-colored text, sage selection states, restrained brass rules, and a category sidebar. The layout takes cues from FFXIV menus while using original botanical assets, locally served open-source fonts, and Phosphor icons. No game assets or proprietary fonts are bundled. See [the design baseline](docs/DESIGN.md) for tokens, component rules, copy, references, and asset provenance; [design QA](design-qa.md) records the rendered comparison and interaction checks.

## Character compatibility

Catalog entries use printable ASCII or symbols from [Levi Ash's community character inventory on the Lodestone](https://na.finalfantasyxiv.com/lodestone/character/12444232/blog/5384056/). This is a character-source constraint, **not a claim that every composition has been tested in the live game**. Source-listed characters can differ in spacing and appearance. Use the ASCII-only filter for the simplest choices.

The catalog excludes color emoji, variation selectors, combining marks, and private-use game glyphs. Private-use glyphs need a separate labeled preview strategy because a normal browser font cannot display them reliably. To extend the catalog, edit `crates/chatpendium-core/src/catalog.rs`, give each entry a stable unique ID, and add aliases. Add any new non-ASCII character to the allowlist only after finding evidence that FFXIV chat supports it. The catalog test catches unsupported characters, duplicate IDs, invalid categories, and oversized expressions.

## Check

```sh
cargo fmt --check
cargo test --workspace --locked
node --check assets/app.js
```

Optional browser regression tests require Node and Playwright (development only):

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
cargo run --locked
# In another terminal:
node tests/browser.mjs
```

Set `BASE_URL` for another port, `PLAYWRIGHT_MODULE` to reuse an installed module, or `CHROMIUM_EXECUTABLE` for an existing browser. Screenshots are written to ignored `test-results/`. The test covers search, combined filters, saved favorites, clipboard content and failure, keyboard shortcuts, empty states, shareable URLs, no-JavaScript fallback, and mobile overflow.

If the environment blocks listening ports, run `cargo run --locked --example export` and then `PREVIEW_DIR=dist node tests/browser.mjs`. This intercepts browser requests with the actual Topcoat-rendered files, rather than running a network server.

For DOM interaction checks without a browser, install `jsdom` as an optional development dependency (`npm install --no-save --package-lock=false jsdom`), export the site, and run `node tests/dom.mjs`. `JSDOM_MODULE` can point to an existing installation. These checks exercise actual rendered markup and JavaScript but cannot verify visual layout or real clipboard permissions.

The static export also emits `/api/chatpendium/v1/catalog.json` for plugin updates. Deploy the rebuilt `dist/` to make this endpoint available. Existing `/api/emoji` consumers retain their original array format.

## Deploy to studium.yycholla.com

### Cloudflare hosting (recommended)

`wrangler.jsonc` configures the Rust-rendered assets, an account Worker, and the custom domain `studium.yycholla.com`. Build and publish from your host terminal:

```sh
nix-shell --run "cargo run --locked --example export"
npx wrangler@latest login
npx wrangler@latest deploy
```

The deployment command publishes `dist/` and configures the custom domain in your Cloudflare account. No Rust server is required after export. The configuration has been prepared locally; this project has not been deployed to Cloudflare yet. Static asset requests are free under [Cloudflare's static-assets pricing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

The exported hub is `dist/index.html`; Chatpendium is `dist/chatpendium/index.html`, so both directory-based hosting and Cloudflare can serve the tool. The Rust service uses `/chatpendium`; directory-based static hosts may append a trailing slash automatically. Favorites retain their original browser storage key, preserving saved expressions on the same origin after the rename.

### XIVAuth accounts and character linking

The top-right header shows the selected character’s portrait, name, and world. Its menu switches characters and provides account management, refresh, and sign-out on every page. The `/account` page signs in through XIVAuth, lists authorized verified characters, and lets you select a character, refresh the list, sign out, or remove your Studium profile. Privacy and terms pages are available at `/privacy` and `/terms`.

Follow [the XIVAuth setup guide](deploy/XIVAUTH.md) to create an OAuth client, bind a D1 database, and add the client secret securely with Wrangler. The App ID is not the OAuth client ID. Until these are configured, sign-in is unavailable and Chatpendium remains usable anonymously. No live OAuth flow has been verified by the local test suite.

The Worker uses PKCE, browser-bound state, HttpOnly cookies, and CSRF protection. It does not store provider tokens. Favorites stay browser-local; linked characters do not include inventory or collection progress. Run `node tests/auth.mjs` with Node 24 for the authentication tests and `node tests/account-dom.mjs` after exporting the site and installing jsdom for account UI checks.

### Private Tailscale preview

The existing static export can be served directly by [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve), without running a separate web server:

```sh
# Regenerate dist/ after source changes:
cargo run --locked --example export
bash deploy/serve-tailnet.sh
```

Run the launcher from a normal host terminal with access to the Tailscale daemon. It requires `tailscale` and `jq`, automatically chooses an unused HTTPS port from 8443–8499, and prints the actual tailnet URL. Rerunning it reuses this site's existing private endpoint in that range. If HTTPS needs enabling, follow Tailscale's displayed setup link. The command must run as a user allowed to configure Serve. The launcher preserves existing services and skips ports with Funnel enabled. Request a specific port with `TAILNET_PORT=8444 bash deploy/serve-tailnet.sh`; an occupied explicit port produces an error.

Tailscale serves only `dist/`. It runs in the background and does not depend on keeping a terminal or Rust process open. Access follows your tailnet's permissions. Remove this preview with `tailscale serve --https=8443 off` (use your selected port). This preview does not configure `studium.yycholla.com`.

### Public domain deployment

The Rust server and embedded assets ship as one executable. This deployment serves the tools and UI only; account endpoints require the Cloudflare Worker. Favorites remain on each visitor's browser and origin. Moving to a different hostname does not transfer favorites.

For a Linux server with Docker Compose and Caddy installed on the host:

1. Point the DNS A record for `studium.yycholla.com` to the server. Add AAAA only if that server has working IPv6. Allow inbound ports 80 and 443.
2. From this checkout, run `docker compose -f deploy/compose.yaml up -d --build`.
3. Add the site block in `deploy/Caddyfile` to your host Caddy configuration, validate it, and reload Caddy. It proxies to the container's loopback-only port and provisions HTTPS automatically when DNS is ready.
4. Check `https://studium.yycholla.com/healthz` returns `ok`, then test copying in the browser.

For deployment without Docker, run `cargo build --release --locked`, copy `target/release/ffxiv-emoji` to the server, and supervise it using your host's service manager behind the same Caddy proxy. Assets are compiled into the binary; rebuilding is required after CSS/JS changes. Changing the Caddy hostname to `yycholla.com` serves the app at the root domain instead.

The supplied configuration is a deployment starting point. No DNS records, remote services, or public deployment are created by initializing this project. The Docker build requires access to the image registry and crates.io.

### Static hosting option

Since this first tool keeps all user state in the browser, you can also run `cargo run --locked --example export` and deploy `dist/` to any static HTTPS host. Rust/Topcoat renders the same HTML at build time. In the static export the catalog is available at `/api/emoji.json` rather than the server's `/api/emoji`. XIVAuth sign-in requires the Cloudflare Worker and D1 deployment described below; a static host alone cannot run account services.

## Project map

| File | Purpose |
| --- | --- |
| `src/main.rs` | Server entry point and graceful shutdown through Topcoat |
| `src/lib.rs` | Explicit page/asset/API/health routes |
| `src/pages.rs` | Hub, Chatpendium, and shared site components |
| `crates/chatpendium-core/src/catalog.rs` | Searchable catalog, character evidence, validation |
| `assets/app.js` | Browser search, clipboard, favorites, grid/list preference |
| `assets/app.css` | Responsive design |
| `docs/DESIGN.md` | Approved design baseline and asset provenance |
| `deploy/` | Tailscale launcher, Compose, and host Caddy configuration |
| `wrangler.jsonc` | Cloudflare assets, account Worker, bindings, and custom domain |
| `worker/index.mjs` | XIVAuth OAuth, protected sessions, and character selection |
| `migrations/` | D1 account and session schema |
| `src/account_pages.rs` | Account, privacy, and terms pages |

`GET /api/emoji` exposes the bundled catalog as JSON; `GET /healthz` is a liveness endpoint. Future tools can live in additional Rust page modules registered in `router()`.

Unofficial fan project. FINAL FANTASY XIV is a trademark of Square Enix. Not affiliated with Square Enix.
