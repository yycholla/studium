import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../assets/group-planner.js';
const {compare,ownership}=globalThis.StudiumGroupPlanner;
const timestamp=Date.now();
const member=(id,ids=[],goals=[],extra={})=>({id,character:{name:id},share_collections:true,share_wishlist:true,goals:goals.map(item_id=>({kind:'mounts',item_id})),sync:{status:'ready',checked_at:Math.floor(timestamp/1000),snapshot:{source_updated_at:new Date(timestamp).toISOString(),collections:{mounts:{visibility:'public',ids}}}},...extra});
const catalogs=[{kind:'mounts',items:[
  {id:1,name:'Aithon',sources:[{type:'Trial',text:'The Bowl of Embers (Extreme)'},{type:'Trial',text:'  The Bowl of Embers (Extreme)  '}]},
  {id:2,name:'Nightmare',sources:[{type:'Trial',text:'The Bowl of Embers (Extreme)'},{type:'Trial',text:'The Navel (Extreme)'}]},
  {id:3,name:'Reward',sources:[{type:'Trial',text:'The Bowl of Embers'},{type:'Achievement',text:'Achievement name'}]},
]}];
test('ranks distinct beneficiaries and wishlist goals, retaining difficulty and alternative sources',()=>{
  const results=compare(catalogs,[member('Alice',[3],[1]),member('Bob',[1,3],[2])],{timestamp});
  assert.equal(results[0].title,'The Bowl of Embers (Extreme)');assert.equal(results[0].people.length,2);assert.equal(results[0].wishlistPeople.length,2);assert.equal(results[0].rewards.length,2);
  assert.deepEqual(results[0].rewards.find(r=>r.id===1).benefits.map(b=>b.name),['Alice']);
  assert.equal(results.length,2);assert.equal(results[1].title,'The Navel (Extreme)');
  const filtered=compare(catalogs,[member('Alice',[3]),member('Bob',[1,2,3])],{selected:['Bob'],timestamp});assert.deepEqual(filtered,[]);
});
test('unknown/private/stale ownership never produces a missing benefit; explicit wishlist still can',()=>{
  for(const changed of [{share_collections:false},{sync:null},{sync:{status:'ready',checked_at:timestamp/1000,snapshot:{source_updated_at:new Date(timestamp-86400001).toISOString(),collections:{mounts:{visibility:'public',ids:[]}}}}},{sync:{status:'unavailable',checked_at:timestamp/1000,snapshot:{source_updated_at:new Date(timestamp).toISOString(),collections:{mounts:{visibility:'public',ids:[]}}}}},{sync:{status:'ready',checked_at:timestamp/1000,snapshot:{source_updated_at:new Date(timestamp).toISOString(),collections:{mounts:{visibility:'private',ids:[]}}}}}]) {
    assert.deepEqual(compare(catalogs,[member('Alice',[],[],changed)],{timestamp}),[]);
    const wishlist=compare(catalogs,[member('Alice',[],[1],changed)],{timestamp});assert.equal(wishlist.length,1);assert.equal(wishlist[0].missingPeople.length,0);assert.equal(wishlist[0].wishlistPeople.length,1);
  }
  assert.deepEqual(compare(catalogs,[member('Alice',[],[1],{character:null})],{timestamp}),[]);
});
test('everyone, wishlist-only, source scope and text filters preserve accurate benefit counts',()=>{
  const members=[member('Alice',[2,3],[1]),member('Bob',[1,3],[2])];
  const all=compare(catalogs,members,{everyone:true,wishlistOnly:true,timestamp});assert.equal(all.length,1);assert.equal(all[0].people.length,2);
  assert.equal(compare(catalogs,members,{query:'Nightmare',timestamp})[0].people.length,1);
  assert.equal(compare(catalogs,[member('Alice',[1,2])],{scope:'all',timestamp}).length,2);
  assert.deepEqual(compare(catalogs,members,{selected:[],timestamp}),[]);
  assert.equal(ownership(member('Alice',[1]),'mounts',1,timestamp),'owned');
});

