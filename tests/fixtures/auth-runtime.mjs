import { handle } from './worker.mjs';
function check(condition, message) { if (!condition) throw new Error(message); }
export default {
  async test(controller, bindings) {
    for (const mode of ['success', 'token', 'user', 'characters', 'revoke']) {
      await bindings.PROVIDER.fetch('https://control.test/reset', { method: 'POST', body: mode });
      let saved = false;
      // Database behavior is covered with SQLite in auth.mjs; this test exercises real Workers fetch.
      const env = {
        SITE_ORIGIN: 'https://studium.yycholla.com', XIVAUTH_CLIENT_ID: 'fixture-client', XIVAUTH_CLIENT_SECRET: 'fixture-secret',
        DB: {
          prepare: () => ({ bind: () => ({ first: async () => ({ verifier: 'v'.repeat(43) }) }) }),
          batch: async () => { saved = true; },
        },
      };
      const response = await handle(new Request(`${env.SITE_ORIGIN}/auth/callback?state=${'s'.repeat(43)}&code=fixture-code`, {
        headers: { Cookie: `__Host-studium_oauth=${'b'.repeat(43)}` },
      }), env);
      const success = mode === 'success' || mode === 'revoke';
      check(response.headers.get('Location') === (success ? '/account' : `/account?error=provider&ref=${mode}-http-307`),
        `${mode}: unexpected callback result ${response.headers.get('Location')}`);
      check(saved === success, `${mode}: incorrect account persistence`);
      check(response.headers.getSetCookie().some(value => value.startsWith('__Host-studium_session=')) === success,
        `${mode}: incorrect session cookie`);
      const paths = await (await bindings.PROVIDER.fetch('https://control.test/calls')).json();
      check(paths.every(path => path.startsWith('xivauth.net/')), `${mode}: followed an untrusted redirect`);
      check(paths.includes('xivauth.net/oauth/revoke') === (mode !== 'token'), `${mode}: token revocation was not attempted`);
      console.log(`PASS ${mode}: Workers callback and redirect handling`);
    }
  },
};
