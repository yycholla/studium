#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
cargo fmt --all --check
cargo test --workspace --locked
node tests/auth.mjs
node tests/auth-runtime.mjs
node tests/deploy.mjs
npm run build
npm run test:dom
npm run deploy:check