test('collection selection changes ranking and everyone eligibility before benefit counts are calculated',()=>{
  const source=text=>[{type:'Trial',text}];
  const mixed=[{kind:'mounts',items:[{id:1,name:'Mount one',sources:source('Mount grind')},{id:2,name:'Mount two',sources:source('Mixed duty')}]},
    {kind:'minions',items:[{id:1,name:'Minion one',sources:source('Mixed duty')}]},
    {kind:'emotes',items:[{id:1,name:'Emote one',sources:source('Emote duty')}]},
    {kind:'facewear',items:[{id:1,name:'Glasses',sources:source('Facewear duty')}]}];
  const alice=member('Alice',[],[1]),bob=member('Bob',[2],[1]),cedar=member('Cedar',[1,2]);
  for(const m of [alice,bob,cedar])for(const kind of ['minions','emotes','facewear'])m.sync.snapshot.collections[kind]={visibility:'public',ids:[]};
  const members=[alice,bob,cedar];
  assert.equal(compare(mixed,members,{timestamp})[0].title,'Mixed duty');
  const mounts=compare(mixed,members,{collection:'mounts',timestamp});
  assert.equal(mounts[0].title,'Mount grind');assert.equal(mounts[0].people.length,2);
  assert.equal(mounts.find(r=>r.title==='Mixed duty').people.length,1);
  assert.ok(mounts.flatMap(r=>r.rewards).every(r=>r.kind==='mounts'));
  assert.deepEqual(compare(mixed,members,{collection:'mounts',everyone:true,timestamp}),[]);
  assert.ok(compare(mixed,members,{everyone:true,timestamp}).some(r=>r.title==='Mixed duty'));
  for(const kind of ['minions','emotes','facewear']) {
    const results=compare(mixed,members,{collection:kind,timestamp});assert.equal(results.length,1);
    assert.ok(results[0].rewards.every(r=>r.kind===kind));
    assert.deepEqual(compare(mixed,members,{collection:kind,wishlistOnly:true,timestamp}),[]);
  }
});

test('ownership filters count selected characters per reward, including public imports',()=>{
  const items=Array.from({length:4},(_,id)=>({id:id+1,name:`Reward ${id}`,sources:[{type:'Trial',text:'Shared duty'},{type:'Raid',text:'Alternative duty'}]}));
  const catalog=[{kind:'mounts',items}],members=[member('Alice',[2,3,4]),member('Bob',[3,4]),member('Import',[4],[],{public_character:true})];
  const ids=options=>compare(catalog,members,{timestamp,...options})[0]?.rewards.map(r=>r.id)||[];
  assert.deepEqual(ids({ownedBy:'none'}),[1]);assert.deepEqual(ids({ownedBy:'one'}),[2]);
  assert.deepEqual(ids({ownedBy:'some'}),[2,3]);assert.deepEqual(ids({ownedBy:'all-but-one'}),[3]);
  assert.deepEqual(ids({ownedBy:'all'}),[4]);assert.deepEqual(ids({ownedBy:'exact',ownerCount:2}),[3]);
  assert.deepEqual(ids({ownedBy:'exact',ownerCount:0}),[1]);assert.deepEqual(ids({ownedBy:'exact',ownerCount:3}),[4]);
  for(const ownerCount of [-1,4,1.5,NaN])assert.deepEqual(ids({ownedBy:'exact',ownerCount}),[]);
  assert.deepEqual(ids({ownedBy:'none',selected:['Bob','Import']}),[1,2]);
  assert.deepEqual(ids({ownedBy:'all',selected:['Alice']}),[2,3,4]);
  assert.deepEqual(ids({ownedBy:'none',selected:[]}),[]);
  const owned=compare(catalog,members,{ownedBy:'all',timestamp});assert.equal(owned.length,2);
  assert.deepEqual(owned[0].rewards[0].ownership,{owned:3,missing:0,unknown:0,total:3});assert.deepEqual(owned[0].people,[]);
  assert.deepEqual(ids({}),[1,2,3],'default remains useful-reward comparison');
});

