import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { setImmediate as tick } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
const html = await readFile(new URL('../dist/field-notes/index.html',import.meta.url),'utf8');
const field = await readFile(new URL('../assets/field-notes.js',import.meta.url),'utf8');
const header = await readFile(new URL('../assets/account.js',import.meta.url),'utf8');
const settle = async () => { for(let i=0;i<5;i++) await tick(); };
const signed = () => ({configured:true,csrf_token:'csrf-test',account:{display_name:'Adventurer',selected_character_key:'one',characters:[
  {persistent_key:'one',lodestone_id:'12345',name:'Alice',home_world:'Balmung'},
  {persistent_key:'two',lodestone_id:'67890',name:'Bob',home_world:'Mateus'}]}});
const state = (key, ready=false) => ({character_key:key,goals:[],sync:{status:ready?'ready':'pending',checked_at:ready?1:null,next_check_at:ready?Math.floor(Date.now()/1000)+3600:0,
  snapshot:ready?{source_updated_at:'2026-10-10T12:00:00Z',collections:{mounts:{visibility:'public',ids:key==='one'?[1]:[]},minions:{visibility:'private',ids:null}}}:null}});
async function setup(t,{data=signed(),override,realHeader=false}={}) {
  const dom=new JSDOM(html,{url:'https://studium.yycholla.com/field-notes',runScripts:'outside-only',pretendToBeVisual:true}); t.after(()=>dom.window.close());
  const w=dom.window,d=w.document,calls=[]; const states=new Map([['one',state('one')],['two',state('two')]]);
  w.AbortSignal = AbortSignal;
  w.fetch=async (path,init={})=>{
    calls.push({path,init}); const body=init.body?JSON.parse(init.body):null;
    if(path.startsWith('https://ffxivcollect.com/')) {
      assert.equal(init.credentials,'omit');assert.equal(init.mode,'cors');
      const id=Number(new URL(path).pathname.split('/').at(-1));
      return Response.json({id,last_parsed:'2026-10-10T12:00:00Z',mounts:{public:true,count:id===12345?1:0,ids:id===12345?[1]:[]},minions:{public:false,count:0,ids:[999]}});
    }
    const custom=await override?.(path,body); if(custom) return custom;
    if(path==='/api/auth/session') return Response.json(data);
    if(path==='/api/auth/character') {data.account.selected_character_key=body.persistent_key;return Response.json({ok:true});}
    if(path==='/api/auth/logout') {data={configured:true,account:null};return Response.json({ok:true});}
    if(path.includes('/catalog?')) { const kind=new URL(path,w.location.origin).searchParams.get('kind');return Response.json({kind,items:[{id:1,name:kind==='mounts'?'Aithon <script>':'Little '+kind,icon:'https://evil.invalid/image',patch:'2.2',sources:[{type:'Trial',text:'The Bowl of Embers'}]}]}); }
    if(path.includes('/state?')) return Response.json(states.get(new URL(path,w.location.origin).searchParams.get('character')));
    assert.equal(init.headers['X-CSRF-Token'],'csrf-test');
    if(path.endsWith('/sync')) {assert.ok(body.profile);assert.equal(body.profile.minions.ids,null);const next=state(body.character_key,true);next.goals=states.get(body.character_key).goals;states.set(body.character_key,next);return Response.json(next);}
    if(path.endsWith('/goal')) {const current=states.get(body.character_key);current.goals=current.goals.filter(g=>g.kind!==body.kind||g.item_id!==body.item_id);if(body.action==='save')current.goals.push({kind:body.kind,item_id:body.item_id,note:body.note});return Response.json(current);}
    throw Error('Unexpected '+path);
  };
  w.eval(field);if(realHeader)w.eval(header);await settle();
  const choose=key=>{data.account.selected_character_key=key;w.dispatchEvent(new w.CustomEvent('studium:account',{detail:data}));};
  return {w,d,calls,choose,states,dom};
}
test('anonymous browsing searches sources and never syncs or enables goals', async t=>{
  const {d,w,calls}=await setup(t,{data:{configured:true,account:null}});
  assert.equal(d.querySelectorAll('.field-card').length,4);assert.equal(d.querySelector('#field-sign-in').hidden,false);
  assert.ok([...d.querySelectorAll('[data-goal-action]')].every(b=>b.disabled));assert.ok(!calls.some(c=>c.path.endsWith('/sync')));
  assert.equal(d.querySelector('.field-card script'),null);assert.equal(d.querySelector('.field-card img'),null);
  const input=d.querySelector('#field-search');input.value='Bowl of Embers';input.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.field-card').length,4);
  input.value='unfindable';input.dispatchEvent(new w.Event('input'));assert.match(d.querySelector('#field-results').textContent,/No matching/);
});
test('source types consolidate distinct achievements while preserving requirements and alternatives', async t=>{
  const items=[
    {id:1,name:'Al-iklil',sources:[{type:'Achievement',text:'A Complete History'}]},
    {id:2,name:'Amaro',sources:[{type:'Achievement',text:'A Life of Adventure IV'},{type:'Vendor',text:'Alternative vendor'}]},
    {id:3,name:'Aithon',sources:[{type:'Trial',text:'The Bowl of Embers'}]},
    {id:4,name:'Vendor reward',sources:[{type:'Vendor',text:'The Gold Saucer'}]},
    {id:5,name:'Unlisted reward',sources:[]},
    {id:6,name:'Future reward',sources:[{type:'Future activity',text:'Specific requirement'}]},
  ];
  const {d,w}=await setup(t,{data:{configured:true,account:null},override:path=>{
    if(!path.includes('/catalog?')) return null;
    const kind=new URL(path,'https://studium.yycholla.com').searchParams.get('kind');
    return Response.json({kind,items:kind==='mounts'?items:[]});
  }});
  const select=d.querySelector('#field-group');select.value='source';select.dispatchEvent(new w.Event('change'));
  const groups=new Map([...d.querySelectorAll('.field-group')].map(section=>[section.querySelector('h2').textContent,section]));
  assert.deepEqual([...groups.keys()],['Achievements','Future activity','Source not listed','Trials','Vendors']);
  assert.equal(groups.get('Achievements').querySelectorAll('.field-card').length,2);
  assert.match(groups.get('Achievements').textContent,/A Complete History/);
  assert.match(groups.get('Achievements').textContent,/A Life of Adventure IV/);
  assert.match(groups.get('Achievements').textContent,/Alternative vendor/);
  assert.equal(groups.get('Vendors').querySelectorAll('.field-card').length,1);
  assert.equal(d.querySelectorAll('.field-card').length,items.length);
  const search=d.querySelector('#field-search');search.value='A Life of Adventure';search.dispatchEvent(new w.Event('input'));
  assert.equal(d.querySelectorAll('.field-card').length,1);assert.equal(d.querySelector('.field-group h2').textContent,'Achievements');
  search.value='';search.dispatchEvent(new w.Event('input'));
  select.value='collection';select.dispatchEvent(new w.Event('change'));
  assert.equal(d.querySelectorAll('.field-group').length,1);assert.equal(d.querySelector('.field-group h2').textContent,'Mounts');
  assert.equal(d.querySelector('#field-group-hint').hidden,true);
});
test('header selection drives automatic ownership and isolated wishlists; logout clears the journal', async t=>{
  const {d,calls}=await setup(t,{realHeader:true});
  const mount=()=>d.querySelector('[data-item="mounts:1"]');assert.match(mount().textContent,/✓ Collected/);
  assert.match(d.querySelector('[data-item="minions:1"]').textContent,/Ownership unknown/);
  mount().querySelector('button').click();await settle();assert.equal(d.querySelector('#field-goal-count').textContent,'1');
  const textarea=mount().querySelector('textarea');textarea.value='Meet friends <img src=x>';mount().querySelector('form').dispatchEvent(new d.defaultView.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(mount().querySelector('textarea').value,'Meet friends <img src=x>');
  d.querySelectorAll('.header-character-choice')[1].click();await settle();assert.match(d.querySelector('#field-character').textContent,/Bob/);assert.equal(d.querySelector('#field-goal-count').textContent,'0');assert.match(mount().textContent,/Not collected/);
  d.querySelectorAll('.header-character-choice')[0].click();await settle();assert.equal(d.querySelector('#field-goal-count').textContent,'1');
  assert.equal(calls.filter(c=>c.path.endsWith('/sync')).length,2);
  d.querySelector('#header-account-logout').click();await settle();assert.equal(d.querySelector('#field-goal-count').textContent,'0');assert.match(mount().textContent,/Ownership unknown/);
});
test('late sync from the previous character cannot replace the current journal', async t=>{
  let resolve;
  const {d,choose}=await setup(t,{override:(path,body)=>path.endsWith('/sync')&&body.character_key==='one'?new Promise(r=>{resolve=r;}):null});
  choose('two');await settle();assert.match(d.querySelector('#field-character').textContent,/Bob/);
  resolve(Response.json(state('one',true)));await settle();assert.match(d.querySelector('#field-character').textContent,/Bob/);assert.match(d.querySelector('[data-item="mounts:1"]').textContent,/Not collected/);
});
test('a background state response cannot undo a completed goal save', async t=>{
  let stale,intercept=false;
  const {d,w}=await setup(t,{override:path=>intercept&&path.includes('/state?')?new Promise(r=>{stale=r;}):null});
  intercept=true;w.dispatchEvent(new w.Event('focus'));await settle();
  d.querySelector('[data-item="mounts:1"] button').click();await settle();assert.equal(d.querySelector('#field-goal-count').textContent,'1');
  stale(Response.json(state('one',true)));await settle();assert.equal(d.querySelector('#field-goal-count').textContent,'1');
});
test('private/untracked profile status never appears as an empty collection', async t=>{
  const {d}=await setup(t,{override:(path,body)=>path.endsWith('/sync')?Response.json({...state(body.character_key),sync:{status:'not_found',next_check_at:Date.now()/1000+300,snapshot:null}}):null});
  assert.match(d.querySelector('#field-sync-status').textContent,/not tracked/);assert.match(d.querySelector('#field-collect-profile').href,/characters\/search\?name=Alice/);assert.match(d.querySelector('[data-item="mounts:1"]').textContent,/Ownership unknown/);
});
