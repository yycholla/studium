(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const node = (tag, text, cls) => { const e=document.createElement(tag); if(text)e.textContent=text;if(cls)e.className=cls;return e; };
  const typeNames = {friends:'Friends',fc:'Free company',party:'Temporary party'};
  const collectionNames = {all:'All collections',mounts:'Mounts',minions:'Minions',emotes:'Emotes',facewear:'Facewear'};
  const kindNames = {mounts:'Mount',minions:'Minion',emotes:'Emote',facewear:'Facewear'};
  let account=null, csrf=null, generation=0, reads=0, accountEvents=0, busy=false, active=null, groups=[], catalogs=[], catalogErrors=0, catalogLoading=false, selected=new Set(), limit=12;
  let invitation='', preview=null, roster=null, rosterPicked=new Set(), publicSyncing=false, syncAbort=null, rosterRevision=0;
  const publicRetries=new Map();
  const storageKey='studium-group-invitation';
  try { invitation=sessionStorage.getItem(storageKey)||''; } catch { /* Storage can be disabled. */ }
  const incoming=new URLSearchParams(location.hash.slice(1)).get('invite');
  if(incoming) {
    invitation=incoming;
    try{sessionStorage.setItem(storageKey,invitation);}catch{ /* Retain in memory. */ }
    history.replaceState(null,'',location.pathname+location.search);
  }
  const forgetInvitation=()=>{invitation='';preview=null;try{sessionStorage.removeItem(storageKey);}catch{ /* No stored copy. */ }};
  const feedback=message=>{$('group-feedback').textContent=message;};
  async function api(action, body, version=generation) {
    const response=await fetch(`/api/groups/${action}`,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(version!==generation) throw new Error('superseded');
    if(!response.ok) { const error=new Error(data.error||'Unable to load this group. Try again.');error.status=response.status;throw error; }
    return data;
  }
  function lock(value) {
    busy=value;
    for(const button of document.querySelectorAll('#group-workspace button, #group-invitation button')) button.disabled=value;
  }
  async function run(task) {
    if(busy)return;
    const version=generation;reads++;lock(true);feedback('');
    try{await task();}catch(error){if(version===generation && error.message!=='superseded')feedback(error.message);}
    finally{if(version===generation)lock(false);}
  }
  function sharingFields(container, member=null) {
    container.replaceChildren();
    const label=node('label','Character'), select=node('select');select.name='character_key';select.required=true;
    const chars=account?.characters||[];
    for(const c of chars){const o=node('option',`${c.name} · ${c.home_world}`);o.value=c.persistent_key;select.append(o);}
    const match=member ? chars.find(c=>c.lodestone_id===member.character?.lodestone_id) : chars.find(c=>c.persistent_key===account?.selected_character_key);
    if(member && !match){const option=node('option','Choose a currently linked character');option.value='';select.prepend(option);select.value='';}
    else if(match)select.value=match.persistent_key;
    label.append(select);container.append(label);
    const fieldset=node('fieldset');fieldset.append(node('legend','Share with members of this group'));
    for(const [name,text] of [['share_collections','Collection progress'],['share_wishlist','Wishlist goals (without notes)']]) {
      const l=node('label','', 'group-check'),input=node('input');input.type='checkbox';input.name=name;input.checked=Boolean(member?.[name]);l.append(input,document.createTextNode(text));fieldset.append(l);
    }
    container.append(fieldset,node('p','Your chosen character’s name and world are visible to group members. Leave both unchecked to join without sharing progress or goals.','group-small'));
    select.addEventListener('change',()=>{for(const checkbox of fieldset.querySelectorAll('input'))checkbox.checked=false;});
    if(!chars.length)container.append(node('p','Link a verified character from your account menu first.','group-small'));
  }
  const sharing=form=>({character_key:form.elements.character_key.value,share_collections:form.elements.share_collections.checked,share_wishlist:form.elements.share_wishlist.checked});
  function renderList() {
    const target=$('group-list');target.replaceChildren();
    for(const group of groups){const button=node('button',group.name,'group-choice');button.type='button';button.dataset.group=group.id;button.setAttribute('aria-pressed',String(group.id===active?.id));button.append(node('span',`${typeNames[group.kind]} · ${collectionNames[group.collection_focus || 'all']} · ${group.member_count} members`));button.addEventListener('click',()=>run(()=>open(group.id)));target.append(button);}
    if(!groups.length)target.append(node('p','No groups yet. Create one below or follow an invitation.','group-small'));
  }
  async function loadList() {const data=await api('list');groups=data.groups;renderList();}
  function clearDetail() {resetRoster();syncAbort?.abort();active=null;selected.clear();for(const id of ['group-name','group-type','group-expiry','group-result-count'])$(id).textContent='';$('group-detail').hidden=true;$('group-empty').hidden=false;$('group-members').replaceChildren();$('group-results').replaceChildren();$('group-sharing-fields').replaceChildren();$('group-invite-output').replaceChildren();$('group-invite-output').hidden=true;}
  async function open(id) {const data=await api(`detail?id=${encodeURIComponent(id)}`);accept(data,true);}
  function accept(data, full=false) {
    const changed=active?.id!==data.id, focusChanged=active?.collection_focus!==data.collection_focus;active=data;
    if(changed){$('group-collection').value='group';resetRoster();syncAbort?.abort();}
    $('group-import').hidden=!data.is_owner;
    if(changed||focusChanged)limit=12;
    $('group-collection-default').textContent=`Group focus: ${collectionNames[data.collection_focus || 'all']}`;
    $('group-focus-settings').hidden=!data.is_owner;
    if(full||changed||!$('group-focus-form').dataset.dirty){$('group-focus-value').value=data.collection_focus || 'all';delete $('group-focus-form').dataset.dirty;}
    if(changed){selected=new Set(data.members.filter(m=>m.character).map(m=>m.id));limit=12;$('group-invite-output').replaceChildren();$('group-invite-output').hidden=true;}
    else selected=new Set([...selected].filter(id=>data.members.some(m=>m.id===id && m.character)));
    $('group-detail').hidden=false;$('group-empty').hidden=true;
    $('group-name').textContent=data.name;$('group-type').textContent=`${typeNames[data.kind]} · ${collectionNames[data.collection_focus || 'all']}`;
    $('group-expiry').textContent=data.expires_at?`Expires ${new Date(data.expires_at*1000).toLocaleString()}`:'Persistent group · invite only';
    $('group-invite').hidden=!data.is_owner;
    if(full||changed)sharingFields($('group-sharing-fields'),data.members.find(m=>m.self));
    $('group-close-title').textContent=data.is_owner?'Delete group':'Leave group';
    $('group-close-help').textContent=data.is_owner?'Delete this group for everyone? Memberships and invitations are removed. Personal journals are kept.':'Leaving stops sharing your character with this group. You will need an invitation to rejoin.';
    $('group-leave').textContent=data.is_owner?'Delete group for everyone':'Leave this group';
    renderList();renderMembers();renderResults();
  }
  function freshness(member) {
    if(!member.character)return 'Character no longer linked. Shared data is unavailable.';
    const parts=[];
    if(!member.share_collections)parts.push('Collections not shared');
    else if(!member.sync?.snapshot)parts.push(member.public_character?({private:'Collect profile is private',not_found:'Not tracked by FFXIV Collect',unavailable:'Collection service unavailable',pending:'Waiting for public collection sync'}[member.sync?.status]||'Collections unknown'):'Collections unknown · open Field Notes to sync');
    else {
      const states=['mounts','minions','emotes','facewear'].map(k=>StudiumGroupPlanner.ownership(member,k,-1));
      parts.push(states.includes('stale')?'Stale collection data · ownership unknown':states.includes('unknown')?'Some collections private or unknown':'Public collections available');
      const time=Date.parse(member.sync.snapshot.source_updated_at);if(Number.isFinite(time))parts.push(`Source updated ${new Date(time).toLocaleString()}`);
    }
    if(member.public_character)parts.push(`Public ${member.source==='fc'?'FC':'friends'} import · no group access`);else parts.push(member.share_wishlist?'Wishlist shared':'Wishlist not shared');return parts.join(' · ');
  }
  function renderMembers() {
    const target=$('group-members');target.replaceChildren();
    for(const member of active.members) {
      const row=node('div','','group-member'), info=node('div'),label=node('label','','group-check'),check=node('input');check.type='checkbox';check.checked=selected.has(member.id);check.disabled=!member.character;check.dataset.member=member.id;
      label.append(check,document.createTextNode(`${member.character?`${member.character.name} · ${member.character.home_world}`:'Unlinked character'}${member.self?' (you)':''}${member.owner?' · owner':''}`));
      check.addEventListener('change',()=>{check.checked?selected.add(member.id):selected.delete(member.id);limit=12;renderResults();});
      info.append(label,node('p',freshness(member),'group-small'));row.append(info);
      if(active.is_owner&&member.public_character){const button=node('button','Remove public character','secondary-button');button.type='button';button.addEventListener('click',()=>run(async()=>{accept((await api('public-remove',{group_id:active.id,public_id:member.id})).group);feedback('Public character removed.');}));row.append(button);}
      else if(active.is_owner&&!member.self){const details=node('details'),summary=node('summary','Remove member'),button=node('button','Remove & revoke invite','secondary-button');button.type='button';button.addEventListener('click',()=>run(async()=>{const data=await api('remove',{group_id:active.id,member_id:member.id});accept(data.group);$('group-invite-output').replaceChildren();$('group-invite-output').hidden=true;await loadList();feedback('Member removed. The previous invite link has been revoked.');}));details.append(summary,button);row.append(details);}
      target.append(row);
    }
  }
  function renderResults() {
    if(!active)return;
    const collection=$('group-collection').value==='group'?(active.collection_focus || 'all'):$('group-collection').value;
    const ownedBy=$('group-owned-by').value;
    $('group-owner-count-label').hidden=ownedBy!=='exact';$('group-owner-count').max=String(selected.size);
    const results=StudiumGroupPlanner.compare(catalogs,active.members,{collection,ownedBy,requireComplete:$('group-require-complete').checked,ownerCount:$('group-owner-count').valueAsNumber,selected:[...selected],scope:$('group-scope').value,query:$('group-search').value,wishlistOnly:$('group-wishlist-only').checked,everyone:$('group-everyone').checked});
    const target=$('group-results');target.replaceChildren();
    $('group-result-count').textContent=`${results.length} matching activities · ${collectionNames[collection]} · ${selected.size} characters selected`;
    $('group-more').hidden=results.length<=limit;
    for(const result of results.slice(0,limit)) {
      const section=node('article','','group-run');section.append(node('p',result.type,'eyebrow'),node('h3',result.title));
      section.append(node('p',result.people.length?`${result.people.length} could benefit · ${result.missingPeople.length} with confirmed missing rewards · ${result.wishlistPeople.length} with wishlist goals`:result.rewards.some(r=>r.ownership.unknown)?'Everyone with known progress already owns these rewards. Other selected characters have unknown progress.':'Everyone selected already owns these rewards.'));
      const rewards=node('ul','','group-rewards');
      for(const reward of result.rewards){const li=node('li'),link=node('a',`${reward.name} · ${kindNames[reward.kind]} ↗`);link.href=`https://ffxivcollect.com/${reward.kind}/${reward.id}`;link.target='_blank';link.rel='noopener noreferrer';li.append(link,node('p',`${reward.ownership.owned} known owners · ${reward.ownership.missing} confirmed missing · ${reward.ownership.unknown} unknown (${reward.ownership.total} selected)`,'group-small'));const people=node('ul','','group-benefits');
        for(const benefit of reward.benefits){const status=benefit.ownership==='missing'?'Not collected':benefit.ownership==='stale'?'Ownership unknown · stale data':'Ownership unknown';people.append(node('li',`${benefit.name} — ${benefit.wishlist?'Wishlist · ':''}${status}`));}
        li.append(people);rewards.append(li);
      }
      section.append(rewards);target.append(section);
    }
    if(!results.length){const empty=node('div','','group-panel');empty.append(node('h3',catalogLoading?'Loading collection sources…':!selected.size?'Choose who’s coming':'No matching activities yet'),node('p',catalogLoading?'Your group will appear as the catalogs arrive.':catalogErrors?'Some catalogs could not load. Retry below or refresh in a moment.':ownedBy!=='any'?$('group-require-complete').checked?'No rewards match all your filters. Require progress for everyone excludes rewards with any unknown progress. Turn it off to compare available progress, or adjust your filters.':'No rewards match all your filters. Try another owner count or selection. At least one selected character needs fresh public progress for a count filter.':'Try All acquisition sources, adjust your filters, or ask members to share and sync their collections in Field Notes.','group-small'));target.append(empty);}
  }
  async function loadCatalogs() {
    if(catalogLoading)return;catalogLoading=true;$('group-catalog-retry').disabled=true;renderResults();
    const kinds=['mounts','minions','emotes','facewear'];
    const results=await Promise.allSettled(kinds.map(async kind=>{const r=await fetch(`/api/field-notes/catalog?kind=${kind}`,{credentials:'omit'});if(!r.ok)throw Error('catalog');return r.json();}));
    catalogErrors=results.filter(r=>r.status==='rejected').length;
    results.forEach((r,i)=>{if(r.status==='fulfilled'){catalogs=catalogs.filter(c=>c.kind!==kinds[i]);catalogs.push(r.value);}});
    catalogLoading=false;$('group-catalog-retry').hidden=!catalogErrors;$('group-catalog-retry').disabled=false;
    $('group-catalog-status').textContent=catalogErrors?'Some collection sources are unavailable. Results may be incomplete.':catalogs.some(c=>c.stale)?'Using a cached catalog. Source listings may have changed.':'Sources match by type and exact name; difficulty variants remain separate.';
    renderResults();
  }
  function showInvite(data) {
    const target=$('group-invite-output');target.replaceChildren();target.hidden=false;
    const label=node('label','Invitation link'),input=node('input');input.readOnly=true;input.value=data.invite_url;input.addEventListener('focus',()=>input.select());label.append(input);
    const button=node('button','Copy invite link','secondary-button');button.type='button';button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(input.value);feedback('Invitation copied.');}catch{input.focus();input.select();feedback('Select and copy the invitation link.');}});
    target.append(label,button,node('p',`Expires ${new Date(data.invite_expires_at*1000).toLocaleString()}. Previous invite links no longer work. Anyone with this link can join; members choose their own sharing settings.`,'group-small'));
  }
  async function reviewInvitation() {
    const target=$('group-invitation');target.replaceChildren();target.hidden=!invitation;if(!invitation)return;
    target.append(node('h2','You have a group invitation'));
    try {const data=await api('preview',{invite:invitation});preview=data.group;target.replaceChildren();target.append(node('h2',`Join ${preview.name}`),node('p',`${typeNames[preview.kind]} · ${collectionNames[preview.collection_focus || 'all']}${preview.expires_at?` · expires ${new Date(preview.expires_at*1000).toLocaleString()}`:''}`));
      const form=node('form'),fields=node('div');sharingFields(fields);const button=node('button','Join with these sharing choices','primary-button');button.type='submit';form.append(fields,button);
      form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{const data=await api('join',{invite:invitation,...sharing(form)});forgetInvitation();target.replaceChildren();target.hidden=true;accept(data.group,true);await loadList();feedback('Joined the group. Your sharing choices apply only to this group.');});});target.append(form);
    }catch(error){if(error.message==='superseded')return;target.append(node('p',error.message));}
    const dismiss=node('button','Dismiss invitation','secondary-button');dismiss.type='button';dismiss.addEventListener('click',()=>{forgetInvitation();target.replaceChildren();target.hidden=true;});target.append(dismiss);
  }
  async function receiveAccount(data) {
    generation++;reads++;busy=false;publicRetries.clear();const previous=account;account=data.account||null;csrf=data.csrf_token||null;clearDetail();groups=[];renderList();$('group-invitation').replaceChildren();$('group-invitation').hidden=true;feedback('');
    $('group-workspace').hidden=!account;$('group-auth').hidden=Boolean(account);$('group-login').hidden=Boolean(account)||!data.configured;
    $('group-auth-message').textContent=account?'':data.configured?`Sign in to create a group or review an invitation.${invitation?' After signing in, return to Collection groups to review this invitation.':''}`:'Sign-in is currently unavailable. Try again shortly.';
    if(!account){if(previous)forgetInvitation();$('group-create-sharing').replaceChildren();return;}
    const rosterSelect=$('group-roster-character');rosterSelect.replaceChildren();for(const c of account.characters||[]){const o=node('option',`${c.name} · ${c.home_world}`);o.value=c.persistent_key;rosterSelect.append(o);}if(account.selected_character_key)rosterSelect.value=account.selected_character_key;
    sharingFields($('group-create-sharing'));await run(async()=>{await loadList();await reviewInvitation();});
  }
  function resetRoster() {
    rosterRevision++;roster=null;rosterPicked.clear();$('group-roster-results').replaceChildren();$('group-roster-status').textContent='';$('group-roster-next').hidden=true;$('group-roster-add').hidden=true;
  }
  async function loadRoster(page=1) {
    const form=$('group-roster-form'),groupId=active.id,revision=rosterRevision;
    const data=await api('roster',{group_id:groupId,character_key:form.elements.character_key.value,source:form.elements.source.value,page});
    if(active?.id!==groupId||revision!==rosterRevision)return;
    roster=data.roster;
    const target=$('group-roster-results');target.replaceChildren();
    for(const c of roster.characters){const label=node('label','','group-check'),check=node('input');check.type='checkbox';check.value=c.lodestone_id;check.checked=rosterPicked.has(c.lodestone_id);check.disabled=active.members.some(m=>m.character?.lodestone_id===c.lodestone_id);label.append(check,document.createTextNode(`${c.name} · ${c.home_world}${check.disabled?' · already in group':''}`));check.addEventListener('change',()=>{check.checked?rosterPicked.add(c.lodestone_id):rosterPicked.delete(c.lodestone_id);rosterStatus();});target.append(label);}
    $('group-roster-next').hidden=roster.page>=roster.pages;$('group-roster-add').hidden=false;rosterStatus();
  }
  function rosterStatus(){if(roster)$('group-roster-status').textContent=`Page ${roster.page} of ${roster.pages} · ${rosterPicked.size} selected across loaded pages`;}
  $('group-roster-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{resetRoster();await loadRoster();});});
  for(const id of ['group-roster-character','group-roster-source'])$(id).addEventListener('change',resetRoster);
  $('group-roster-next').addEventListener('click',()=>run(()=>loadRoster(roster.page+1)));
  $('group-roster-add').addEventListener('click',()=>run(async()=>{
    if(!rosterPicked.size)throw Error('Choose at least one character from the public roster.');
    const data=await api('public-add',{group_id:active.id,ids:[...rosterPicked]});
    accept(data.group);let added=0;
    for(const m of active.members)if(m.public_character&&rosterPicked.has(m.character.lodestone_id)){selected.add(m.id);added++;}
    resetRoster();renderMembers();renderResults();feedback(`${added} selected public characters are now in this comparison. Public collections will sync automatically.`);
  }));
  async function readPublicCollections(id,signal) {
    try {
      const response=await fetch(`https://ffxivcollect.com/api/characters/${id}?ids=1&latest=1`,{credentials:'omit',mode:'cors',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
      const reader=response.body.getReader(),chunks=[];let size=0;
      for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1000000){await reader.cancel();throw Error('size');}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const data=JSON.parse(new TextDecoder().decode(bytes));
      if(!response.ok){if(response.headers.get('Content-Type')?.includes('application/json')){if(response.status===403&&data.status===403&&data.error==='Character is set to private')return {status:'private'};if(response.status===404&&data.status===404&&data.error==='Not found')return {status:'not_found'};}return {status:'unavailable'};}
      const profile={id:data.id,last_parsed:data.last_parsed};
      for(const kind of Object.keys(kindNames)){const value=data[kind];if(value)profile[kind]={public:value.public,count:value.count,ids:value.public===true?value.ids:null};}
      return {profile};
    }catch{return {status:'unavailable'};}
  }
  async function syncPublic() {
    if(!active?.is_owner||busy||publicSyncing||document.hidden)return;
    const member=active.members.find(m=>m.public_character&&m.next_check_at*1000<=Date.now()&&(publicRetries.get(m.id)||0)<=Date.now());
    if(!member)return;
    publicSyncing=true;syncAbort=new AbortController();const controller=syncAbort,version=generation,groupId=active.id;
    publicRetries.set(member.id,Date.now()+300000);
    try {
      const report=await readPublicCollections(member.character.lodestone_id,controller.signal);
      if(controller.signal.aborted||version!==generation||active?.id!==groupId)return;
      // Do not let background work overwrite a newer sharing/import mutation or poll.
      if(busy||!active.members.some(m=>m.id===member.id&&m.public_character))return;
      const sequence=++reads;
      const data=await api('public-sync',{group_id:groupId,public_id:member.id,...report},version);
      if(version===generation&&active?.id===groupId&&sequence===reads&&!busy)accept(data.group);
    }catch(error){if(version===generation&&active?.id===groupId&&error.message!=='superseded')feedback(error.message);}
    finally{publicSyncing=false;}
  }
  $('group-public-refresh').addEventListener('click',()=>{feedback('Checking public characters whose sync is due. Successful checks are cached for an hour.');syncPublic();});
  setInterval(syncPublic,1500);
  $('group-create').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;run(async()=>{const data=await api('create',{name:form.elements.name.value,kind:form.elements.kind.value,collection_focus:form.elements.collection_focus.value,...sharing(form)});accept(data.group,true);showInvite(data);await loadList();$('group-create-details').open=false;form.elements.name.value='';sharingFields($('group-create-sharing'));feedback('Group created. Send the invitation link to your friends.');});});
  $('group-sharing').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;run(async()=>{const data=await api('sharing',{group_id:active.id,...sharing(form)});accept(data.group,true);feedback('Sharing choices saved.');});});
  $('group-focus-value').addEventListener('change',()=>{$('group-focus-form').dataset.dirty='true';});
  $('group-focus-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;run(async()=>{const data=await api('focus',{group_id:active.id,collection_focus:form.elements.collection_focus.value});delete form.dataset.dirty;accept(data.group);await loadList();feedback('Group collection focus saved. Members using Group focus will see the new comparison.');});});
  $('group-invite').addEventListener('click',()=>run(async()=>showInvite(await api('invite',{group_id:active.id}))));
  $('group-leave').addEventListener('click',()=>run(async()=>{await api(active.is_owner?'delete':'leave',{group_id:active.id});clearDetail();await loadList();feedback('Group closed or left. Your personal journal is unchanged.');}));
  $('group-reload').addEventListener('click',()=>run(loadList));
  $('group-refresh').addEventListener('click',()=>run(async()=>{try{const data=await api(`detail?id=${encodeURIComponent(active.id)}`);accept(data);feedback('Showing the latest saved group progress. Members can sync new collections in Field Notes.');}catch(error){if([401,404].includes(error.status)){clearDetail();await loadList();}throw error;}}));
  for(const id of ['group-search','group-collection','group-scope','group-owned-by','group-owner-count','group-require-complete','group-wishlist-only','group-everyone'])$(id).addEventListener(['group-search','group-owner-count'].includes(id)?'input':'change',()=>{limit=12;renderResults();});
  $('group-more').addEventListener('click',()=>{limit+=12;renderResults();});$('group-catalog-retry').addEventListener('click',loadCatalogs);
  async function refresh() {
    if(!active||busy||document.hidden)return;
    const version=generation, sequence=++reads, id=active.id;
    try{const data=await api(`detail?id=${encodeURIComponent(id)}`);if(version===generation&&sequence===reads&&active?.id===id)accept(data);}
    catch(error){if(version!==generation||sequence!==reads)return;if([401,404].includes(error.status))clearDetail();if(error.message!=='superseded')feedback(error.message);}
  }
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);setInterval(refresh,30000);
  window.addEventListener('studium:account',event=>{accountEvents++;receiveAccount(event.detail||{});});
  (async()=>{const count=accountEvents;try{const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('session');const data=await response.json();if(count===accountEvents)await receiveAccount(data);}catch{if(count===accountEvents){$('group-auth-message').textContent='Unable to load your account. Refresh to try again.';}}})();
  loadCatalogs();
})();
