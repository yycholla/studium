(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const kinds = { mounts: 'Mounts', minions: 'Minions', emotes: 'Emotes', facewear: 'Facewear' };
  const sourceLabels = { Achievement: 'Achievements', Trial: 'Trials', Vendor: 'Vendors', Dungeon: 'Dungeons', Raid: 'Raids', Quest: 'Quests' };
  const catalogs = new Map();
  let account = null, csrf = null, character = null, journal = null;
  let revision = 0, generation = 0, accountEvents = 0, busy = false, syncing = false, stateLoading = false;
  let kind = 'all', wishlist = false, limit = 24, catalogErrors = [], catalogLoading = false;
  const feedback = message => { $('field-feedback').textContent = message; };
  const node = (tag, content, className) => {
    const element = document.createElement(tag); if (content) element.textContent = content;
    if (className) element.className = className; return element;
  };
  const keyOf = item => `${item.kind}:${item.id}`;
  const goals = () => new Map((journal?.goals || []).map(g => [`${g.kind}:${g.item_id}`, g]));
  const date = seconds => new Date(seconds * 1000).toLocaleString();
  async function api(path, body, token = csrf) {
    const response = await fetch(`/api/field-notes/${path}`, { credentials: 'same-origin', cache: 'no-store',
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify(body) } : {}) });
    let data;
    try { data = await response.json(); } catch { throw new Error('Field Notes could not load. Please try again.'); }
    if (!response.ok) throw new Error(data.error || 'Field Notes could not load. Please try again.');
    return data;
  }
  function ownership(item) {
    const collection = journal?.sync.snapshot?.collections[item.kind];
    if (!collection || collection.visibility !== 'public' || !Array.isArray(collection.ids)) return 'unknown';
    return collection.ids.includes(item.id) ? 'owned' : 'missing';
  }
  function renderSync() {
    $('field-character').textContent = character ? `${character.name}’s journal` : 'Your character journal';
    $('field-sign-in').hidden = Boolean(account);
    $('field-character-help').hidden = !account || Boolean(character);
    $('field-refresh').hidden = !character;
    $('field-collect-profile').hidden = !character;
    if (character) $('field-collect-profile').href = journal?.sync.status === 'not_found'
      ? `https://ffxivcollect.com/characters/search?name=${encodeURIComponent(character.name)}&server=${encodeURIComponent(character.home_world)}`
      : `https://ffxivcollect.com/characters/${character.lodestone_id}`;
    $('field-sync-time').textContent = '';
    const output = $('field-sync-status');
    if (!account) { output.textContent = 'Browse freely. Sign in to save goals and sync your character’s public collections.'; return; }
    if (!character) { output.textContent = 'Choose or link a verified character using your account menu.'; return; }
    const sync = journal?.sync;
    const due = !sync || sync.next_check_at * 1000 <= Date.now();
    $('field-refresh').disabled = syncing || stateLoading || busy || !due;
    $('field-refresh').textContent = syncing ? 'Checking…' : due ? 'Check for updates' : 'Checked recently';
    if (syncing) output.textContent = 'Checking public collections with FFXIV Collect…';
    else if (!sync) output.textContent = 'Loading this character’s journal…';
    else if (sync.status === 'private') output.textContent = 'This FFXIV Collect profile is private. Make it public to sync; ownership is currently unknown.';
    else if (sync.status === 'not_found') output.textContent = 'This character is not tracked by FFXIV Collect yet. Find it using FFXIV Collect’s character search and select it there, then check again.';
    else if (sync.status === 'unavailable') output.textContent = sync.snapshot ? 'FFXIV Collect could not be reached. Showing the last saved collection data.' : 'FFXIV Collect could not be reached. Ownership is unknown until a sync succeeds.';
    else if (sync.status === 'pending') output.textContent = 'Collection sync is pending. It will retry automatically while this page is open.';
    else {
      const hidden = Object.keys(kinds).filter(k => sync.snapshot?.collections[k]?.visibility !== 'public');
      output.textContent = hidden.length ? `Public collections synced. Ownership is unknown for ${hidden.map(k => kinds[k].toLowerCase()).join(', ')}; check collection visibility on Lodestone.` : 'Public collections synced. Wishlist goals update automatically as you collect them.';
    }
    if (sync) {
      const parts = [];
      if (sync.snapshot) parts.push(`Source updated ${new Date(sync.snapshot.source_updated_at).toLocaleString()}`);
      if (sync.checked_at) parts.push(`Checked ${date(sync.checked_at)}`);
      if (!due) parts.push(`Next check after ${date(sync.next_check_at)}`);
      $('field-sync-time').textContent = parts.join(' · ');
    }
  }
  function card(item, goal) {
    const article = node('article', '', 'field-card'); article.dataset.item = keyOf(item);
    const top = node('div', '', 'field-card-top');
    if (item.icon) {
      // Backend also validates upstream image hosts. Keep cached/client values constrained.
      try { const url = new URL(item.icon); if (url.origin === 'https://ffxivcollect.com' && !url.username && !url.password) {
        const image = node('img'); image.src = url.href; image.alt = ''; image.width = 48; image.height = 48;
        image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.addEventListener('error', () => image.remove(), { once: true }); top.append(image);
      } } catch { /* Missing artwork leaves a text card. */ }
    }
    const title = node('div'); title.append(node('h3', item.name), node('span', `${kinds[item.kind]}${item.patch ? ` · Patch ${item.patch}` : ''}`, 'field-kind')); top.append(title);
    const owned = ownership(item);
    const status = node('p', owned === 'owned' ? '✓ Collected' : owned === 'missing' ? 'Not collected' : 'Ownership unknown', 'field-ownership');
    if (owned !== 'unknown' && journal?.sync.status === 'unavailable') status.append(' · cached');
    status.dataset.owned = String(owned === 'owned');
    const sources = node('ul', '', 'field-sources');
    for (const source of item.sources) sources.append(node('li', `${source.type ? `${source.type} · ` : ''}${source.text}`));
    if (!item.sources.length) sources.append(node('li', 'No acquisition source listed yet.'));
    const actions = node('div', '', 'field-card-bottom');
    const link = node('a', 'View collection entry ↗'); link.href = `https://ffxivcollect.com/${item.kind}/${item.id}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const button = node('button', goal ? 'Remove goal' : 'Save goal', 'secondary-button'); button.type = 'button';
    button.disabled = busy || !character || !journal; button.dataset.goalAction = keyOf(item);
    button.setAttribute('aria-label', `${goal ? 'Remove' : 'Save'} ${item.name} ${goal ? 'from' : 'to'} wishlist`);
    button.addEventListener('click', () => save(item, goal ? 'remove' : 'save', '', button));
    actions.append(link, button); article.append(top, status, sources, actions);
    if (goal) {
      const details = node('details', '', 'field-note'); details.append(node('summary', goal.note ? 'Your note' : 'Add a note'));
      const form = node('form'), label = node('label', `Note for ${item.name}`), textarea = node('textarea');
      textarea.id = `note-${item.kind}-${item.id}`; label.htmlFor = textarea.id; textarea.maxLength = 1000; textarea.value = goal.note;
      const submit = node('button', 'Save note', 'secondary-button'); submit.type = 'submit'; submit.disabled = busy;
      form.addEventListener('submit', event => { event.preventDefault(); save(item, 'save', textarea.value, button); });
      form.append(label, textarea, submit); details.append(form); article.append(details);
    }
    return article;
  }
  function render() {
    renderSync();
    // Do not discard a note being edited during an automatic data refresh.
    if (document.activeElement?.matches('.field-note textarea')) return;
    const saved = goals(); $('field-goal-count').textContent = String(saved.size);
    const query = $('field-search').value.trim().toLocaleLowerCase(), owned = $('field-owned').value;
    const items = [...catalogs.values()].flatMap(c => c.items.map(item => ({ ...item, kind: c.kind })))
      .filter(item => (kind === 'all' || item.kind === kind) && (!wishlist || saved.has(keyOf(item))) &&
        (owned === 'all' || ownership(item) === owned) && (!query || `${item.name} ${item.sources.map(s => `${s.type} ${s.text}`).join(' ')}`.toLocaleLowerCase().includes(query)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const sourceGroup = $('field-group').value === 'source'; $('field-group-hint').hidden = !sourceGroup;
    const sourceTitle = item => {
      const type = item.sources[0]?.type?.trim();
      return type ? (Object.hasOwn(sourceLabels, type) ? sourceLabels[type] : type) : 'Source not listed';
    };
    const groupFor = item => sourceGroup ? sourceTitle(item) : kinds[item.kind];
    items.sort((a, b) => groupFor(a).localeCompare(groupFor(b)) || a.name.localeCompare(b.name));
    const container = $('field-results'); container.replaceChildren(); container.setAttribute('aria-busy', String(catalogLoading));
    const dates = [...catalogs.values()].map(c => c.fetched_at).filter(Boolean);
    $('field-count').textContent = `${items.length} ${wishlist ? 'goals' : 'collectibles'}${catalogErrors.length ? ' · Some collections unavailable' : [...catalogs.values()].some(c => c.stale) ? ' · Cached catalog' : ''}${dates.length ? ` · Catalog updated ${new Date(Math.min(...dates) * 1000).toLocaleDateString()}` : ''}`;
    $('field-retry').hidden = !catalogErrors.length; $('field-retry').disabled = catalogLoading;
    $('field-more').hidden = items.length <= limit;
    const groups = new Map();
    for (const item of items.slice(0, limit)) {
      const name = groupFor(item);
      if (!groups.has(name)) {
        const section = node('section', '', 'field-group'), heading = node('h2', name), grid = node('div', '', 'field-grid');
        section.append(heading, grid); container.append(section); groups.set(name, grid);
      }
      groups.get(name).append(card(item, saved.get(keyOf(item))));
    }
    if (!items.length) {
      const empty = node('div', '', 'empty-state');
      empty.append(node('h3', catalogLoading ? 'Opening the collection…' : wishlist ? 'A fresh page in your journal' : 'No matching collectibles'));
      empty.append(node('p', catalogErrors.length ? 'Some collections could not load. Retry in a moment.' : wishlist ? character ? 'Save goals from the collection to plan your next adventure.' : 'Sign in and choose a character to keep a wishlist.' : owned !== 'all' && !journal?.sync.snapshot ? 'Collection ownership is unknown until your character syncs. Try Everything.' : 'Try another name, source, or collection filter.'));
      container.append(empty);
    }
  }
  async function loadCatalogs() {
    if (catalogLoading) return;
    catalogLoading = true; catalogErrors = []; render();
    const results = await Promise.allSettled(Object.keys(kinds).map(k => api(`catalog?kind=${k}`)));
    results.forEach((result, i) => { const k = Object.keys(kinds)[i]; if (result.status === 'fulfilled') catalogs.set(k, result.value); else catalogErrors.push(k); });
    catalogLoading = false; render();
  }
  async function refreshState() {
    if (!character || busy || stateLoading || syncing) return;
    const version = generation, readRevision = revision, key = character.persistent_key;
    stateLoading = true; renderSync();
    try {
      const data = await api(`state?character=${encodeURIComponent(key)}`);
      if (version !== generation || readRevision !== revision) return;
      journal = data; render();
    } catch (error) { if (version === generation) { feedback(error.message); $('field-sync-status').textContent = 'Your journal could not load. Please try again.'; } }
    finally { if (version === generation) { stateLoading = false; renderSync(); } }
    if (version === generation && journal && journal.sync.next_check_at * 1000 <= Date.now()) await sync();
  }
  async function readCollections(lodestoneId) {
    try {
      const response = await fetch(`https://ffxivcollect.com/api/characters/${lodestoneId}?ids=1&latest=1`, {
        credentials: 'omit', mode: 'cors', redirect: 'error', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000),
      });
      const body = await response.text();
      if (body.length > 1000000) return { failure: 'unavailable' };
      const data = JSON.parse(body);
      if (!response.ok) {
        if (response.status === 403 && data.status === 403 && data.error === 'Character is set to private') return { failure: 'private' };
        if (response.status === 404 && data.status === 404 && data.error === 'Not found') return { failure: 'not_found' };
        return { failure: 'unavailable' };
      }
      // Send only this journal's supported fields, never unrelated provider profile data.
      const profile = { id: data.id, last_parsed: data.last_parsed };
      for (const kind of Object.keys(kinds)) {
        const value = data[kind];
        if (value) profile[kind] = { public: value.public, count: value.count, ids: value.public === true ? value.ids : null };
      }
      return { profile };
    } catch { return { failure: 'unavailable' }; }
  }
  async function sync() {
    if (!character || syncing || busy || !journal || journal.sync.next_check_at * 1000 > Date.now()) return;
    const version = generation, key = character.persistent_key;
    syncing = true; renderSync();
    try {
      const report = await readCollections(character.lodestone_id);
      if (version !== generation) return;
      const data = await api('sync', { character_key: key, ...report });
      if (version !== generation) return;
      // A goal mutation may have completed while this slower sync was in flight.
      journal = { ...data, goals: journal?.goals || data.goals };
    } catch (error) { if (version === generation) feedback(error.message); }
    finally { if (version === generation) { syncing = false; render(); } }
  }
  async function save(item, action, note) {
    if (!character || busy || !journal) return;
    const version = generation, key = character.persistent_key;
    busy = true; revision++;
    document.querySelectorAll('.field-card button').forEach(button => { button.disabled = true; });
    try {
      const data = await api('goal', { character_key: key, kind: item.kind, item_id: item.id, action, note });
      if (version !== generation) return;
      journal = { ...journal, goals: data.goals }; feedback(action === 'remove' ? `${item.name} removed from your wishlist.` : `${item.name} saved to your journal.`);
    } catch (error) { if (version === generation) feedback(error.message); }
    finally {
      if (version === generation) {
        busy = false; document.activeElement?.blur(); render();
        document.querySelector(`[data-goal-action="${item.kind}:${item.id}"]`)?.focus();
      }
    }
  }
  function receiveAccount(data) {
    account = data.account; csrf = data.csrf_token;
    const selected = account?.characters.find(c => c.persistent_key === account.selected_character_key) || null;
    const changed = character?.persistent_key !== selected?.persistent_key;
    character = selected;
    if (changed || !account) {
      generation++; journal = null; busy = false; syncing = false; stateLoading = false; feedback('');
      // Clearing the old character's DOM also removes any unsaved note.
      $('field-results').replaceChildren();
      limit = 24; render(); if (character) refreshState();
    } else renderSync();
  }
  window.addEventListener('studium:account', event => { accountEvents++; receiveAccount(event.detail); });
  // Also initialize if the shared account script finished before this script loaded.
  const startEvents = accountEvents;
  fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error('Account unavailable'); return response.json();
  }).then(data => { if (accountEvents === startEvents) receiveAccount(data); }).catch(() => {
    if (!accountEvents) { receiveAccount({ account: null }); feedback('Account services could not load. You can still browse collections.'); }
  });
  document.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => {
    kind = button.dataset.kind;
    document.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    limit = 24; render();
  }));
  $('field-wishlist').addEventListener('click', () => { wishlist = !wishlist; $('field-wishlist').setAttribute('aria-pressed', String(wishlist)); limit = 24; render(); });
  for (const id of ['field-search', 'field-owned', 'field-group']) $(id).addEventListener(id === 'field-search' ? 'input' : 'change', () => { limit = 24; render(); });
  $('field-more').addEventListener('click', () => { limit += 24; render(); });
  $('field-refresh').addEventListener('click', () => journal ? sync() : refreshState());
  $('field-retry').addEventListener('click', loadCatalogs);
  window.addEventListener('focus', () => { if (!document.hidden) refreshState(); });
  let timer;
  const startTimer = () => { clearInterval(timer); timer = setInterval(() => { if (!document.hidden) refreshState(); }, 300000); };
  startTimer();
  window.addEventListener('pagehide', () => clearInterval(timer));
  window.addEventListener('pageshow', event => { if (event.persisted) { startTimer(); refreshState(); } });
  loadCatalogs();
})();
