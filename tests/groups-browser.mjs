// Two signed-in browsers exercise the real Worker group routes against SQLite.
import assert from 'node:assert/strict';
import { readFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture,origin } from './fixtures/groups-db.mjs';
import '../assets/group-planner.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const cleanup=[],f=fixture({after:fn=>cleanup.push(fn)});
f.sync('a','12345',[]);f.sync('b','67890',[1]);f.goal('a','12345','mounts',1);f.goal('b','67890','mounts',2);f.goal('a','12345','minions',1);f.goal('b','67890','minions',1);
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const errors=[];
async function participant(account) {
  const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if(url.origin==='https://ffxivcollect.com')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{id:54321,last_parsed:new Date().toISOString(),mounts:{public:true,count:0,ids:[]},minions:{public:false,count:1,ids:[999]}}});
    if(url.origin!==origin)return route.abort();
    if(path==='/api/auth/session')return route.fulfill({json:{configured:true,csrf_token:`csrf-${account}`,account:{display_name:account,selected_character_key:account,characters:f.db.prepare('SELECT persistent_key,lodestone_id,name,home_world FROM characters WHERE account_id=?').all(account)}}});
    if(path==='/api/field-notes/catalog') {const kind=url.searchParams.get('kind');return route.fulfill({json:{kind,items:kind==='mounts'?[{id:1,name:'Aithon',sources:[{type:'Trial',text:'The Bowl of Embers (Extreme)'}]},{id:2,name:'Nightmare',sources:[{type:'Trial',text:'The Bowl of Embers (Extreme)'},{type:'Trial',text:'The Navel (Extreme)'}]}]:kind==='minions'?[{id:1,name:'Fat Cat',sources:[{type:'Dungeon',text:'Minion duty'}]}]:[]}});}
    if(path==='/api/groups/roster'){const {group_id}=JSON.parse(request.postData());const characters=[{lodestone_id:'54321',name:'Public Friend',home_world:'Mateus'}];f.db.prepare('INSERT OR REPLACE INTO group_roster_previews VALUES (?,?,?,?,?)').run(group_id,'a','fc',JSON.stringify(characters),Math.floor(Date.now()/1000));return route.fulfill({json:{roster:{characters,pages:1,page:1}}});}
    if(path.startsWith('/api/groups/')){
      const response=await f.req(account,path+url.search,{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})});
      return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    }
    const file=path==='/groups'?'groups/index.html':path.slice(1),types={html:'text/html',js:'text/javascript',css:'text/css',ttf:'font/ttf',svg:'image/svg+xml',webp:'image/webp',ico:'image/x-icon'};
    try{return route.fulfill({body:await readFile(resolve('dist',file)),contentType:types[file.split('.').pop()]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'Not found'});}
  });
  return page;
}
try {
  await mkdir('test-results',{recursive:true});
  const alice=await participant('a'),bob=await participant('b');
  await alice.goto(`${origin}/groups`);await alice.locator('#group-workspace').waitFor();await alice.locator('#group-create-details summary').click();
  await alice.locator('#group-create input[name=name]').fill('Friday mounts');
  await alice.locator('#group-create select[name=collection_focus]').selectOption('mounts');
  await alice.locator('#group-create input[name=share_collections]').check();await alice.locator('#group-create input[name=share_wishlist]').check();
  await alice.locator('#group-create button[type=submit]').click();await alice.locator('#group-invite-output input').waitFor();
  const invitation=await alice.locator('#group-invite-output input').inputValue();
  await bob.goto(invitation);await bob.locator('#group-invitation form').waitFor();
  assert.equal(await bob.locator('#group-invitation input[name=share_collections]').isChecked(),false);
  await bob.locator('#group-invitation input[name=share_collections]').check();await bob.locator('#group-invitation input[name=share_wishlist]').check();
  await bob.locator('#group-invitation button[type=submit]').click();await bob.locator('#group-detail').waitFor();
  await alice.locator('#group-refresh').click();await alice.waitForFunction(()=>document.querySelectorAll('.group-member').length===2);
  // Newly joined members are selected explicitly when comparing an existing group.
  for(const checkbox of await alice.locator('#group-members input[type=checkbox]').all())await checkbox.check();
  assert.match(await alice.locator('.group-run').first().textContent(),/2 could benefit/);
  assert.match(await alice.locator('.group-run').first().textContent(),/Bob — Wishlist · Not collected/);
  await alice.locator('#group-owned-by').selectOption('none');
  assert.match(await alice.locator('#group-results').textContent(),/Nightmare/);assert.doesNotMatch(await alice.locator('#group-results').textContent(),/Aithon/);
  assert.match(await alice.locator('#group-results').textContent(),/0 known owners · 2 confirmed missing · 0 unknown/);
  await alice.locator('#group-owned-by').selectOption('one');
  assert.match(await alice.locator('#group-results').textContent(),/Aithon/);assert.doesNotMatch(await alice.locator('#group-results').textContent(),/Nightmare/);
  await alice.locator('#group-owned-by').selectOption('exact');await alice.locator('#group-owner-count').fill('0');
  assert.match(await alice.locator('#group-results').textContent(),/Nightmare/);
  await alice.locator('#group-owned-by').selectOption('any');
  // Reproduce a third selected character whose progress is unavailable.
  const groupId=f.db.prepare('SELECT id FROM collection_groups').get().id;
  f.db.prepare('INSERT INTO group_public_characters (id,group_id,lodestone_id,name,home_world,source,next_check_at) VALUES (?,?,?,?,?,?,?)').run('unknown-filter-test',groupId,'99998','Unknown Friend','Mateus','friends',Math.floor(Date.now()/1000)+3600);
  await alice.locator('#group-refresh').click();await alice.waitForFunction(()=>document.querySelectorAll('.group-member').length===3);
  await alice.locator('#group-members input[data-member="unknown-filter-test"]').check();
  await alice.locator('#group-owned-by').selectOption('none');assert.match(await alice.locator('#group-results').textContent(),/0 known owners · 2 confirmed missing · 1 unknown/);
  await alice.locator('#group-require-complete').check();assert.equal(await alice.locator('.group-run').count(),0);
  await alice.locator('#group-require-complete').uncheck();assert.ok(await alice.locator('.group-run').count()>0);
  await alice.locator('#group-owned-by').selectOption('one');assert.match(await alice.locator('#group-results').textContent(),/1 known owners · 1 confirmed missing · 1 unknown/);
  await alice.getByRole('button',{name:'Remove public character',exact:true}).click();await alice.waitForFunction(()=>document.querySelectorAll('.group-member').length===2);
  await alice.locator('#group-owned-by').selectOption('any');
  assert.equal(await bob.locator('#group-focus-settings').isVisible(),false);
  assert.match(await bob.locator('#group-collection-default').textContent(),/Mounts/);
  assert.doesNotMatch(await bob.locator('#group-results').textContent(),/Fat Cat/);
  await bob.locator('#group-collection').selectOption('minions');
  assert.equal(await bob.locator('.group-run').count(),1);assert.match(await bob.locator('#group-results').textContent(),/Fat Cat/);
  await bob.locator('#group-refresh').click();await bob.getByText('Showing the latest saved group progress.',{exact:false}).waitFor();
  assert.equal(await bob.locator('#group-collection').inputValue(),'minions');
  assert.equal(f.db.prepare('SELECT collection_focus FROM collection_groups').get().collection_focus,'mounts');
  await bob.locator('#group-collection').selectOption('group');
  await alice.locator('#group-focus-settings summary').click();
  await alice.locator('#group-focus-value').selectOption('minions');await alice.locator('#group-focus-form button').click();
  await alice.getByText('Group collection focus saved.',{exact:false}).waitFor();
  await bob.locator('#group-refresh').click();await bob.waitForFunction(()=>document.querySelector('#group-collection-default').textContent.includes('Minions'));
  assert.equal(await bob.locator('.group-run').count(),1);assert.match(await bob.locator('#group-results').textContent(),/Fat Cat/);
  await alice.locator('#group-focus-value').selectOption('mounts');await alice.locator('#group-focus-form button').click();
  await alice.waitForFunction(()=>document.querySelector('#group-collection-default').textContent.includes('Mounts'));
  await alice.locator('#group-focus-settings summary').click();
  await bob.locator('#group-refresh').click();await bob.waitForFunction(()=>document.querySelector('#group-collection-default').textContent.includes('Mounts'));
  await alice.locator('#group-owned-by').selectOption('exact');await alice.locator('#group-owner-count').fill('1');
  for(const width of [1440,1024,800,768,390,320]){
    await alice.setViewportSize({width,height:1000});
    assert.equal(await alice.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Groups overflow at ${width}`);
    await alice.screenshot({path:`test-results/groups-${width}.png`,fullPage:true});
  }
  await alice.setViewportSize({width:1440,height:1000});
  await alice.locator('#group-owned-by').selectOption('any');
  await alice.locator('#group-everyone').check();assert.equal(await alice.locator('.group-run').count(),2);
  await alice.locator('#group-search').fill('Aithon');assert.equal(await alice.locator('.group-run').count(),0);await alice.locator('#group-search').fill('');
  await bob.locator('#group-settings summary').click();await bob.locator('#group-sharing input[name=share_collections]').uncheck();await bob.locator('#group-sharing input[name=share_wishlist]').uncheck();await bob.locator('#group-sharing button[type=submit]').click();
  await bob.getByText('Sharing choices saved.',{exact:true}).waitFor();await alice.locator('#group-refresh').click();
  await alice.waitForFunction(()=>document.querySelectorAll('.group-run').length===0);
  await bob.locator('#group-close summary').click();await bob.locator('#group-leave').click();await bob.locator('#group-empty').waitFor();
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM collection_members').get().n,1);
  await alice.locator('#group-refresh').click();await alice.waitForFunction(()=>document.querySelectorAll('.group-member').length===1);
  await alice.locator('#group-roster-form button').click();await alice.locator('#group-roster-results input').waitFor();
  await alice.locator('#group-roster-results input').check();await alice.locator('#group-roster-add').click();
  await alice.waitForFunction(()=>document.querySelector('#group-members').textContent.includes('Public FC import'));
  await alice.waitForFunction(()=>document.querySelector('#group-results').textContent.includes('Public Friend — Not collected'));
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM collection_members').get().n,1);
  assert.equal(JSON.parse(f.db.prepare('SELECT payload FROM group_public_characters').get().payload).collections.minions.ids,null);
  await alice.setViewportSize({width:320,height:1000});assert.equal(await alice.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Public import overflow');
  await alice.screenshot({path:'test-results/groups-public-import-320.png',fullPage:true});
  await alice.getByRole('button',{name:'Remove public character',exact:true}).click();await alice.waitForFunction(()=>document.querySelectorAll('.group-member').length===1);
  if(process.argv.includes('--live-catalogs')) {
    const catalogs=await Promise.all(['mounts','minions','emotes','facewear'].map(async kind=>JSON.parse(await readFile(`dist/data/field-notes/${kind}.json`,'utf8'))));
    const member={id:'probe',character:{name:'Probe'},share_collections:true,share_wishlist:false,goals:null,sync:{status:'ready',checked_at:Date.now()/1000,snapshot:{source_updated_at:new Date().toISOString(),collections:Object.fromEntries(catalogs.map(c=>[c.kind,{visibility:'public',ids:[]}]))}}};
    const runs=StudiumGroupPlanner.compare(catalogs,[member]);assert.ok(runs.length>0,'Current provider catalogs must contain supported duty sources');
    console.log(`Live catalog matching verified: ${runs.length} duties across ${catalogs.reduce((sum,c)=>sum+c.items.length,0)} collectibles; source types: ${[...new Set(runs.map(r=>r.type))].join(', ')}.`);
  }
  assert.deepEqual(errors,[]);console.log('Collection groups browser QA passed: two accounts, explicit sharing, invitations, saved collection focus, personal filters, ownership counts with unknown progress and strict opt-in, matching, revocation, leaving, public import/CORS sync/removal and six widths.');
} finally {await browser.close();for(const fn of cleanup)fn();}
