import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,body,create,invite,choices} from './fixtures/groups-db.mjs';
function roster(f,id,characters=[{lodestone_id:'67890',name:'Bob',home_world:'Balmung'},{lodestone_id:'54321',name:'Public Friend',home_world:'Mateus'}]) {
  f.db.prepare('INSERT OR REPLACE INTO group_roster_previews VALUES (?,?,?,?,?)').run(id,'a','friends',JSON.stringify(characters),Math.floor(Date.now()/1000));
}
const profile=(extra={})=>({id:54321,last_parsed:new Date().toISOString(),mounts:{public:true,count:1,ids:[1]},minions:{public:false,count:1,ids:[999]},...extra});
test('only owners may import or sync, with linked-roster provenance, CSRF and expiry',async t=>{
 const f=fixture(t),made=await create(f),group_id=made.group.id;roster(f,group_id);
 assert.equal((await f.post('b','public-add',{group_id,ids:['54321']})).status,404);
 await body(await f.post('b','join',{invite:invite(made),...choices('b')}));
 for(const action of ['roster','public-add','public-sync','public-remove'])assert.equal((await f.post('b',action,{group_id})).status,403);
 assert.equal((await f.post('a','public-add',{group_id,ids:['54321']},{'X-CSRF-Token':'wrong'})).status,403);
 assert.equal((await f.post('a','public-add',{group_id,ids:['11111']})).status,400);
 f.db.prepare('UPDATE group_roster_previews SET fetched_at=0').run();
 assert.equal((await f.post('a','public-add',{group_id,ids:['54321']})).status,409);
 roster(f,group_id);f.db.prepare("DELETE FROM characters WHERE persistent_key='a'").run();
 assert.equal((await f.post('a','public-add',{group_id,ids:['54321']})).status,409);
});
test('public entries grant no membership, never expose private IDs, and participate without wishlists',async t=>{
 const f=fixture(t),made=await create(f),group_id=made.group.id;roster(f,group_id);
 let data=await body(await f.post('a','public-add',{group_id,ids:['54321','54321']}));
 const entry=data.group.members.find(m=>m.public_character);assert.ok(entry);assert.equal(entry.goals,null);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM collection_members').get().n,1);
 assert.equal((await f.req('b',`/api/groups/detail?id=${group_id}`)).status,404);
 data=await body(await f.post('a','public-sync',{group_id,public_id:entry.id,profile:profile()}));
 const synced=data.group.members.find(m=>m.public_character);assert.equal(synced.sync.status,'ready');
 assert.deepEqual(synced.sync.snapshot.collections.minions,{visibility:'private',ids:null});
 assert.doesNotMatch(JSON.stringify(data),/"ids":\[999\]|PRIVATE NOTE/);
 assert.equal(synced.share_wishlist,false);assert.equal(synced.owner,false);
 const cached=f.db.prepare('SELECT payload FROM group_public_characters').get().payload;assert.equal(JSON.parse(cached).collections.minions.ids,null);
 await body(await f.post('a','public-sync',{group_id,public_id:entry.id,status:'private'}));
 assert.equal(f.db.prepare('SELECT status FROM group_public_characters').get().status,'ready','hourly sync gate');
 f.db.prepare('UPDATE group_public_characters SET next_check_at=0').run();
 data=await body(await f.post('a','public-sync',{group_id,public_id:entry.id,status:'private'}));
 assert.equal(data.group.members.find(m=>m.public_character).sync.snapshot,null);
});
test('joining an imported character respects member consent and permanently removes the public entry',async t=>{
 const f=fixture(t),made=await create(f),group_id=made.group.id;roster(f,group_id);
 await body(await f.post('a','public-add',{group_id,ids:['67890']}));
 let data=await body(await f.post('b','join',{invite:invite(made),...choices('b')}));
 assert.equal(data.group.members.length,2);assert.equal(data.group.members.find(m=>m.self).share_collections,false);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM group_public_characters').get().n,0);
 await body(await f.post('a','public-add',{group_id,ids:['67890']}));
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM group_public_characters').get().n,0);
 await body(await f.post('b','leave',{group_id}));
 data=await body(await f.req('a',`/api/groups/detail?id=${group_id}`));assert.equal(data.members.length,1);
});
test('public sync validates character identity, transient failures are unknown, and removal cascades',async t=>{
 const f=fixture(t),made=await create(f),group_id=made.group.id;roster(f,group_id);
 const data=await body(await f.post('a','public-add',{group_id,ids:['54321']})),public_id=data.group.members.find(m=>m.public_character).id;
 assert.equal((await f.post('a','public-sync',{group_id,public_id,profile:profile({id:67890})})).status,400);
 assert.equal((await f.post('a','public-sync',{group_id,public_id:{}})).status,400);
 await body(await f.post('a','public-sync',{group_id,public_id,status:'unavailable'}));
 assert.equal(f.db.prepare('SELECT payload FROM group_public_characters').get().payload,null);
 await body(await f.post('a','public-remove',{group_id,public_id}));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM group_public_characters').get().n,0);
 await body(await f.post('a','public-add',{group_id,ids:['54321']}));
 await body(await f.post('a','delete',{group_id}));
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM group_public_characters').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM group_roster_previews').get().n,0);
});
test('public imports enforce their cap without silently dropping selected characters',async t=>{
 const f=fixture(t),made=await create(f),group_id=made.group.id;
 const chars=Array.from({length:51},(_,i)=>({lodestone_id:String(60000+i),name:'Friend '+i,home_world:'Balmung'}));roster(f,group_id,chars);
 await body(await f.post('a','public-add',{group_id,ids:chars.slice(0,50).map(c=>c.lodestone_id)}));
 assert.equal((await f.post('a','public-add',{group_id,ids:[chars[50].lodestone_id]})).status,409);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM group_public_characters').get().n,50);
});
