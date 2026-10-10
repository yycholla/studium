#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# OAuth secrets already stored in Cloudflare are preserved by Wrangler deploy.
# CI checks/builds first and passes --built to deploy the checked artifact.
if [[ "${1:-}" != "--built" ]]; then
  npm run check
fi
if [[ ! -f dist/account/index.html || ! -f dist/assets/account.js ]]; then
  echo "Missing site build. Run studium-build before deployment." >&2
  exit 1
fi
npm run db:migrate
npm exec -- wrangler deploy
