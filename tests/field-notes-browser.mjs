// Optional visual/interaction QA using exported pages and deterministic provider fixtures.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {}) });
const context = await browser.newContext();
const origin='https://studium.test';
const account={configured:true,csrf_token:'fixture-csrf',account:{display_name:'Adventurer',selected_character_key:'one',characters:[{persistent_key:'one',lodestone_id:'12345',name:'Aster Willow',home_world:'Balmung',data_center:'Crystal'},{persistent_key:'two',lodestone_id:'67890',name:'Moss Fern',home_world:'Mateus',data_center:'Crystal'}]}};
const goals=new Map([['one',[]],['two',[]]]),synced=new Set();
const state=key=>({character_key:key,goals:goals.get(key),sync:{status:synced.has(key)?'ready':'pending',checked_at:synced.has(key)?1791670000:null,next_check_at:synced.has(key)?Math.floor(Date.now()/1000)+3600:0,snapshot:synced.has(key)?{source_updated_at:'2026-10-10T18:00:00Z',collections:Object.fromEntries(['mounts','minions','emotes','facewear'].map(kind=>[kind,{visibility:kind==='emotes'?'private':'public',ids:key==='one'?[1]:[]}]))}:null}});
const examples={mounts:['Aithon','Boreas','Kirin','Nightmare'],minions:['Wind-up Alphinaud','Fat Cat','Lesser Panda','Midgardsormr'],emotes:['Ballroom Etiquette — The Gold Dance','Ballroom Etiquette — A Fitting End'],facewear:['Oval Spectacles','Elegant Rimless Glasses']};
await context.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  const json=data=>route.fulfill({json:data});
  if(url.origin === 'https://ffxivcollect.com' && path.startsWith('/api/characters/')) {
    const id=Number(path.split('/').at(-1));
    return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{id,last_parsed:'2026-10-10T18:00:00Z',...Object.fromEntries(['mounts','minions','emotes','facewear'].map(kind=>[kind,{public:kind!=='emotes',count:id===12345?1:0,ids:id===12345?[1]:[]}]))}});
  }
  if(url.origin!==origin)return route.abort();
  if(path==='/api/auth/session')return json(account);
  if(path==='/api/auth/character'){account.account.selected_character_key=route.request().postDataJSON().persistent_key;return json({ok:true});}
  if(path.endsWith('/catalog')){const kind=url.searchParams.get('kind');return json({kind,items:examples[kind].map((name,i)=>({id:i+1,name,patch:'2.2',sources:[{type:i%2?'Vendor':'Trial',text:i%2?'The Gold Saucer · Prize Claim':'The Bowl of Embers (Extreme)'}]}))});}
  if(path.endsWith('/state'))return json(state(url.searchParams.get('character')));
  if(path.endsWith('/sync')){const key=route.request().postDataJSON().character_key;synced.add(key);return json(state(key));}
  if(path.endsWith('/goal')){const b=route.request().postDataJSON(),g=goals.get(b.character_key).filter(g=>g.kind!==b.kind||g.item_id!==b.item_id);if(b.action==='save')g.push({kind:b.kind,item_id:b.item_id,note:b.note});goals.set(b.character_key,g);return json(state(b.character_key));}
  const file=path==='/'?'index.html':path==='/field-notes'?'field-notes/index.html':path.slice(1);
  const ext=file.split('.').pop(),types={html:'text/html',css:'text/css',js:'text/javascript',svg:'image/svg+xml',webp:'image/webp',ttf:'font/ttf',ico:'image/x-icon'};
  try{return route.fulfill({body:await readFile(resolve('dist',file)),contentType:types[ext]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'Not found'});}
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('test-results',{recursive:true});
try {
  for(const width of [1440,1024,800,768,390,320]){
    await page.setViewportSize({width,height:1000});await page.goto(`${origin}/field-notes`);
    await page.getByText('Public collections synced.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}`);
    assert.equal(await page.locator('.field-card').count(),12);
    await page.screenshot({path:`test-results/field-notes-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-item="mounts:1"] button').click();await page.waitForFunction(()=>document.querySelector('#field-goal-count').textContent==='1');
  await page.locator('#field-wishlist').click();assert.equal(await page.locator('.field-card').count(),1);assert.match(await page.locator('.field-card').textContent(),/Collected/);
  await page.locator('#header-account-trigger').click();await page.locator('.header-character-choice').nth(1).click();
  await page.waitForFunction(()=>document.querySelector('#field-character').textContent.includes('Moss Fern'));
  assert.equal(await page.locator('.field-card').count(),0);
  await page.locator('#field-wishlist').click();await page.locator('#field-search').fill('Bowl of Embers');assert.equal(await page.locator('.field-card').count(),6);
  await page.locator('#field-group').selectOption('source');assert.equal(await page.locator('#field-group-hint').isVisible(),true);
  if (process.argv.includes('--live-provider')) {
    const live = await browser.newPage();
    await live.route('https://studium.yycholla.com/__collect_probe', r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Public API CORS check</title>'}));
    await live.goto('https://studium.yycholla.com/__collect_probe');
    const result = await live.evaluate(async()=>{
      const read = async path => {
        const response = await fetch(`https://ffxivcollect.com/api/${path}`, {credentials:'omit',mode:'cors',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
        return {status:response.status,data:await response.json()};
      };
      const catalog = await read('mounts?language=en');
      const absent = await read('characters/0?ids=1');
      return {catalogStatus:catalog.status,count:catalog.data.results?.length,characterStatus:absent.status,characterError:absent.data.error};
    });
    assert.equal(result.catalogStatus,200);assert.ok(result.count>0);
    assert.equal(result.characterStatus,404);assert.equal(result.characterError,'Not found');
    console.log('Live provider CORS verified from Studium origin: catalog and character API.');await live.close();
  }
  assert.deepEqual(errors,[]);console.log('Field Notes browser QA passed: six widths, account menu, automatic sync, wishlist, search and grouping.');
} finally {await browser.close();}
