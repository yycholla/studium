// Public IDs only. The client secret belongs in `wrangler secret put`.
import { readFile, writeFile } from 'node:fs/promises';
const [clientId, databaseId] = process.argv.slice(2);
if (!clientId || !/^[a-zA-Z0-9_-]{8,200}$/.test(clientId) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(databaseId || '')) {
  console.error('Usage: node deploy/configure-auth.mjs OAUTH_CLIENT_ID D1_DATABASE_ID');
  process.exit(1);
}
const path = new URL('../wrangler.jsonc', import.meta.url);
const config = JSON.parse(await readFile(path, 'utf8'));
config.vars = { ...config.vars, XIVAUTH_CLIENT_ID: clientId };
config.d1_databases = [
  ...(config.d1_databases || []).filter(db => db.binding !== 'DB'),
  { binding: 'DB', database_name: 'studium', database_id: databaseId, migrations_dir: 'migrations' },
];
await writeFile(path, JSON.stringify(config, null, 2) + '\n');
console.log('Configured public OAuth and D1 IDs. Add the client secret with Wrangler.');
