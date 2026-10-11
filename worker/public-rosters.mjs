import { normalizeCollections } from './field-notes.mjs';
const ORIGIN = 'https://na.finalfantasyxiv.com';
const sql = (env, query, ...args) => env.DB.prepare(query).bind(...args);
const now = () => Math.floor(Date.now()/1000);
const clean = value => value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (match,key) => {
  if(key[0]!=='#')return ({amp:'&',lt:'<',gt:'>',quot:'\"',apos:"'",nbsp:' '})[key.toLowerCase()]||match;
  const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return code>0&&code<=0x10ffff?String.fromCodePoint(code):match;
}).replace(/\s+/g,' ').trim();
export class RosterError extends Error {
  constructor(message, status=503) { super(message); this.status=status; }
}
async function page(fetcher,path) {
  const response=await fetcher(`${ORIGIN}${path}`, {redirect:'manual',headers:{Accept:'text/html','User-Agent':'Studium/1.0 (+https://github.com/yycholla/studium)'},signal:AbortSignal.timeout(15000)});
  if(!response.ok || !response.headers.get('Content-Type')?.includes('text/html'))throw new RosterError('Lodestone is unavailable or this page is not public. Try again later.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();throw new RosterError('Lodestone returned an unexpected page.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}
// Native Workers HTML parser: restrict matches to roster entries, never sidebar character links.
export async function parseRoster(html) {
  const entries=[];let current=null,pager='',heading='';
  const parser=new HTMLRewriter()
    .on('.ldst__window li.entry',{element(e){current={lodestone_id:'',name:'',home_world:''};entries.push(current);e.onEndTag(()=>{current=null;});}})
    .on('.ldst__window li.entry a.entry__bg',{element(e){const id=e.getAttribute('href')?.match(/^\/lodestone\/character\/([1-9]\d{0,11})\/?$/)?.[1];if(current&&id)current.lodestone_id=id;}})
    .on('.ldst__window li.entry .entry__name',{text(t){if(current)current.name+=t.text;}})
    .on('.ldst__window li.entry .entry__world',{text(t){if(current)current.home_world+=t.text;}})
    .on('.btn__pager',{text(t){pager+=t.text;}})
    .on('h2, h3',{text(t){heading+=t.text;}});
  await parser.transform(new Response(html)).text();
  const characters=entries.filter(e=>e.lodestone_id&&clean(e.name)&&clean(e.home_world)).map(e=>({...e,name:clean(e.name).slice(0,100),home_world:clean(e.home_world).replace(/\s*\[.*$/, '').slice(0,100)}));
  const pages=pager.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  if(!characters.length)throw new RosterError('No readable public roster was found. The list may be private, empty, or temporarily unavailable.',422);
  if(!/Members|Friends/i.test(heading) || characters.length>50 || (pages && Number(pages[2])>11))throw new RosterError('Lodestone’s roster format was not recognized. Please try again later.');
  return {characters:[...new Map(characters.map(c=>[c.lodestone_id,c])).values()],pages:pages?Number(pages[2]):1};
}
export async function findFreeCompany(html) {
  let id=null;
  await new HTMLRewriter().on('.character__freecompany__name a',{element(e){id=e.getAttribute('href')?.match(/^\/lodestone\/freecompany\/([1-9]\d{0,19})\/?$/)?.[1]||null;}}).transform(new Response(html)).text();
  if(!id)throw new RosterError('No public free company was found on this character’s Lodestone profile.',422);
  return id;
}
export async function loadRoster(fetcher, characterId, source, number=1) {
  const fc=source==='fc'?await findFreeCompany(await page(fetcher,`/lodestone/character/${characterId}/`)):null;
  const path=fc?`/lodestone/freecompany/${fc}/member/`:`/lodestone/character/${characterId}/friend/`;
  return {...await parseRoster(await page(fetcher,`${path}?page=${number}`)),url:`${ORIGIN}${path}`,page:number};
}
export async function publicCharacters(env,groupId) {
  const {results}=await sql(env,`SELECT p.* FROM group_public_characters p WHERE group_id=? AND NOT EXISTS
    (SELECT 1 FROM collection_members m WHERE m.group_id=p.group_id AND m.lodestone_id=p.lodestone_id) ORDER BY name,id`,groupId).all();
  return results.map(row=>({id:row.id,public_character:true,source:row.source,self:false,owner:false,
    character:{lodestone_id:row.lodestone_id,name:row.name,home_world:row.home_world},share_collections:true,share_wishlist:false,goals:null,
    next_check_at:row.next_check_at,sync:{status:row.status,checked_at:row.checked_at,snapshot:row.payload?JSON.parse(row.payload):null}}));
}
export async function publicAction(action,input,env,group,accountId,fetcher) {
  if(action==='roster') {
    if(!['friends','fc'].includes(input.source)||!Number.isInteger(input.page)||input.page<1||input.page>11||typeof input.character_key!=='string')throw new RosterError('Choose a roster and linked character.',400);
    const character=await sql(env,'SELECT lodestone_id FROM characters WHERE account_id=? AND persistent_key=?',accountId,input.character_key).first();
    if(!character)throw new RosterError('Choose a character linked to your account.',403);
    const cached=await sql(env,'SELECT * FROM group_roster_previews WHERE group_id=?',group.id).first();
    if(cached?.fetched_at>now()-2)throw new RosterError('Please wait a moment before loading another roster page.',429);
    const lease=await sql(env,`INSERT INTO group_roster_previews VALUES (?,?,?,?,?) ON CONFLICT(group_id) DO UPDATE SET character_key=excluded.character_key,source=excluded.source,payload=excluded.payload,fetched_at=excluded.fetched_at WHERE group_roster_previews.fetched_at<=? RETURNING group_id`,group.id,input.character_key,input.source,'[]',now(),now()-2).first();
    if(!lease)throw new RosterError('Please wait a moment before loading another roster page.',429);
    const roster=await loadRoster(fetcher,character.lodestone_id,input.source,input.page);
    const previous=cached && cached.character_key===input.character_key && cached.source===input.source && cached.fetched_at>now()-900?JSON.parse(cached.payload):[];
    const all=[...new Map([...previous,...roster.characters].map(c=>[c.lodestone_id,c])).values()].slice(0,550);
    await sql(env,`INSERT INTO group_roster_previews VALUES (?,?,?,?,?) ON CONFLICT(group_id) DO UPDATE SET character_key=excluded.character_key,source=excluded.source,payload=excluded.payload,fetched_at=excluded.fetched_at`,group.id,input.character_key,input.source,JSON.stringify(all),now()).run();
    return {roster};
  }
  if(action==='public-add') {
    if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>50||!input.ids.every(id=>typeof id==='string'))throw new RosterError('Select between 1 and 50 public characters.',400);
    const preview=await sql(env,`SELECT p.* FROM group_roster_previews p WHERE group_id=? AND fetched_at>? AND EXISTS (SELECT 1 FROM characters WHERE account_id=? AND persistent_key=p.character_key)`,group.id,now()-900,accountId).first();
    if(!preview)throw new RosterError('Load the public roster again before adding characters.',409);
    const allowed=new Map(JSON.parse(preview.payload).map(c=>[c.lodestone_id,c]));
    if(input.ids.some(id=>!allowed.has(id)))throw new RosterError('Choose characters from the loaded roster.',400);
    const existing=await sql(env,'SELECT lodestone_id FROM group_public_characters WHERE group_id=? UNION SELECT lodestone_id FROM collection_members WHERE group_id=?',group.id,group.id).all();
    const needed=[...new Set(input.ids)].filter(id=>!existing.results.some(c=>c.lodestone_id===id));
    const count=await sql(env,'SELECT COUNT(*) AS n FROM group_public_characters WHERE group_id=?',group.id).first();
    if(count.n+needed.length>50)throw new RosterError('A group can compare up to 50 public characters. Select fewer or remove an existing import.',409);
    await env.DB.batch([...new Set(input.ids)].map(id=>{const c=allowed.get(id);return sql(env,`INSERT OR IGNORE INTO group_public_characters (id,group_id,lodestone_id,name,home_world,source)
      SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM group_public_characters WHERE group_id=?)<50
      AND NOT EXISTS (SELECT 1 FROM collection_members WHERE group_id=? AND lodestone_id=?)`,crypto.randomUUID(),group.id,id,c.name,c.home_world,preview.source,group.id,group.id,id);}));
    return {saved:true};
  }
  if(typeof input.public_id!=='string'||input.public_id.length>128)throw new RosterError('Choose a public character.',400);
  if(action==='public-remove') {
    await sql(env,'DELETE FROM group_public_characters WHERE group_id=? AND id=?',group.id,input.public_id||'').run();return {saved:true};
  }
  const entry=await sql(env,`SELECT p.* FROM group_public_characters p WHERE group_id=? AND id=? AND NOT EXISTS (SELECT 1 FROM collection_members m WHERE m.group_id=p.group_id AND m.lodestone_id=p.lodestone_id)`,group.id,input.public_id||'').first();
  if(!entry)throw new RosterError('This public character is no longer in the comparison.',404);
  if(entry.next_check_at>now())return {saved:true};
  let snapshot=null,status;
  if(input.profile){try{snapshot=normalizeCollections(input.profile,entry.lodestone_id);status='ready';}catch{throw new RosterError('The collection response was invalid.',400);}}
  else if(['private','not_found','unavailable'].includes(input.status))status=input.status;
  else throw new RosterError('Expected public collection data.',400);
  await sql(env,`UPDATE group_public_characters SET payload=?,status=?,checked_at=?,next_check_at=? WHERE group_id=? AND id=? AND next_check_at<=?`,snapshot?JSON.stringify(snapshot):null,status,now(),now()+(status==='ready'?3600:300),group.id,entry.id,now()).run();
  return {saved:true};
}
