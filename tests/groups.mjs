import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture,choices,body,create,invite } from './fixtures/groups-db.mjs';

test('groups require session, same origin, CSRF, valid input and a linked character',async t=>{
  const f=fixture(t);
  assert.equal((await f.req('','/api/groups/list')).status,401);
  assert.equal((await f.req('a','/api/groups/create')).status,405);
  assert.equal((await f.post('a','create',{}, {Origin:'https://evil.invalid'})).status,403);
  assert.equal((await f.post('a','create',{}, {'X-CSRF-Token':'bad'})).status,403);
  assert.equal((await f.post('a','create',null)).status,400);
  assert.equal((await f.post('a','create',{name:'test',kind:'friends',character_key:'a'})).status,400);
  assert.equal((await f.post('a','create',{name:'test',kind:'friends',...choices('b')})).status,403);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM collection_groups').get().n,0);
});
test('invitation previews reveal no roster; explicit opt-in governs returned progress and goals',async t=>{
  const f=fixture(t);f.sync('a','12345',[1]);f.goal('a','12345','mounts',2);
  const made=await create(f),id=made.group.id,raw=invite(made);
  assert.notEqual(f.db.prepare('SELECT invite_hash FROM collection_groups').get().invite_hash,raw);
  assert.equal(made.group.members[0].sync,null);assert.equal(made.group.members[0].goals,null);
  assert.equal((await f.req('b',`/api/groups/detail?id=${id}`)).status,404);
  const preview=await body(await f.post('b','preview',{invite:raw}));assert.deepEqual(Object.keys(preview.group).sort(),['collection_focus','expires_at','id','kind','name']);
  const joined=await body(await f.post('b','join',{invite:raw,...choices('b')}));assert.equal(joined.group.members.length,2);
  assert.equal(joined.group.members.find(m=>!m.self).goals,null);
  await body(await f.post('a','sharing',{group_id:id,...choices('a',{share_collections:true,share_wishlist:true})}));
  const visible=await body(await f.req('b',`/api/groups/detail?id=${id}`)),alice=visible.members.find(m=>!m.self);
  assert.deepEqual(alice.goals,[{kind:'mounts',item_id:2}]);assert.deepEqual(alice.sync.snapshot.collections.mounts.ids,[1]);assert.equal(alice.sync.snapshot.collections.minions.ids,null);
  assert.ok(!JSON.stringify(visible).includes('PRIVATE NOTE'));assert.ok(!JSON.stringify(visible).includes('account_id'));assert.ok(!JSON.stringify(visible).includes('invite_hash'));
  await body(await f.post('a','sharing',{group_id:id,...choices('a',{share_wishlist:true})}));
  const wishlistOnly=(await body(await f.req('b',`/api/groups/detail?id=${id}`))).members.find(m=>!m.self);assert.equal(wishlistOnly.sync,null);assert.equal(wishlistOnly.goals.length,1);
  await body(await f.post('a','sharing',{group_id:id,...choices('a')}));
  const stopped=(await body(await f.req('b',`/api/groups/detail?id=${id}`))).members.find(m=>!m.self);assert.equal(stopped.sync,null);assert.equal(stopped.goals,null);
});
test('membership and owner actions are isolated; leaving immediately revokes read access',async t=>{
  const f=fixture(t),made=await create(f),id=made.group.id;
  await body(await f.post('b','join',{invite:invite(made),...choices('b')}));
  for(const action of ['invite','delete','remove'])assert.equal((await f.post('b',action,{group_id:id,member_id:'any'})).status,403);
  assert.equal((await f.post('c','sharing',{group_id:id,...choices('c')})).status,404);
  assert.equal((await f.post('a','leave',{group_id:id})).status,409);
  await body(await f.post('b','leave',{group_id:id}));assert.equal((await f.req('b',`/api/groups/detail?id=${id}`)).status,404);
  assert.deepEqual((await body(await f.req('b','/api/groups/list'))).groups,[]);
});
test('rotating invitations and removing members revoke old links without leaking membership',async t=>{
  const f=fixture(t),made=await create(f),id=made.group.id;
  const rotated=await body(await f.post('a','invite',{group_id:id}));
  assert.equal((await f.post('b','preview',{invite:invite(made)})).status,404);
  const joined=await body(await f.post('b','join',{invite:invite(rotated),...choices('b')}));
  await body(await f.post('a','remove',{group_id:id,member_id:joined.group.members.find(m=>m.self).id}));
  assert.equal((await f.post('b','join',{invite:invite(rotated),...choices('b')})).status,404);
  assert.equal((await f.req('b',`/api/groups/detail?id=${id}`)).status,404);
});
test('character choices are per group and an unlinked character exposes no stored progress',async t=>{
  const f=fixture(t);f.sync('a','12345',[1]);f.goal('a','12345','mounts',2);f.sync('a','24680',[3]);
  const first=await create(f,{...choices('a',{share_collections:true,share_wishlist:true})}),second=await create(f,{name:'Second',...choices('alt',{share_collections:true})});
  assert.equal(second.group.members[0].character.lodestone_id,'24680');
  await body(await f.post('b','join',{invite:invite(first),...choices('b')}));
  f.db.exec("DELETE FROM characters WHERE account_id='a' AND persistent_key='a'");
  const lost=(await body(await f.req('b',`/api/groups/detail?id=${first.group.id}`))).members.find(m=>!m.self);
  assert.equal(lost.character,null);assert.equal(lost.goals,null);assert.equal(lost.sync,null);
  const switched=await body(await f.post('a','sharing',{group_id:first.group.id,...choices('alt',{share_collections:true})}));
  assert.deepEqual(switched.group.members.find(m=>m.self).sync.snapshot.collections.mounts.ids,[3]);
});
test('party expiry, group deletion and account deletion cascade memberships',async t=>{
  const f=fixture(t),made=await create(f,{kind:'party'});assert.ok(made.group.expires_at<=Date.now()/1000+86400);assert.equal(made.invite_expires_at,made.group.expires_at);
  f.db.exec('UPDATE collection_groups SET expires_at=1');assert.equal((await f.req('a',`/api/groups/detail?id=${made.group.id}`)).status,404);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM collection_members').get().n,0);
  const second=await create(f);await body(await f.post('b','join',{invite:invite(second),...choices('b')}));
  f.db.exec("DELETE FROM accounts WHERE id='b'");assert.equal((await body(await f.req('a',`/api/groups/detail?id=${second.group.id}`))).members.length,1);
  await body(await f.post('a','delete',{group_id:second.group.id}));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM collection_members').get().n,0);
  await create(f);f.db.exec("DELETE FROM accounts WHERE id='a'");assert.equal(f.db.prepare('SELECT COUNT(*) n FROM collection_groups').get().n,0);
});
test('caps and duplicate membership do not leave orphaned groups or replace sharing choices',async t=>{
  const f=fixture(t),made=await create(f);
  await body(await f.post('b','join',{invite:invite(made),...choices('b')}));
  assert.equal((await f.post('b','join',{invite:invite(made),...choices('b',{share_collections:true})})).status,409);
  assert.equal((await body(await f.req('b',`/api/groups/detail?id=${made.group.id}`))).members.find(m=>m.self).share_collections,false);
  for(let i=1;i<10;i++)await create(f);
  assert.equal((await f.post('a','create',{name:'Over limit',kind:'friends',...choices('a')})).status,409);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM collection_groups').get().n,10);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM collection_members WHERE account_id='a'").get().n,10);
});
test('full groups, expired invitations and duplicate characters cannot bypass join limits',async t=>{
  const f=fixture(t),made=await create(f),id=made.group.id;
  for(let i=0;i<49;i++){
    f.db.prepare('INSERT INTO accounts VALUES (?,?,NULL,0)').run(`f${i}`,'Fixture');
    f.db.prepare('INSERT INTO collection_members VALUES (?,?,?,?,0,0,0)').run(`member-${i}`,id,`f${i}`,String(100000+i));
  }
  assert.equal((await f.post('b','join',{invite:invite(made),...choices('b')})).status,409);
  f.db.prepare('DELETE FROM collection_members WHERE id=?').run('member-0');
  await body(await f.post('b','join',{invite:invite(made),...choices('b')}));
  f.db.exec('UPDATE collection_groups SET invite_expires_at=1');
  assert.equal((await f.post('c','preview',{invite:invite(made)})).status,404);
  const second=await create(f);
  f.db.exec("UPDATE characters SET lodestone_id='12345' WHERE account_id='c'");
  assert.equal((await f.post('c','join',{invite:invite(second),...choices('c')})).status,409);
});

