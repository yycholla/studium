import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { setImmediate as tick, setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { fixture,choices,body,create,invite,origin } from './fixtures/groups-db.mjs';
const html=await readFile(new URL('../dist/groups/index.html',import.meta.url),'utf8');
const script=await readFile(new URL('../assets/groups.js',import.meta.url),'utf8');
const planner=await readFile(new URL('../assets/group-planner.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<20;i++)await tick();};
const until=async predicate=>{const deadline=Date.now()+3000;while(!predicate()){assert.ok(Date.now()<deadline,'Timed out waiting for the UI');await delay(5);}};
async function setup(t,f,{account='a',hash='',override}={}) {
  const dom=new JSDOM(html,{url:`${origin}/groups${hash}`,runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;let current=account;
  const session=()=>({configured:true,csrf_token:`csrf-${current}`,account:current?{display_name:current,selected_character_key:current,characters:f.db.prepare('SELECT persistent_key,lodestone_id,name,home_world FROM characters WHERE account_id=?').all(current)}:null});
  w.fetch=async(path,init={})=>{
    const custom=await override?.(path,init);if(custom)return custom;
    if(path==='/api/auth/session')return Response.json(session());
    if(path.startsWith('/api/field-notes/catalog')){const kind=new URL(path,origin).searchParams.get('kind');return Response.json({kind,items:kind==='mounts'?[{id:1,name:'Aithon',sources:[{type:'Trial',text:'The Bowl of Embers (Extreme)'}]}]:[]});}
    return f.req(current,path,{...init,headers:{Origin:origin,...init.headers}});
  };
  w.eval(planner);w.eval(script);await until(()=>account?!d.querySelector('#group-workspace').hidden&&!d.querySelector('#group-reload').disabled:d.querySelector('#group-auth-message').textContent.includes('Sign in'));await settle();
  const changeAccount=async next=>{current=next;w.dispatchEvent(new w.CustomEvent('studium:account',{detail:session()}));await settle();};
  const submit=async form=>{await until(()=>!d.querySelector('#group-reload').disabled);form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await until(()=>!d.querySelector('#group-reload').disabled);await settle();};
  return {w,d,changeAccount,submit};
}
test('creation defaults to no sharing; saving progress creates matches and changing character resets consent',async t=>{
  const f=fixture(t);f.sync('a','12345',[]);
  const {d,w,submit}=await setup(t,f);const form=d.querySelector('#group-create');
  assert.equal(form.elements.share_collections.checked,false);assert.equal(form.elements.share_wishlist.checked,false);
  form.elements.name.value='Friday <script>';await submit(form);
  assert.equal(d.querySelector('#group-name').textContent,'Friday <script>');assert.equal(d.querySelector('#group-name script'),null);
  assert.equal(d.querySelectorAll('.group-run').length,0);assert.match(d.querySelector('#group-invite-output input').value,/#invite=/);
  const sharing=d.querySelector('#group-sharing');sharing.elements.share_collections.checked=true;await submit(sharing);
  assert.equal(d.querySelectorAll('.group-run').length,1);assert.match(d.querySelector('.group-benefits').textContent,/Alice — Not collected/);
  sharing.elements.character_key.value='alt';sharing.elements.character_key.dispatchEvent(new w.Event('change'));assert.equal(sharing.elements.share_collections.checked,false);
  await submit(sharing);assert.equal(d.querySelectorAll('.group-run').length,0);
});
test('an invitation is reviewed before joining, survives guest sign-in, and never auto-shares',async t=>{
  const f=fixture(t),made=await create(f,{name:'Friends'});
  const {d,w,changeAccount,submit}=await setup(t,f,{account:'',hash:`#invite=${invite(made)}`});
  assert.equal(w.location.hash,'');assert.ok(w.sessionStorage.getItem('studium-group-invitation'));assert.equal(d.querySelector('#group-login').hidden,false);
  await changeAccount('b');const form=d.querySelector('#group-invitation form');assert.ok(form);assert.equal(form.elements.share_collections.checked,false);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM collection_members').get().n,1);
  await submit(form);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM collection_members').get().n,2);assert.equal(w.sessionStorage.getItem('studium-group-invitation'),null);
  assert.equal(d.querySelectorAll('.group-member').length,2);assert.equal(d.querySelector('#group-invite').hidden,true);
  d.querySelector('#group-leave').click();await settle();assert.equal(d.querySelector('#group-detail').hidden,true);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM collection_members').get().n,1);
});
test('logout clears visible shared data and a late group response cannot restore it',async t=>{
  const f=fixture(t),made=await create(f);let resolve;
  const {d,changeAccount}=await setup(t,f,{override:path=>path.includes('/api/groups/detail')?new Promise(r=>{resolve=r;}):null});
  d.querySelector('[data-group]').click();await settle();assert.ok(resolve);
  await changeAccount('');resolve(Response.json(made.group));await settle();
  assert.equal(d.querySelector('#group-detail').hidden,true);assert.equal(d.querySelector('#group-members').textContent,'');assert.equal(d.querySelector('#group-workspace').hidden,true);
});
test('sharing revocation is reflected on refresh; a stale poll cannot undo a sharing save',async t=>{
  const f=fixture(t);f.sync('a','12345',[]);const made=await create(f,{...choices('a',{share_collections:true})});
  let intercept=false,resolve;
  const {d,w,submit}=await setup(t,f,{override:path=>intercept&&path.includes('/api/groups/detail')?new Promise(r=>{resolve=r;}):null});
  d.querySelector('[data-group]').click();await settle();assert.equal(d.querySelectorAll('.group-run').length,1);
  intercept=true;w.dispatchEvent(new w.Event('focus'));await settle();assert.ok(resolve);
  const form=d.querySelector('#group-sharing');form.elements.share_collections.checked=false;await submit(form);assert.equal(d.querySelectorAll('.group-run').length,0);
  resolve(Response.json(made.group));await settle();assert.equal(d.querySelectorAll('.group-run').length,0);
});

test('saved mount focus initializes the view; personal category choices survive refresh without changing the group',async t=>{
  const f=fixture(t);f.sync('a','12345',[]);f.goal('a','12345','minions',2);
  const {d,w,submit}=await setup(t,f,{override:path=>path.includes('/catalog?kind=minions')?Response.json({kind:'minions',items:[{id:2,name:'Fat Cat',sources:[{type:'Dungeon',text:'Minion duty'}]}]}):null});
  const form=d.querySelector('#group-create');form.elements.name.value='Friday mounts';form.elements.collection_focus.value='mounts';
  form.elements.share_collections.checked=true;form.elements.share_wishlist.checked=true;await submit(form);
  assert.equal(d.querySelector('#group-collection').value,'group');assert.match(d.querySelector('#group-collection-default').textContent,/Mounts/);
  assert.match(d.querySelector('#group-results').textContent,/Aithon/);assert.doesNotMatch(d.querySelector('#group-results').textContent,/Fat Cat/);
  const category=d.querySelector('#group-collection');category.value='minions';category.dispatchEvent(new w.Event('change'));
  assert.match(d.querySelector('#group-results').textContent,/Fat Cat/);assert.doesNotMatch(d.querySelector('#group-results').textContent,/Aithon/);
  d.querySelector('#group-refresh').click();await settle();assert.equal(category.value,'minions');
  assert.equal(f.db.prepare('SELECT collection_focus FROM collection_groups').get().collection_focus,'mounts');
  const focus=d.querySelector('#group-focus-form');focus.elements.collection_focus.value='emotes';await submit(focus);
  assert.equal(category.value,'minions','Owner settings must not override the personal view');
  assert.match(d.querySelector('#group-collection-default').textContent,/Emotes/);
  category.value='group';category.dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('.group-run').length,0);
  d.querySelector('[data-group]').click();await settle();assert.equal(d.querySelector('#group-focus-value').value,'emotes');
});
