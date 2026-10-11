(() => {
  'use strict';
  const kinds = ['mounts','minions','emotes','facewear'];
  const normalize = value => value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
  function ownership(member, kind, id, timestamp = Date.now()) {
    if (!member.character || !member.share_collections || !member.sync?.snapshot) return 'unknown';
    const sourceTime = Date.parse(member.sync.snapshot.source_updated_at), checked = member.sync.checked_at * 1000;
    if (member.sync.status !== 'ready' || !Number.isFinite(sourceTime) || !checked ||
      sourceTime > timestamp+300000 || checked > timestamp+300000 || timestamp-sourceTime>86400000 || timestamp-checked>86400000) return 'stale';
    const collection = member.sync.snapshot.collections[kind];
    if (collection?.visibility !== 'public' || !Array.isArray(collection.ids)) return 'unknown';
    return collection.ids.includes(id) ? 'owned' : 'missing';
  }
  function compare(catalogs, members, {selected = members.map(m=>m.id), scope = 'duties', collection = 'all', query = '', wishlistOnly = false, everyone = false, ownedBy = 'any', ownerCount = 0, requireComplete = false, timestamp = Date.now()} = {}) {
    const participants = members.filter(m=>selected.includes(m.id) && m.character), groups = new Map(), search = normalize(query);
    if (!participants.length) return [];
    for (const catalog of catalogs) for (const item of catalog.items) {
      if (!kinds.includes(catalog.kind) || (collection !== 'all' && catalog.kind !== collection)) continue;
      const states = participants.map(member=>ownership(member,catalog.kind,item.id,timestamp));
      const counts = {owned:states.filter(s=>s==='owned').length,missing:states.filter(s=>s==='missing').length,
        unknown:states.filter(s=>s==='unknown'||s==='stale').length,total:participants.length};
      if (ownedBy !== 'any') {
        // Count known progress without treating unknown characters as missing.
        const known = counts.total-counts.unknown;
        if (!known || (requireComplete && counts.unknown)) continue;
        const matches = {none:counts.owned===0,one:counts.owned===1,some:counts.owned>0&&counts.owned<known,
          'all-but-one':counts.owned===known-1,all:counts.owned===known,
          exact:Number.isInteger(ownerCount)&&ownerCount>=0&&counts.owned===ownerCount};
        if (!Object.hasOwn(matches,ownedBy) || !matches[ownedBy]) continue;
      }
      const benefits = [];
      for (const [index,member] of participants.entries()) {
        const state = states[index];
        const goal = member.share_wishlist && member.goals?.some(g=>g.kind===catalog.kind && g.item_id===item.id);
        if (state === 'owned' || (wishlistOnly && !goal)) continue;
        if (state === 'missing' || goal) benefits.push({member_id:member.id,name:member.character.name,wishlist:Boolean(goal),ownership:state});
      }
      if (!benefits.length && (ownedBy === 'any' || wishlistOnly)) continue;
      const seen = new Set();
      for (const source of item.sources) {
        if (!source.type?.trim() || !source.text?.trim()) continue;
        if (scope === 'duties' && !/^(trials?|raids?|dungeons?|deep dungeons?|v&c dungeons?)$/i.test(source.type.trim())) continue;
        const key = `${normalize(source.type)}:${normalize(source.text)}`;
        if (seen.has(key)) continue; seen.add(key);
        if (search && !normalize(`${source.type} ${source.text} ${item.name}`).includes(search)) continue;
        if (!groups.has(key)) groups.set(key,{key,type:source.type,title:source.text,rewards:[],people:new Set(),wishlistPeople:new Set(),missingPeople:new Set()});
        const group = groups.get(key);
        group.rewards.push({kind:catalog.kind,id:item.id,name:item.name,benefits,ownership:counts});
        for (const benefit of benefits) {
          group.people.add(benefit.member_id);
          if (benefit.wishlist) group.wishlistPeople.add(benefit.member_id);
          if (benefit.ownership === 'missing') group.missingPeople.add(benefit.member_id);
        }
      }
    }
    return [...groups.values()].filter(g=>!everyone || g.people.size === participants.length).map(g=>({...g,
      people:[...g.people],wishlistPeople:[...g.wishlistPeople],missingPeople:[...g.missingPeople],
      rewards:g.rewards.sort((a,b)=>a.name.localeCompare(b.name))
    })).sort((a,b)=>b.people.length-a.people.length || b.wishlistPeople.length-a.wishlistPeople.length || b.missingPeople.length-a.missingPeople.length || b.rewards.length-a.rewards.length || a.title.localeCompare(b.title));
  }
  globalThis.StudiumGroupPlanner = {compare,ownership};
})();
