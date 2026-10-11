import { publicCharacters, publicAction, RosterError } from './public-rosters.mjs';
import { KINDS } from './field-notes.mjs';
const collectionFocus = value => ['all', ...KINDS].includes(value);
const now = () => Math.floor(Date.now() / 1000);
const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const token = () => { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2,'0')).join('');
const valid = (value, length = 128) => typeof value === 'string' && value.length > 0 && value.length <= length;
const inviteValid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const reply = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const metadata = group => ({id:group.id,name:group.name,kind:group.kind,collection_focus:group.collection_focus,expires_at:group.expires_at});
const inviteReply = (config, raw, expires) => ({invite_url:`${config.origin}/groups#invite=${raw}`,invite_expires_at:expires});

async function detail(env, group, accountId) {
  const {results: rows} = await stmt(env, `SELECT m.*,
    (SELECT name FROM characters WHERE account_id=m.account_id AND lodestone_id=m.lodestone_id LIMIT 1) AS name,
    (SELECT home_world FROM characters WHERE account_id=m.account_id AND lodestone_id=m.lodestone_id LIMIT 1) AS home_world,
    c.payload, c.status, c.checked_at
    FROM collection_members m LEFT JOIN field_collections c
    ON c.account_id=m.account_id AND c.lodestone_id=m.lodestone_id AND m.share_collections=1
    WHERE m.group_id=? ORDER BY m.joined_at, m.id`, group.id).all();
  const {results: goals} = await stmt(env, `SELECT m.id AS member_id, g.kind, g.item_id
    FROM collection_members m JOIN field_goals g ON g.account_id=m.account_id AND g.lodestone_id=m.lodestone_id
    WHERE m.group_id=? AND m.share_wishlist=1 AND EXISTS
    (SELECT 1 FROM characters WHERE account_id=m.account_id AND lodestone_id=m.lodestone_id)`, group.id).all();
  const members = rows.map(row => {
    const linked = Boolean(row.name);
    let snapshot = null;
    if (linked && row.share_collections && row.payload && !['private','not_found'].includes(row.status)) {
      const stored = JSON.parse(row.payload);
      // Explicit allowlist: never return provider/private fields or personal notes.
      snapshot = {source_updated_at:stored.source_updated_at, collections:Object.fromEntries(KINDS.map(kind => {
        const entry = stored.collections?.[kind];
        return [kind, entry?.visibility === 'public' && Array.isArray(entry.ids)
          ? {visibility:'public',ids:entry.ids} : {visibility:entry?.visibility === 'private' ? 'private' : 'unknown',ids:null}];
      }))};
    }
    return {id:row.id, self:row.account_id===accountId, owner:row.account_id===group.owner_id,
      character:linked ? {lodestone_id:row.lodestone_id,name:row.name,home_world:row.home_world} : null,
      share_collections:Boolean(row.share_collections), share_wishlist:Boolean(row.share_wishlist),
      sync:linked && row.share_collections ? {status:row.status || 'pending',checked_at:row.checked_at,snapshot} : null,
      goals:linked && row.share_wishlist ? goals.filter(g=>g.member_id===row.id).map(({kind,item_id})=>({kind,item_id})) : null};
  });
  return {...metadata(group),is_owner:group.owner_id===accountId,members:[...members,...await publicCharacters(env,group.id)]};
}

