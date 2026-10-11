# XIVAuth sign-in

Studium uses the existing [XIVAuth](https://xivauth.net) identity service. Rust/Topcoat renders the website; `worker/index.mjs` runs the server-side OAuth endpoints on Cloudflare. D1 stores profiles, authorized verified characters, and expiring sessions. Chatpendium remains available anonymously.

## Register the OAuth client

In the existing XIVAuth application's settings:

| Setting | Value |
| --- | --- |
| Privacy policy | `https://studium.yycholla.com/privacy` |
| Terms of service | `https://studium.yycholla.com/terms` |
| OAuth application type | Web application / confidential client |
| Grant flow | Authorization Code |
| Redirect URI | `https://studium.yycholla.com/auth/callback` |
| Scopes | `user` and `character:all` |

Create an **OAuth client** within the application. Its **client ID** is separate from the application ID. Save its client secret privately; do not put it in Git, an issue, or chat. No On Behalf Of configuration or access-control allowlist is needed for public login. PKCE S256 is sent automatically by the Worker.

The privacy and terms pages are part of the static export. Deploy the site first if those URLs need to be reachable during registration. Without auth credentials the site displays that sign-in is not yet available.

## Configure Cloudflare

The recommended environment is `devenv shell`; it provides Cargo, Node, and the locked Wrangler version. For automatic deployments, follow [the GitHub Actions setup](DEVELOPMENT.md). The workflow applies migrations and publishes the checked site. The commands below remain available for manual setup.

Run these commands from the checkout in your own authenticated shell. Use the existing Wrangler login or a Cloudflare API token supplied through `CLOUDFLARE_API_TOKEN`. The token needs access to Workers deployment and D1, plus the existing custom-domain permissions; account IDs, database IDs, and OAuth client IDs are public configuration.

```sh
npx wrangler@4 d1 create studium
```

Copy the resulting database UUID, then configure **public** IDs:

```sh
node deploy/configure-auth.mjs YOUR_OAUTH_CLIENT_ID YOUR_D1_DATABASE_ID
npx wrangler@4 d1 migrations apply studium --remote
```

Build and deploy, then enter the **client secret** at Wrangler's hidden prompt:

```sh
nix-shell --run "cargo run --locked --example export"
npx wrangler@4 deploy
npx wrangler@4 secret put XIVAUTH_CLIENT_SECRET
```

`wrangler.jsonc` now contains the D1 binding and public client ID. Keep these configuration changes for future deployments. Do not overwrite them with an older checkout. The secret remains in Cloudflare. The Worker starts accepting sign-ins once all bindings and credentials are configured. No OAuth credentials belong in the exported `dist/` files.

The site uses a fixed `SITE_ORIGIN` to prevent redirect-host injection. Sign in through `https://studium.yycholla.com`; the `workers.dev` URL is not an alternate callback. Auth routes run through the Worker; static assets are served through Cloudflare's assets service. D1 and Worker requests count against their respective plan allowances.

## Verify the real service

1. Open `/privacy` and `/terms`, then `/account` on the production domain.
2. Continue with XIVAuth and authorize selected verified characters. Confirm their names and worlds appear and selection changes the header.
3. Refresh characters after changing the authorized selection. Removed characters should disappear.
4. Cancel a sign-in and confirm the site offers another attempt without signing you in.
5. Sign out, then sign in again. Remove the Studium account if you want to check deletion; this removes its profile, character records, and all its Studium sessions.

Local tests mock the provider and use SQLite. They verify the auth flow and account isolation, but do not prove that your registered client, production D1 binding, or Cloudflare domain is configured correctly. Complete the browser checks above after deployment.

## Diagnosing failed sign-ins

The account page displays a safe reference when sign-in fails, such as `token-http-401-invalid_client`. In the Studium Worker's Observability logs, search for `studium_auth_failure` to see the matching reference, stage, HTTP status, and recognized OAuth error code. Custom diagnostics omit request URLs, cookies, authorization codes, tokens, credentials, provider bodies, and raw exception messages.

Wrangler enables persistent invocation logs and `observability.redact_query_string` so Cloudflare removes query strings (including OAuth callback codes and state) from request URLs in logs and traces. Do not share full request headers or older unredacted logs.

- `token-http-401-invalid_client`: verify the Worker secret and configured client ID belong to the same XIVAuth OAuth client. Use the original client secret, not an application ID or stored hash.
- `token-http-400-invalid_grant`: begin a new sign-in; check the callback URI and PKCE configuration if it persists.
- `user-http-*` / `characters-http-*`: the provider rejected a profile request; check consent/scopes and provider availability.
- `profile-failed`: a returned profile or verified character does not match the expected API fields.
- `database-failed`: Studium could not save the account/session; check D1 migrations and service availability.
- `*-network`, `*-json`, or `*-size`: a provider request failed or returned an unexpected response.

The deployment workflow also checks that `/api/auth/session` reports `configured: true`. This detects missing configuration, but validating credentials and character linking still requires completing a real browser sign-in.

## Local development

For UI-only work, `cargo run --locked` still serves the Rust site; it does not implement the Worker auth endpoints. Static Tailscale previews also serve only the UI.

For complete auth development, configure the public IDs above, copy `.dev.vars.example` to `.dev.vars`, and enter a development client secret there. The current production D1 binding has `remote: true`, as selected during database creation. Set it to `false` in your local configuration before using the isolated local database commands below. Register `http://localhost:8787/auth/callback` with XIVAuth for that client. Override `XIVAUTH_CLIENT_ID` in `.dev.vars` when using a separate development client. Keep the callback hostname exactly `localhost`.

```sh
cargo run --locked --example export
npx wrangler@4 d1 migrations apply studium --local
npx wrangler@4 dev --port 8787
```

With `remote: false`, local Wrangler uses a separate local D1 database. Leaving `remote: true` makes local development access the hosted database instead. Access it from an SSH client with `ssh -L 8787:localhost:8787 YOUR_HOST`, then visit `http://localhost:8787/account` on your computer. Keep `.dev.vars` untracked.

## Behavior and data boundaries

- Identity is keyed by the XIVAuth user ID. Names and characters are not login identifiers.
- Only authorized, verified character records are retained. `verified_at` is used because the `verified` boolean is restricted to the broader `character:manage` scope.
- Provider tokens are used only during sign-in, then revocation is attempted and tokens are discarded. No access or refresh token is persisted or returned to the browser.
- OAuth state is bound to an HttpOnly browser cookie, expires after ten minutes, and is atomically consumed. Sessions use opaque random cookies; only their hashes are stored. Sessions expire after eight hours.
- All account mutations require the configured Origin and a session-specific CSRF token. Auth responses use `private, no-store`.
- Refreshing characters starts a fresh authorization flow. Character records are a snapshot, not a continuously monitored verification status. Do not use this snapshot alone for future high-trust access decisions.
- Account deletion removes active database records and all account sessions. Expired sessions and unfinished flows are pruned on subsequent sign-ins. Provider backup retention still applies.
- Favorites remain browser-local. Signing in does not import inventory, achievements, collection progress, chat messages, or favorite expressions.

## Checks

Requires Node 24 for the built-in SQLite test adapter:

```sh
node tests/auth.mjs
cargo test --workspace --locked
cargo run --locked --example export
npm install --no-save --package-lock=false jsdom@26.1.0
node tests/account-dom.mjs
node tests/dom.mjs
npx wrangler@4 deploy --dry-run
```

Provider reference: [XIVAuth documentation](https://kazwolfe.notion.site/Documentation-128e77f0016c4901888ea1234678c37d). The current API contract was also checked against [the provider source](https://github.com/XIVAuth/XIVAuth): `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`, `/api/v1/user`, and `/api/v1/characters`.