test('complete-progress mode excludes unknown and stale participants even with wishlist goals',()=>{
  for(const extra of [{share_collections:false},{sync:null},{sync:{status:'unavailable',checked_at:timestamp/1000,snapshot:{source_updated_at:new Date(timestamp).toISOString(),collections:{mounts:{visibility:'public',ids:[]}}}}}]) {
    const members=[member('Alice',[],[1]),member('Unknown',[],[1],extra)];
    for(const ownedBy of ['none','one','some','all-but-one','all','exact'])assert.deepEqual(compare(catalogs,members,{ownedBy,ownerCount:0,requireComplete:true,timestamp}),[]);
    const ordinary=compare(catalogs,members,{timestamp});assert.deepEqual(ordinary[0].rewards[0].ownership,{owned:0,missing:1,unknown:1,total:2});
    assert.ok(compare(catalogs,members,{ownedBy:'none',selected:['Alice'],timestamp}).length>0);
  }
});

test('ownership filtering happens before source ranking and combines with benefit and wishlist filters',()=>{
  const members=[member('Alice',[1],[2]),member('Bob',[],[1])];
  const results=compare(catalogs,members,{ownedBy:'one',timestamp});
  assert.equal(results.length,1);assert.deepEqual(results[0].rewards.map(r=>r.id),[1]);assert.deepEqual(results[0].people,['Bob']);
  assert.deepEqual(compare(catalogs,members,{ownedBy:'one',everyone:true,timestamp}),[]);
  assert.equal(compare(catalogs,members,{ownedBy:'one',wishlistOnly:true,timestamp})[0].wishlistPeople.length,1);
  assert.deepEqual(compare(catalogs,members,{ownedBy:'all',wishlistOnly:true,timestamp}),[]);
  assert.deepEqual(compare(catalogs,members,{ownedBy:'one',query:'Nightmare',timestamp}),[]);
  assert.deepEqual(compare(catalogs,members,{ownedBy:'one',collection:'minions',timestamp}),[]);
});

test('available-progress counts match zero and one known owners without classifying unknowns as missing',()=>{
  const members=[member('Alice',[]),member('Bob',[2]),member('Unknown',[],[1],{sync:null})];
  const none=compare(catalogs,members,{ownedBy:'none',timestamp});
  assert.ok(none.length>0);assert.deepEqual(none[0].rewards[0].ownership,{owned:0,missing:2,unknown:1,total:3});
  assert.equal(none[0].missingPeople.length,2,'Unknown character never counts as confirmed missing');
  const one=compare(catalogs,members,{ownedBy:'one',timestamp});assert.deepEqual(one[0].rewards.map(r=>r.id),[2]);
  for(const ownedBy of ['some','all-but-one'])assert.deepEqual(compare(catalogs,members,{ownedBy,timestamp})[0].rewards.map(r=>r.id),[2]);
  assert.deepEqual(compare(catalogs,members,{ownedBy:'exact',ownerCount:1,timestamp})[0].rewards.map(r=>r.id),[2]);
  assert.deepEqual(compare(catalogs,members,{ownedBy:'none',requireComplete:true,timestamp}),[]);
  const all=compare(catalogs,members,{ownedBy:'all',selected:['Bob','Unknown'],timestamp});
  assert.deepEqual(all[0].rewards[0].ownership,{owned:1,missing:0,unknown:1,total:2});assert.deepEqual(all[0].people,[]);
  for(const ownedBy of ['none','one','some','all-but-one','all','exact'])assert.deepEqual(compare(catalogs,members,{ownedBy,ownerCount:0,selected:['Unknown'],timestamp}),[],'No data cannot establish zero owners');
});
