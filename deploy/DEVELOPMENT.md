# Development and Cloudflare deployment

## One environment for local work and CI

With [Nix and devenv installed](https://devenv.sh/getting-started/), run this from an up-to-date checkout:

```sh
devenv shell
```

The environment provides Rust, Cargo, rustfmt, Clippy, a C compiler, pkg-config, Node 24/npm, Python, Git, jq, and curl. The JavaScript setup installs Wrangler and jsdom from `package-lock.json` automatically. Nix inputs are pinned in `devenv.yaml` and `devenv.lock`; Cargo dependencies use `Cargo.lock`.

| Command inside the shell | Behavior |
| --- | --- |
| `studium-dev` | Export the Rust site and run Wrangler on port 8787 |
| `studium-check` | Rust formatting/tests, auth, Field Notes and deployment tests, export, DOM tests, Worker dry run |
| `studium-build` | Export the static site to `dist/` |
| `studium-deploy` | Run checks, apply remote D1 migrations, then deploy |
| `npm run db:migrate` | Apply pending production D1 migrations |
| `npm exec -- wrangler secret put XIVAUTH_CLIENT_SECRET` | Securely enter the OAuth client secret in Cloudflare |

Or run a command directly: `devenv shell -- studium-check`. `devenv test` runs the same checks. Optional direnv users can run `direnv allow` to activate `.envrc` automatically.

Devenv installs dependencies when you enter the environment; it does not start a server or deploy. `.dev.vars`, `.env`, local devenv overrides, and generated environment state are ignored by Git. Follow [XIVAUTH.md](XIVAUTH.md) for local OAuth credentials and callback URLs. The configured `remote: true` D1 binding accesses the hosted database during `wrangler dev`; change it to `false` locally when you want an isolated development database.

`npm run check` and the other npm scripts also work without devenv if the required system tools are already installed and you have run `npm ci`. The original `shell.nix` remains a Rust-only fallback. The Dalamud plugin's Windows/.NET build continues to run in its existing workflow.

## Automatic production deployments

The **Studium website** GitHub Actions workflow runs the same devenv checks on pull requests and pushes to `main`. After a successful main build, it downloads that build's static artifact, applies D1 migrations, deploys the Worker and assets, and checks the public health/account/Field Notes routes, anonymous auth configuration endpoint, and all four live collectible catalogs. A separate Chromium check validates the exported Field Notes page at six viewport widths and uploads screenshots before deployment. Runs are serialized so migrations and deployments do not overlap. Manual **Run workflow** on `main` follows the same checks and deployment path. A successful deployment confirms auth configuration is present; it does not prove the OAuth credentials are accepted. See [sign-in diagnostics](XIVAUTH.md#diagnosing-failed-sign-ins) for provider failures.

Add these **repository Actions secrets** at [Studium's Actions settings](https://github.com/yycholla/studium/settings/secrets/actions):

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Deployment API token scoped to the account hosting Studium |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID containing the Studium Worker and database |

Use Cloudflare's **Edit Cloudflare Workers** token template, restrict it to your account and the `yycholla.com` zone, and include **D1 Edit/Write** for migrations. Route/custom-domain changes also require **Workers Routes Edit/Write** on that zone. The workflow reports a clear setup error if either required secret is missing. Tokens are supplied only to production steps and are not needed for pull-request checks.

The OAuth client secret stays in the Cloudflare Worker. If it has not been set yet, add `XIVAUTH_CLIENT_SECRET` once through the Worker's Settings → Variables and Secrets, or use the private Wrangler prompt shown above. Deployments preserve existing Worker secrets. Do not add the XIVAuth secret to source files or build artifacts.

After adding the GitHub secrets, rerun the **Studium website** workflow on `main`. Its deployment links to `https://studium.yycholla.com`. GitHub Actions does not require your laptop or SSH session to remain connected. A workflow deployment does not copy code into your local checkout; update it with `git pull --ff-only` before local work.

Migrations run before deployment. New migrations should remain compatible with the currently deployed Worker until the new version is live. A failed migration stops the deploy; an already applied migration is not applied again. If an unrelated deploy step fails, rerunning the workflow can continue using the recorded migration history.

## Updating dependencies

Change the pinned input revisions in `devenv.yaml`, run `devenv update`, and commit the resulting `devenv.lock`. The GitHub setup action installs its devenv CLI from that same nixpkgs revision. For JavaScript upgrades, use npm inside devenv and commit both `package.json` and `package-lock.json`. Review and commit Cargo lockfile changes separately when upgrading Rust crates.

References: [devenv with GitHub Actions](https://devenv.sh/integrations/github-actions/), [Cloudflare with GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), [D1 migration commands](https://developers.cloudflare.com/d1/wrangler-commands/).
