import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { handle } from '../worker/index.mjs';
import { normalizeCollections } from '../worker/field-notes.mjs';

const origin = 'https://studium.yycholla.com';
const token = 'a'.repeat(43);
const csrf = 'test-csrf';
const owned = (extra = {}) => ({ id: 12345, last_parsed: '2026-10-10T12:00:00Z',
  mounts: { public: true, ids: [1], count: 1 }, minions: { public: true, ids: [], count: 0 },
  emotes: { public: false, ids: [1], count: 0 }, ...extra });
function fixture(t) {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  t.after(() => db.close());
  db.exec("INSERT INTO accounts VALUES ('a','A','one',0),('b','B','other',0)");
  const insert = db.prepare('INSERT INTO characters (account_id,persistent_key,lodestone_id,name,home_world,data_center,verified_at) VALUES (?,?,?,?,?,?,?)');
  for (const [account, key, id] of [['a','one','12345'],['a','two','67890'],['b','other','98765']]) insert.run(account,key,id,key,'Balmung','Crystal','2026-10-01');
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(createHash('sha256').update(token).digest('base64url'),'a',csrf,Math.floor(Date.now()/1000)+3600);
  const wrap = (sql, args = []) => ({ bind: (...args) => wrap(sql,args), first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => db.prepare(sql).run(...args) });
  const env = { SITE_ORIGIN: origin, DB: { prepare: wrap }, ASSETS: { fetch: () => new Response('asset') } };
  const calls = []; let upstream = owned(), status = 200, catalogBad = false;
  const fetcher = async (url, init) => {
    calls.push({url,init});
    assert.equal(init.redirect, 'manual'); assert.equal(new URL(url).origin, 'https://ffxivcollect.com');
    if (url.includes('/characters/')) return Response.json(upstream, { status });
    return Response.json(catalogBad ? {} : { count: 301, results: Array.from({length:301}, (_, i) => ({ id:i+1,name:`Collectible ${i+1}`,icon:'https://evil.invalid/image',sources:[{type:'Duty',text:'An adventure'}] })) });
  };
  const req = (path, init = {}) => handle(new Request(`${origin}/api/field-notes/${path}`, { ...init, headers: { Cookie:`__Host-studium_session=${token}`, ...init.headers } }),env,fetcher);
  const post = (path, data = {}, headers = {}) => req(path,{method:'POST',headers:{Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json',...headers},body:JSON.stringify({character_key:'one',...data})});
  return { db,calls,req,post,expire: () => db.exec('UPDATE field_collections SET next_check_at=0'), upstream: (data, code=200) => {upstream=data;status=code;}, badCatalog: () => {catalogBad=true;db.exec('UPDATE field_catalogs SET next_check_at=0, fetched_at=0');} };
}
const json = async response => { assert.equal(response.status,200,await response.clone().text()); return response.json(); };

test('real Worker routing permits browsing without sign-in and caches sanitized catalog', async t => {
  const f=fixture(t);
  const data=await json(await f.req('catalog?kind=mounts',{headers:{Cookie:''}}));
  assert.equal(data.items.length,301); assert.equal(data.items[0].icon,null);
  await json(await f.req('catalog?kind=mounts')); assert.equal(f.calls.length,1);
  assert.equal((await f.req('catalog?kind=../secret')).status,400);
  f.badCatalog(); const stale=await json(await f.req('catalog?kind=mounts')); assert.equal(stale.stale,true); assert.equal(stale.items.length,301);
  assert.equal((await f.req('catalog?kind=minions')).status,503);
});

test('journals require a current session, linked character, same origin and CSRF', async t => {
  const f=fixture(t);
  assert.equal((await f.req('state?character=one',{headers:{Cookie:''}})).status,401);
  for (const key of ['other','unlinked']) {
    assert.equal((await f.req(`state?character=${key}`)).status,403);
    assert.equal((await f.post('sync',{character_key:key})).status,403);
    assert.equal((await f.post('goal',{character_key:key,kind:'mounts',item_id:1,action:'remove'})).status,403);
  }
  assert.equal((await f.post('sync',{}, {Origin:'https://evil.invalid'})).status,403);
  assert.equal((await f.post('sync',{}, {'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await f.req('sync')).status,405);
  assert.equal(f.calls.length,0);
});

test('automatic sync distinguishes empty, private and unavailable categories; checks are throttled', async t => {
  const f=fixture(t); const data=await json(await f.post('sync'));
  assert.deepEqual(data.sync.snapshot.collections.mounts,{visibility:'public',ids:[1]});
  assert.deepEqual(data.sync.snapshot.collections.minions,{visibility:'public',ids:[]});
  assert.deepEqual(data.sync.snapshot.collections.emotes,{visibility:'private',ids:null});
  assert.deepEqual(data.sync.snapshot.collections.facewear,{visibility:'unknown',ids:null});
  assert.equal(data.sync.snapshot.source_updated_at,'2026-10-10T12:00:00Z');
  assert.ok(data.sync.next_check_at-data.sync.checked_at>=3599);
  await f.post('sync'); assert.equal(f.calls.length,1);
  assert.match(f.calls[0].url,/characters\/12345\?ids=1&latest=1$/);
});

test('failed or malformed sync preserves last good snapshot, private and missing profiles erase it', async t => {
  const f=fixture(t); const first=await json(await f.post('sync'));
  for (const [body,status] of [[{},503],[owned({id:67890}),200],[owned({mounts:{public:true,ids:[1,2],count:1}}),200],[{},302]]) {
    f.expire(); f.upstream(body,status); const data=await json(await f.post('sync'));
    assert.equal(data.sync.status,'unavailable'); assert.deepEqual(data.sync.snapshot,first.sync.snapshot);
  }
  for (const [status,expected] of [[403,'private'],[404,'not_found']]) {
    f.expire(); f.upstream({},status); const data=await json(await f.post('sync'));
    assert.equal(data.sync.status,expected); assert.equal(data.sync.snapshot,null);
    assert.equal(f.db.prepare('SELECT payload FROM field_collections').get().payload,null);
  }
});

test('goals and notes survive collection updates and remain isolated by character and account', async t => {
  const f=fixture(t), goal={kind:'mounts',item_id:1,action:'save',note:'Run with friends <script>'};
  let data=await json(await f.post('goal',goal)); assert.equal(data.goals[0].note,goal.note);
  data=await json(await f.post('sync')); assert.equal(data.goals.length,1); assert.deepEqual(data.sync.snapshot.collections.mounts.ids,[1]);
  data=await json(await f.req('state?character=two')); assert.deepEqual(data.goals,[]); assert.equal(data.sync.snapshot,null);
  assert.equal((await f.post('goal',{...goal,item_id:9999})).status,400);
  assert.equal((await f.post('goal',{...goal,note:'x'.repeat(1001)})).status,400);
  // Character refresh replaces identity rows; journals remain attached to account + Lodestone ID.
  f.db.exec("DELETE FROM characters WHERE account_id='a' AND persistent_key='one'");
  assert.equal((await f.req('state?character=one')).status,403);
  f.db.exec("INSERT INTO characters (account_id,persistent_key,lodestone_id,name,home_world,data_center,verified_at) VALUES ('a','relinked','12345','A','Balmung','Crystal','2026-10-01')");
  data=await json(await f.req('state?character=relinked')); assert.equal(data.goals[0].note,goal.note);
  data=await json(await f.post('goal',{...goal,character_key:'relinked',action:'remove'})); assert.deepEqual(data.goals,[]);
  f.db.exec("DELETE FROM accounts WHERE id='a'");
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM field_collections').get().n,0);
});

test('journal cap allows edits/removals but rejects a 301st goal', async t => {
  const f=fixture(t); const goal={kind:'mounts',item_id:1,action:'save',note:''};
  await f.post('goal',goal);
  const insert=f.db.prepare("INSERT INTO field_goals VALUES ('a','12345','mounts',?,'',0)");
  for(let i=2;i<=300;i++) insert.run(i);
  assert.equal((await f.post('goal',{...goal,item_id:301})).status,409);
  const data=await json(await f.post('goal',{...goal,note:'Updated'})); assert.equal(data.goals.length,300); assert.equal(data.goals.find(g=>g.item_id===1).note,'Updated');
  await f.post('goal',{...goal,item_id:2,action:'remove'});
  assert.equal((await f.post('goal',{...goal,item_id:301})).status,200);
  f.db.exec("DELETE FROM accounts WHERE id='a'"); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM field_goals').get().n,0);
});

test('normalizer rejects invalid identity/timestamp/IDs without exposing private data', () => {
  for (const data of [null,owned({last_parsed:null}),owned({mounts:{public:true,ids:[-1],count:1}})]) assert.throws(()=>normalizeCollections(data,'12345'));
  assert.deepEqual(normalizeCollections(owned({emotes:{public:false,ids:['secret'],count:1}}),'12345').collections.emotes.ids,null);
});
