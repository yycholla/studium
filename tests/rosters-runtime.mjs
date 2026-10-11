import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),workerd=dirname(require.resolve('workerd/package.json'));
const root=mkdtempSync(join(tmpdir(),'studium-rosters-'));
const fixtures=[];
if(process.argv.includes('--live')) {
  for(const [label,url] of [
    ['fc','https://na.finalfantasyxiv.com/lodestone/freecompany/9230831123737734814/member/'],
    ['friends','https://na.finalfantasyxiv.com/lodestone/character/15000469/friend/'],
  ]) {
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error(`Live ${label} roster: HTTP ${response.status}`);
    const html=await response.text();
    // Structural diagnostics only: no character names, IDs, or page text.
    const {JSDOM}=await import('jsdom'),dom=new JSDOM(html),d=dom.window.document;
    const ancestors=e=>{const nodes=[];for(let i=0;e&&i<7;i++,e=e.parentElement)nodes.push(e.tagName.toLowerCase()+'.'+e.className);return nodes;};
    console.log(JSON.stringify({label,names:d.querySelectorAll('.entry__name').length,first:ancestors(d.querySelector('.entry__name')),entryClasses:[...new Set([...d.querySelectorAll('[class*=entry]')].map(e=>e.tagName.toLowerCase()+'.'+e.className))].slice(0,20)}));
    dom.window.close();fixtures.push({label,html});
  }
}
const source=path=>JSON.stringify(readFileSync(new URL(path,import.meta.url),'utf8'));
const test=`import {parseRoster,findFreeCompany,loadRoster} from './public-rosters.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const entry='<div class="ldst__window"><h3>Friends</h3><ul><li class="entry"><a class="entry__bg" href="/lodestone/character/34567/"><p class="entry__name">Test &amp; Friend</p><p class="entry__world">Balmung [Crystal]</p></a></li></ul></div><ul class="btn__pager"><li>Page 1 of 2</li></ul><li class="entry"><a href="/lodestone/character/999/">Sidebar</a></li>';
export default {async test(){
  const parsed=await parseRoster(entry);
  check(parsed.characters.length===1&&parsed.characters[0].lodestone_id==='34567'&&parsed.characters[0].home_world==='Balmung'&&parsed.pages===2,'Roster parser or pagination');
  check(parsed.characters[0].name==='Test & Friend','Text chunks');
  const friends=entry.replace('<ul><li class=\"entry\">','<div class=\"entry\">').replace('</li></ul></div>','</div></div>').replace('a class=\"entry__bg\"','a class=\"entry__link\"');
  check((await parseRoster(friends)).characters.length===1,'Friends use div entries and entry__link anchors');
  check(await findFreeCompany('<div class="character__freecompany__name"><a href="/lodestone/freecompany/9230831123737734814/">FC</a></div>')==='9230831123737734814','FC precision');
  for(const html of ['<h2>Private profile</h2>','<h2>Friends</h2><p>No friends</p>','<h2>Maintenance</h2>']){let threw=false;try{await parseRoster(html);}catch{threw=true;}check(threw,'Private/empty/outage must not be treated as complete roster');}
  const calls=[];
  const fetcher=async(url,init)=>{calls.push(url);check(init.redirect==='manual'&&!init.headers.Cookie,'Credentials or redirects');return new Response(entry,{headers:{'Content-Type':'text/html'}});};
  await loadRoster(fetcher,'12345','friends',2);check(calls[0]==='https://na.finalfantasyxiv.com/lodestone/character/12345/friend/?page=2','Fixed provider path');
  let rejected=false;try{await loadRoster(async()=>new Response('',{status:302,headers:{Location:'https://evil.test'}}),'12345','friends');}catch{rejected=true;}check(rejected,'Redirect rejected');
  console.log('PASS public roster HTML parsing, scope, privacy, pagination and redirect safety');
  for(const fixture of ${JSON.stringify(fixtures)}){const data=await parseRoster(fixture.html);check(data.characters.length>0,'Live '+fixture.label+' empty');console.log('PASS live '+fixture.label+': '+data.characters.length+' entries; '+data.pages+' pages');}
}};`;
try {
  const config=join(root,'tests.capnp');
  writeFileSync(config,`using Workerd = import "/workerd.capnp";
const config :Workerd.Config = (services = [(name = "rosters", worker = (
compatibilityDate = "2026-10-01",modules = [
(name = "test.mjs", esModule = ${JSON.stringify(test)}),
(name = "public-rosters.mjs", esModule = ${source('../worker/public-rosters.mjs')}),
(name = "field-notes.mjs", esModule = ${source('../worker/field-notes.mjs')})
]))]);`);
  const result=spawnSync(join(workerd,'bin/workerd'),['test','-I',workerd,config,'rosters'],{stdio:'inherit'});
  if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{rmSync(root,{recursive:true,force:true});}
