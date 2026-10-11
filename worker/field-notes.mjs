const ORIGIN = 'https://ffxivcollect.com';
export const KINDS = ['mounts', 'minions', 'emotes', 'facewear'];
const now = () => Math.floor(Date.now() / 1000);
const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const validId = value => Number.isSafeInteger(value) && value > 0;
function reply(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } });
}
class CollectError extends Error {
  constructor(status, reason = 'http') { super('Collection service unavailable'); this.status = status; this.reference = `${reason}-${status}`; }
}
async function collect(fetcher, path) {
  let response;
  try { response = await fetcher(`${ORIGIN}/api/${path}`, { redirect: 'manual', headers: { Accept: 'application/json', 'User-Agent': 'Studium/1.0 (+https://github.com/yycholla/studium)' }, signal: AbortSignal.timeout(20000) }); }
  catch { throw new CollectError(503, 'network'); }
  if (!response.ok) {
    const error = new CollectError(response.status);
    // A firewall's 403/404 is an outage, not evidence about character privacy.
    if ([403, 404].includes(response.status) && response.headers.get('Content-Type')?.includes('application/json')) {
      try {
        const data = await readJson(response);
        if (data?.status === response.status && data.error === (response.status === 403 ? 'Character is set to private' : 'Not found')) error.profileStatus = response.status;
      } catch { /* Preserve the HTTP diagnostic, without trusting an invalid error body. */ }
    }
    throw error;
  }
  return readJson(response);
}
async function readJson(response) {
  // Bound upstream responses before decoding them.
  const reader = response.body?.getReader();
  if (!reader) throw new CollectError(502, 'invalid-data');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 4_000_000) { await reader.cancel(); throw new CollectError(502, 'invalid-data'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { throw new CollectError(502, 'invalid-data'); }
}
function text(value, limit = 1000) { return typeof value === 'string' ? value.slice(0, limit) : ''; }
function image(value) {
  try { const url = new URL(value); return url.origin === ORIGIN && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export function normalizeCatalog(data) {
  if (!Array.isArray(data?.results) || data.results.length > 10000 || data.results.length !== data.count) throw new CollectError(502, 'invalid-data');
  const ids = new Set();
  return data.results.map(item => {
    if (!validId(item.id) || ids.has(item.id) || !text(item.name)) throw new CollectError(502, 'invalid-data');
    ids.add(item.id);
    return { id: item.id, name: text(item.name, 200), icon: image(item.icon), patch: text(item.patch, 30),
      sources: Array.isArray(item.sources) ? item.sources.slice(0, 30).map(s => ({ type: text(s.type, 100), text: text(s.text) })).filter(s => s.text) : [] };
  });
}
export function normalizeCollections(data, lodestoneId) {
  if (String(data?.id) !== lodestoneId || !Number.isFinite(Date.parse(data?.last_parsed))) throw new CollectError(502, 'invalid-data');
  const collections = {};
  for (const kind of KINDS) {
    const value = data[kind];
    // Some provider responses include IDs even for private collections. Never use those IDs.
    if (value?.public !== true) { collections[kind] = { visibility: value?.public === false ? 'private' : 'unknown', ids: null }; continue; }
    if (!Array.isArray(value.ids) || value.ids.length > 10000 || !value.ids.every(validId) || value.ids.length !== value.count) {
      throw new CollectError(502, 'invalid-data');
    }
    collections[kind] = { visibility: 'public', ids: [...new Set(value.ids)] };
  }
  return { source_updated_at: data.last_parsed, collections };
}
async function catalog(env, kind, fetcher) {
  let failure;
  let row = await stmt(env, 'SELECT * FROM field_catalogs WHERE kind = ?', kind).first();
  if (!row || row.next_check_at <= now()) {
    await stmt(env, 'INSERT OR IGNORE INTO field_catalogs (kind) VALUES (?)', kind).run();
    const lock = await stmt(env, 'UPDATE field_catalogs SET next_check_at = ? WHERE kind = ? AND next_check_at <= ? RETURNING kind', now() + 90, kind, now()).first();
    if (lock) {
      try {
        const items = normalizeCatalog(await collect(fetcher, `${kind}?language=en`));
        const timestamp = now();
        await stmt(env, 'UPDATE field_catalogs SET payload = ?, fetched_at = ?, next_check_at = ? WHERE kind = ?', JSON.stringify(items), timestamp, timestamp + 21600, kind).run();
      } catch (error) {
        failure = error;
        console.warn(JSON.stringify({ event: 'studium_catalog_failure', kind, reference: error.reference || 'storage-or-schema' }));
        await stmt(env, 'UPDATE field_catalogs SET next_check_at = ? WHERE kind = ?', now() + 60, kind).run();
      }
    }
    row = await stmt(env, 'SELECT * FROM field_catalogs WHERE kind = ?', kind).first();
  }
  if (!row?.payload) throw failure || new CollectError(503, 'retry');
  return { kind, items: JSON.parse(row.payload), fetched_at: row.fetched_at, stale: row.fetched_at + 21600 <= now() };
}
async function state(env, accountId, character) {
  const row = await stmt(env, 'SELECT * FROM field_collections WHERE account_id = ? AND lodestone_id = ?', accountId, character.lodestone_id).first();
  const { results: goals } = await stmt(env, 'SELECT kind, item_id, note, created_at FROM field_goals WHERE account_id = ? AND lodestone_id = ? ORDER BY created_at DESC', accountId, character.lodestone_id).all();
  return { character_key: character.persistent_key, lodestone_id: character.lodestone_id, goals,
    sync: { status: row?.status || 'pending', checked_at: row?.checked_at || null, next_check_at: row?.next_check_at || 0,
      snapshot: row?.payload ? JSON.parse(row.payload) : null } };
}
async function sync(env, accountId, character, fetcher) {
  const args = [accountId, character.lodestone_id];
  await stmt(env, 'INSERT OR IGNORE INTO field_collections (account_id, lodestone_id) VALUES (?, ?)', ...args).run();
  const lock = await stmt(env, 'UPDATE field_collections SET next_check_at = ? WHERE account_id = ? AND lodestone_id = ? AND next_check_at <= ? RETURNING account_id', now() + 90, ...args, now()).first();
  if (lock) {
    try {
      const snapshot = normalizeCollections(await collect(fetcher, `characters/${character.lodestone_id}?ids=1&latest=1`), character.lodestone_id);
      await stmt(env, "UPDATE field_collections SET payload = ?, status = 'ready', checked_at = ?, next_check_at = ? WHERE account_id = ? AND lodestone_id = ?", JSON.stringify(snapshot), now(), now() + 3600, ...args).run();
    } catch (error) {
      const status = error.profileStatus === 403 ? 'private' : error.profileStatus === 404 ? 'not_found' : 'unavailable';
      // Forget ownership on privacy/not-found responses. Preserve the last good snapshot only on transient failure.
      await stmt(env, 'UPDATE field_collections SET payload = CASE WHEN ? THEN payload ELSE NULL END, status = ?, checked_at = ?, next_check_at = ? WHERE account_id = ? AND lodestone_id = ?', status === 'unavailable' ? 1 : 0, status, now(), now() + 300, ...args).run();
    }
  }
  return state(env, accountId, character);
}

export async function handleFieldNotes(request, env, current, config, fetcher = fetch) {
  const url = new URL(request.url), path = url.pathname;
  if (path === '/api/field-notes/catalog' && request.method === 'GET') {
    const kind = url.searchParams.get('kind');
    if (!KINDS.includes(kind)) return reply({ error: 'Choose a supported collection.' }, 400);
    try { return reply(await catalog(env, kind, fetcher)); }
    catch (error) { return reply({ error: 'FFXIV Collect is unavailable. Please try again shortly.', reference: error.reference || 'storage-or-schema' }, 503); }
  }
  if (!['/api/field-notes/state', '/api/field-notes/sync', '/api/field-notes/goal'].includes(path)) return reply({ error: 'Not found.' }, 404);
  const method = path.endsWith('/state') ? 'GET' : 'POST';
  if (request.method !== method) return reply({ error: `Use ${method}.` }, 405);
  if (!current) return reply({ error: 'Please sign in to use your character journal.' }, 401);
  let input = {};
  if (method === 'POST') {
    if (request.headers.get('Origin') !== config.origin || request.headers.get('X-CSRF-Token') !== current.csrf_token) return reply({ error: 'Please refresh this page and try again.' }, 403);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({ error: 'Expected JSON.' }, 415);
    const body = await request.text();
    if (body.length > 4096) return reply({ error: 'Request too large.' }, 413);
    try { input = JSON.parse(body); } catch { return reply({ error: 'Invalid JSON.' }, 400); }
  }
  const key = method === 'GET' ? url.searchParams.get('character') : input?.character_key;
  if (typeof key !== 'string' || !key || key.length > 128) return reply({ error: 'Choose a linked character.' }, 400);
  const character = await stmt(env, 'SELECT persistent_key, lodestone_id FROM characters WHERE account_id = ? AND persistent_key = ?', current.account_id, key).first();
  if (!character) return reply({ error: 'That character is not linked to your account.' }, 403);
  if (method === 'GET') return reply(await state(env, current.account_id, character));
  if (path.endsWith('/sync')) return reply(await sync(env, current.account_id, character, fetcher));
  if (!KINDS.includes(input.kind) || !validId(input.item_id) || !['save', 'remove'].includes(input.action)) return reply({ error: 'Choose a valid collection goal.' }, 400);
  const args = [current.account_id, character.lodestone_id, input.kind, input.item_id];
  if (input.action === 'remove') {
    await stmt(env, 'DELETE FROM field_goals WHERE account_id = ? AND lodestone_id = ? AND kind = ? AND item_id = ?', ...args).run();
  } else {
    if (typeof input.note !== 'string' || input.note.length > 1000) return reply({ error: 'Notes must be at most 1,000 characters.' }, 400);
    // An existing goal can be edited even during an upstream outage.
    const exists = await stmt(env, 'SELECT item_id FROM field_goals WHERE account_id = ? AND lodestone_id = ? AND kind = ? AND item_id = ?', ...args).first();
    if (!exists) {
      let data;
      try { data = await catalog(env, input.kind, fetcher); } catch { return reply({ error: 'The collection is unavailable. Try saving again shortly.' }, 503); }
      if (!data.items.some(item => item.id === input.item_id)) return reply({ error: 'This collectible was not found.' }, 400);
    }
    const saved = await stmt(env, `INSERT INTO field_goals (account_id, lodestone_id, kind, item_id, note, created_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM field_goals WHERE account_id = ? AND lodestone_id = ?) < 300 OR EXISTS (SELECT 1 FROM field_goals WHERE account_id = ? AND lodestone_id = ? AND kind = ? AND item_id = ?)
      ON CONFLICT(account_id, lodestone_id, kind, item_id) DO UPDATE SET note = excluded.note RETURNING item_id`,
      ...args, input.note, now(), current.account_id, character.lodestone_id, ...args).first();
    if (!saved) return reply({ error: 'Your journal holds up to 300 goals per character. Remove a goal to add another.' }, 409);
  }
  return reply(await state(env, current.account_id, character));
}
