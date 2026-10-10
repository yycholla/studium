import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t, { built = true, fail = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'studium-deploy-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'deploy')); mkdirSync(join(root, 'bin'));
  cpSync(new URL('../deploy/cloudflare.sh', import.meta.url), join(root, 'deploy/cloudflare.sh'));
  if (built) {
    mkdirSync(join(root, 'dist/account'), { recursive: true });
    mkdirSync(join(root, 'dist/assets'), { recursive: true });
    writeFileSync(join(root, 'dist/account/index.html'), 'account');
    writeFileSync(join(root, 'dist/assets/account.js'), 'account script');
  }
  writeFileSync(join(root, 'bin/npm'), '#!/usr/bin/env bash\necho "$*" >> "$TEST_LOG"\nif [[ "$*" == "$TEST_FAIL" ]]; then exit 1; fi\n', { mode: 0o755 });
  const log = join(root, 'commands');
  return {
    run: (...args) => spawnSync('bash', [join(root, 'deploy/cloudflare.sh'), ...args], {
      encoding: 'utf8', env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, TEST_LOG: log, TEST_FAIL: fail },
    }),
    commands: () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [],
  };
}
test('CI deploys the checked artifact only after migrations succeed', t => {
  const f = fixture(t); assert.equal(f.run('--built').status, 0);
  assert.deepEqual(f.commands(), ['run db:migrate', 'exec -- wrangler deploy']);
});
test('a failed migration prevents deployment', t => {
  const f = fixture(t, { fail: 'run db:migrate' }); assert.notEqual(f.run('--built').status, 0);
  assert.deepEqual(f.commands(), ['run db:migrate']);
});
test('missing build prevents production changes', t => {
  const f = fixture(t, { built: false }); assert.notEqual(f.run('--built').status, 0);
  assert.deepEqual(f.commands(), []);
});
test('local deployment runs checks first and stops on failure', t => {
  const f = fixture(t, { fail: 'run check' }); assert.notEqual(f.run().status, 0);
  assert.deepEqual(f.commands(), ['run check']);
});
