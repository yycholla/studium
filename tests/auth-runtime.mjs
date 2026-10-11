// Exercise the real fetch implementation in Wrangler's pinned workerd runtime.
// No listening ports, credentials, or external network access are needed.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const workerdRoot = dirname(require.resolve('workerd/package.json'));
const root = mkdtempSync(join(tmpdir(), 'studium-auth-runtime-'));
const { compatibility_date } = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const source = path => JSON.stringify(readFileSync(new URL(path, import.meta.url), 'utf8'));
try {
  const config = join(root, 'tests.capnp');
  writeFileSync(config, `using Workerd = import "/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "auth", worker = (
      compatibilityDate = ${JSON.stringify(compatibility_date)},
      globalOutbound = "provider",
      bindings = [(name = "PROVIDER", service = "provider")],
      modules = [
        (name = "test.mjs", esModule = ${source('./fixtures/auth-runtime.mjs')}),
        (name = "worker.mjs", esModule = ${source('../worker/index.mjs')})
      ]
    )),
    (name = "provider", worker = (
      compatibilityDate = ${JSON.stringify(compatibility_date)},
      modules = [(name = "provider.mjs", esModule = ${source('./fixtures/auth-provider.mjs')})]
    ))
  ]
);`);
  const result = spawnSync(join(workerdRoot, 'bin/workerd'), ['test', '-I', workerdRoot, config, 'auth'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { rmSync(root, { recursive: true, force: true }); }
