import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { handle } from '../../worker/index.mjs';
export const origin='https://studium.yycholla.com';
export function fixture(t) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  for(const file of readdirSync(new URL('../../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL(`../../migrations/${file}`,import.meta.url),'utf8'));
  const timestamp=Math.floor(Date.now()/1000);
  for(const [account,name,id] of [['a','Alice','12345'],['b','Bob','67890'],['c','Cedar','98765']]) {
    db.prepare('INSERT INTO accounts VALUES (?,?,?,?)').run(account,name,account,timestamp);
    db.prepare('INSERT INTO characters (account_id,persistent_key,lodestone_id,name,home_world,data_center,verified_at) VALUES (?,?,?,?,?,?,?)').run(account,account,id,name,'Balmung','Crystal','2026-10-01');
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(createHash('sha256').update(account.repeat(43)).digest('base64url'),account,`csrf-${account}`,timestamp+3600);
  }
  db.exec("INSERT INTO characters (account_id,persistent_key,lodestone_id,name,home_world,data_center,verified_at) VALUES ('a','alt','24680','Alt','Mateus','Crystal','2026-10-01')");
  const wrap=(sql,args=[])=>({bind:(...values)=>wrap(sql,values),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)});
  const env={SITE_ORIGIN:origin,DB:{prepare:wrap,batch:async statements=>{db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}},ASSETS:{fetch:async()=>new Response('not found',{status:404})}};
  const req=(account,path,init={})=>handle(new Request(`${origin}${path}`,{...init,headers:{Cookie:`__Host-studium_session=${account.repeat(43)}`,...init.headers}}),env,()=>{throw Error('Unexpected network call');});
  const post=(account,action,body={},headers={})=>req(account,`/api/groups/${action}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':`csrf-${account}`,...headers},body:JSON.stringify(body)});
  const sync=(account,id,ids=[],extra={})=>{const snapshot={source_updated_at:new Date().toISOString(),collections:{mounts:{visibility:'public',ids},minions:{visibility:'private',ids:[999]},emotes:{visibility:'unknown',ids:null},facewear:{visibility:'public',ids:[]}},...extra};db.prepare('INSERT OR REPLACE INTO field_collections VALUES (?,?,?,?,?,?)').run(account,id,JSON.stringify(snapshot),'ready',timestamp,timestamp+3600);};
  const goal=(account,id,kind,item)=>db.prepare('INSERT INTO field_goals VALUES (?,?,?,?,?,?)').run(account,id,kind,item,'PRIVATE NOTE DO NOT SHARE',timestamp);
  return {db,env,req,post,sync,goal};
}
export const choices=(character_key,extra={})=>({character_key,share_collections:false,share_wishlist:false,...extra});
export const body=async response=>{if(response.status!==200)throw Error(`${response.status}: ${await response.text()}`);return response.json();};
export const create=(f,extra={})=>f.post('a','create',{name:'Friday friends',kind:'friends',...choices('a'),...extra}).then(body);
export const invite=data=>new URL(data.invite_url).hash.slice('#invite='.length);