export async function handleGroups(request, env, current, config, fetcher=fetch) {
  const url = new URL(request.url), action = url.pathname.slice('/api/groups/'.length);
  const methods = {list:'GET',detail:'GET',preview:'POST',create:'POST',join:'POST',sharing:'POST',focus:'POST',invite:'POST',remove:'POST',leave:'POST',delete:'POST',roster:'POST','public-add':'POST','public-remove':'POST','public-sync':'POST'};
  if (!Object.hasOwn(methods, action)) return reply({error:'Not found.'},404);
  if (request.method !== methods[action]) return reply({error:`Use ${methods[action]}.`},405);
  if (!current) return reply({error:'Sign in to use collection groups.'},401);
  let input = {};
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== config.origin || request.headers.get('X-CSRF-Token') !== current.csrf_token) return reply({error:'Refresh this page and try again.'},403);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({error:'Expected JSON.'},415);
    const body = await request.text();
    if (body.length > (action==='public-sync'?300000:4096)) return reply({error:'Request too large.'},413);
    try { input = JSON.parse(body); } catch { return reply({error:'Invalid JSON.'},400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({error:'Invalid request.'},400);
  }
  // Expired parties become inaccessible immediately; clean their records on group activity.
  await stmt(env,'DELETE FROM collection_groups WHERE expires_at IS NOT NULL AND expires_at <= ?',now()).run();
  await stmt(env,'DELETE FROM group_roster_previews WHERE fetched_at<=?',now()-900).run();
  const accountId = current.account_id;
  if (action === 'list') {
    const {results} = await stmt(env,`SELECT g.id,g.name,g.kind,g.collection_focus,g.expires_at, g.owner_id=? AS is_owner,
      (SELECT COUNT(*) FROM collection_members WHERE group_id=g.id) AS member_count
      FROM collection_groups g JOIN collection_members m ON m.group_id=g.id WHERE m.account_id=? ORDER BY g.created_at DESC`,accountId,accountId).all();
    return reply({groups:results.map(g=>({...g,is_owner:Boolean(g.is_owner)}))});
  }
  let group;
  if (['preview','join'].includes(action)) {
    if (!inviteValid(input.invite)) return reply({error:'This invitation is invalid or expired.'},404);
    group = await stmt(env,'SELECT * FROM collection_groups WHERE invite_hash=? AND invite_expires_at>?',await digest(input.invite),now()).first();
    if (!group) return reply({error:'This invitation is invalid or expired.'},404);
    if (action === 'preview') return reply({group:metadata(group)});
  } else if (action !== 'create') {
    const id = request.method === 'GET' ? url.searchParams.get('id') : input.group_id;
    if (!valid(id)) return reply({error:'Choose a group.'},400);
    group = await stmt(env,`SELECT g.* FROM collection_groups g JOIN collection_members m ON m.group_id=g.id WHERE g.id=? AND m.account_id=?`,id,accountId).first();
    if (!group) return reply({error:'This group is unavailable or you are no longer a member.'},404);
    if (action === 'detail') return reply(await detail(env,group,accountId));
  }
  if (['create','join','sharing'].includes(action)) {
    if (typeof input.share_collections !== 'boolean' || typeof input.share_wishlist !== 'boolean') return reply({error:'Choose what to share with this group.'},400);
    if (!valid(input.character_key)) return reply({error:'Choose a linked character.'},400);
    const character = await stmt(env,'SELECT lodestone_id FROM characters WHERE account_id=? AND persistent_key=?',accountId,input.character_key).first();
    if (!character) return reply({error:'That character is not linked to your account.'},403);
    const flags = [Number(input.share_collections),Number(input.share_wishlist)];
    if (action === 'create') {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name || name.length > 80 || !['friends','fc','party'].includes(input.kind)) return reply({error:'Enter a group name (up to 80 characters) and choose a group type.'},400);
      const focus = input.collection_focus === undefined ? 'all' : input.collection_focus;
      if (!collectionFocus(focus)) return reply({error:'Choose a supported collection focus.'},400);
      const id = crypto.randomUUID(), raw = token(), timestamp = now();
      const expires = input.kind === 'party' ? timestamp+86400 : null, inviteExpires = expires || timestamp+7*86400;
      await env.DB.batch([
        stmt(env,`INSERT INTO collection_groups (id,owner_id,name,kind,created_at,expires_at,invite_hash,invite_expires_at,collection_focus)
          SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM collection_members WHERE account_id=?)<20
          AND (SELECT COUNT(*) FROM collection_groups WHERE owner_id=?)<10`,id,accountId,name,input.kind,timestamp,expires,await digest(raw),inviteExpires,focus,accountId,accountId),
        stmt(env,`INSERT INTO collection_members (id,group_id,account_id,lodestone_id,share_collections,share_wishlist,joined_at)
          SELECT ?,id,?,?,?,?,? FROM collection_groups WHERE id=?`,crypto.randomUUID(),accountId,character.lodestone_id,...flags,timestamp,id),
      ]);
      group = await stmt(env,'SELECT * FROM collection_groups WHERE id=?',id).first();
      if (!group) return reply({error:'You can join up to 20 groups and own up to 10. Leave or delete one first.'},409);
      return reply({group:await detail(env,group,accountId),...inviteReply(config,raw,inviteExpires)});
    }
    if (action === 'join') {
      // Invitation validity and both membership caps are checked atomically with insertion.
      const added = await stmt(env,`INSERT OR IGNORE INTO collection_members
        (id,group_id,account_id,lodestone_id,share_collections,share_wishlist,joined_at)
        SELECT ?,id,?,?,?,?,? FROM collection_groups WHERE id=? AND invite_hash=? AND invite_expires_at>?
        AND (expires_at IS NULL OR expires_at>?)
        AND (SELECT COUNT(*) FROM collection_members WHERE group_id=?)<50
        AND (SELECT COUNT(*) FROM collection_members WHERE account_id=?)<20 RETURNING id`,
        crypto.randomUUID(),accountId,character.lodestone_id,...flags,now(),group.id,await digest(input.invite),now(),now(),group.id,accountId).first();
      if (!added) return reply({error:'Unable to join: you or this character may already be a member, a group limit was reached, or the invitation changed. Open My groups or request a new invitation.'},409);
    } else {
      const duplicate = await stmt(env,'SELECT id FROM collection_members WHERE group_id=? AND lodestone_id=? AND account_id<>?',group.id,character.lodestone_id,accountId).first();
      if (duplicate) return reply({error:'That character is already in this group.'},409);
      const updated = await stmt(env,`UPDATE OR IGNORE collection_members SET lodestone_id=?,share_collections=?,share_wishlist=? WHERE group_id=? AND account_id=? RETURNING id`,character.lodestone_id,...flags,group.id,accountId).first();
      if (!updated) return reply({error:'Sharing could not be saved. Refresh and try again.'},409);
    }
    await stmt(env,'DELETE FROM group_public_characters WHERE group_id=? AND lodestone_id=?',group.id,character.lodestone_id).run();
    return reply({group:await detail(env,group,accountId)});
  }
  if (action === 'leave') {
    if (group.owner_id === accountId) return reply({error:'As owner, delete the group to close it for everyone.'},409);
    await stmt(env,'DELETE FROM collection_members WHERE group_id=? AND account_id=?',group.id,accountId).run();
    return reply({ok:true});
  }
  if (group.owner_id !== accountId) return reply({error:'Only the group owner can do that.'},403);
  if (['roster','public-add','public-remove','public-sync'].includes(action)) {
    try {
      const result=await publicAction(action,input,env,group,accountId,fetcher);
      return reply(result.roster?result:{group:await detail(env,group,accountId)});
    } catch(error) {
      if(error instanceof RosterError)return reply({error:error.message},error.status);
      console.error(JSON.stringify({event:'studium_roster_failure',action}));
      return reply({error:'The public roster service is unavailable. Try again shortly.'},503);
    }
  }
  if (action === 'focus') {
    if (!collectionFocus(input.collection_focus)) return reply({error:'Choose a supported collection focus.'},400);
    const updated = await stmt(env,'UPDATE collection_groups SET collection_focus=? WHERE id=? AND owner_id=? RETURNING *',input.collection_focus,group.id,accountId).first();
    if (!updated) return reply({error:'This group is no longer available.'},404);
    return reply({group:await detail(env,updated,accountId)});
  }
  if (action === 'delete') {
    await stmt(env,'DELETE FROM collection_groups WHERE id=? AND owner_id=?',group.id,accountId).run();
    return reply({ok:true});
  }
  if (action === 'remove') {
    if (!valid(input.member_id)) return reply({error:'Choose a member.'},400);
    // Revoke the existing invite as well, so a removed member cannot reuse it.
    await env.DB.batch([
      stmt(env,'DELETE FROM collection_members WHERE group_id=? AND id=? AND account_id<>?',group.id,input.member_id,accountId),
      stmt(env,'UPDATE collection_groups SET invite_expires_at=0 WHERE id=?',group.id),
    ]);
    return reply({group:await detail(env,group,accountId)});
  }
  const raw = token(), expires = Math.min(now()+7*86400,group.expires_at || Infinity);
  await stmt(env,'UPDATE collection_groups SET invite_hash=?,invite_expires_at=? WHERE id=?',await digest(raw),expires,group.id).run();
  return reply(inviteReply(config,raw,expires));
}