test('collection focus persists for everyone and only the owner can change it',async t=>{
  const f=fixture(t),made=await create(f,{collection_focus:'mounts'}),id=made.group.id;
  assert.equal(made.group.collection_focus,'mounts');
  assert.equal((await body(await f.req('a','/api/groups/list'))).groups[0].collection_focus,'mounts');
  assert.equal((await body(await f.post('b','preview',{invite:invite(made)}))).group.collection_focus,'mounts');
  const joined=await body(await f.post('b','join',{invite:invite(made),collection_focus:'emotes',...choices('b')}));
  assert.equal(joined.group.collection_focus,'mounts');
  assert.equal((await f.post('b','focus',{group_id:id,collection_focus:'minions'})).status,403);
  assert.equal((await f.post('c','focus',{group_id:id,collection_focus:'minions'})).status,404);
  assert.equal((await f.post('a','focus',{group_id:id,collection_focus:'minions'},{'X-CSRF-Token':'bad'})).status,403);
  for(const value of ['unsupported',null,17,{},[]]) {
    assert.equal((await f.post('a','focus',{group_id:id,collection_focus:value})).status,400);
    assert.equal((await f.post('a','create',{name:'Invalid',kind:'friends',collection_focus:value,...choices('a')})).status,400);
  }
  for(const focus of ['minions','emotes','facewear','all','mounts']) {
    await body(await f.post('a','focus',{group_id:id,collection_focus:focus}));
    assert.equal((await body(await f.req('b',`/api/groups/detail?id=${id}`))).collection_focus,focus);
  }
  assert.equal((await create(f)).group.collection_focus,'all','Older clients keep the all-collections default');
});
