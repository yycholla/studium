(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const isAccount = Boolean($('account-status'));
  let csrfToken = null;
  let busy = false;
  let loadGeneration = 0;
  const menu = $('header-account-menu');
  const trigger = $('header-account-trigger');
  const guest = $('account-link');
  const errors = {
    invalid_state: 'That sign-in request expired or could not be verified. Please try again.',
    cancelled: 'Sign-in was cancelled. You can continue browsing or try again.',
    provider: 'We could not complete sign-in with XIVAuth. Please try again.',
  };
  const status = (message, inMenu = true) => {
    if (isAccount) $('account-status').textContent = message;
    $('header-account-feedback').textContent = message;
    $('header-menu-status').textContent = inMenu ? message : '';
    $('header-menu-status').hidden = !inMenu || !message;
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon'); svg.setAttribute('viewBox', '0 0 256 256'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `/assets/icons.svg#${name}`); svg.append(use); return svg;
  }
  function imageUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && ['img2.finalfantasyxiv.com', 'img.finalfantasyxiv.com', 'lds-img.finalfantasyxiv.com'].includes(url.hostname)
        && !url.port && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  function avatar(character) {
    const wrap = document.createElement('span'); wrap.className = 'character-avatar'; wrap.setAttribute('aria-hidden', 'true');
    const fallback = document.createElement('span'); fallback.className = 'character-initials';
    const initials = (character?.name || '').trim().split(/\s+/).slice(0, 2).map(part => part.match(/[\p{L}\p{N}]/u)?.[0] || '').join('').toUpperCase();
    if (initials) fallback.textContent = initials; else fallback.append(icon('user-circle'));
    wrap.append(fallback);
    const source = imageUrl(character?.avatar_url) || imageUrl(character?.portrait_url);
    if (source) {
      const img = document.createElement('img'); img.alt = ''; img.width = 44; img.height = 44;
      img.referrerPolicy = 'no-referrer'; img.decoding = 'async'; img.hidden = true;
      img.addEventListener('load', () => { fallback.hidden = true; img.hidden = false; }, { once: true });
      img.addEventListener('error', () => { img.remove(); fallback.hidden = false; }, { once: true });
      img.src = source; wrap.append(img);
    }
    return wrap;
  }
  function characterDetail(character) {
    const detail = document.createElement('span'); detail.className = 'character-info';
    const name = document.createElement('strong'); name.textContent = character.name;
    const world = document.createElement('span'); world.textContent = `${character.home_world} · ${character.data_center}`;
    detail.append(name, world); return detail;
  }
  function setMenu(open, focusFirst = false) {
    open = Boolean(open && !trigger.hidden);
    menu.hidden = !open; trigger.setAttribute('aria-expanded', String(open));
    if (open && focusFirst) menu.querySelector('button:not(:disabled), a')?.focus();
  }
  function renderHeader(data) {
    const account = data.account;
    const selected = account?.characters.find(c => c.persistent_key === account.selected_character_key);
    guest.hidden = Boolean(account); trigger.hidden = !account;
    if (!account) {
      setMenu(false);
      guest.href = data.configured ? '/auth/login' : '/account';
      $('header-guest-label').textContent = data.configured ? 'Sign in' : 'Account';
      guest.setAttribute('aria-label', data.configured ? 'Sign in with XIVAuth' : 'Account');
      $('header-character-list').replaceChildren();
      $('header-character-avatar').replaceChildren();
      trigger.removeAttribute('aria-label');
      $('header-character-name').textContent = '';
      $('header-character-world').textContent = '';
      $('header-account-name').textContent = '';
      return;
    }
    $('header-character-name').textContent = selected?.name || account.display_name;
    $('header-character-world').textContent = selected ? `${selected.home_world} · ${selected.data_center}` : 'Choose a character';
    trigger.setAttribute('aria-label', `${selected?.name || account.display_name}. Account and character selection`);
    const portrait = avatar(selected || { name: account.display_name });
    $('header-character-avatar').replaceChildren(...portrait.childNodes);
    $('header-account-name').textContent = account.display_name;
    $('header-character-list').replaceChildren();
    $('header-no-characters').hidden = account.characters.length > 0;
    for (const character of account.characters) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'header-character-choice';
      button.dataset.characterKey = character.persistent_key;
      const active = character.persistent_key === account.selected_character_key;
      button.setAttribute('aria-pressed', String(active)); button.disabled = active;
      button.setAttribute('aria-label', `${active ? 'Selected' : 'Use'} ${character.name} on ${character.home_world}`);
      const mark = document.createElement('span'); mark.className = 'character-choice-mark';
      if (active) mark.append(icon('check'));
      button.append(avatar(character), characterDetail(character), mark);
      button.addEventListener('click', () => mutate('/api/auth/character', { persistent_key: character.persistent_key }, `${character.name} selected.`, true));
      $('header-character-list').append(button);
    }
  }
  async function load() {
    const generation = ++loadGeneration;
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Sign-in is temporarily unavailable. Please try again later.');
    const data = await response.json();
    if (generation !== loadGeneration) return;
    csrfToken = data.csrf_token;
    const account = data.account;
    renderHeader(data);
    window.dispatchEvent(new CustomEvent('studium:account', { detail: data }));
    if (!isAccount) return;
    $('account-signed-out').hidden = !data.configured || Boolean(account);
    $('account-signed-in').hidden = !account;
    if (!data.configured) { status('Sign-in is not available yet. Chatpendium is ready to use without an account.', false); return; }
    if (!account) {
      $('account-greeting').textContent = ''; $('account-characters').replaceChildren(); $('account-updated').textContent = '';
      status('Sign in to link your characters.', false); return;
    }
    $('account-greeting').textContent = `Signed in as ${account.display_name}`;
    $('account-characters').replaceChildren();
    $('account-no-characters').hidden = account.characters.length > 0;
    for (const character of account.characters) {
      const row = document.createElement('div'); row.className = 'account-character';
      const detail = document.createElement('div'); detail.className = 'account-character-identity';
      detail.append(avatar(character), characterDetail(character));
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-button';
      const active = character.persistent_key === account.selected_character_key;
      button.textContent = active ? 'Selected' : 'Use character';
      button.setAttribute('aria-label', `${active ? 'Selected' : 'Use'} ${character.name}`);
      button.setAttribute('aria-pressed', String(active)); button.disabled = active;
      button.addEventListener('click', () => mutate('/api/auth/character', { persistent_key: character.persistent_key }, 'Character selected.'));
      row.append(detail, button); $('account-characters').append(row);
    }
    $('account-updated').textContent = `Characters refreshed ${new Date(account.linked_at * 1000).toLocaleString()}.`;
    status('Your account is connected.', false);
  }
  async function mutate(path, body, message, closeAfter = false) {
    if (busy) return;
    busy = true;
    const controls = [...document.querySelectorAll('#account-signed-in button, #header-account-menu button, #header-account-trigger')];
    const previous = controls.map(button => button.disabled);
    controls.forEach(button => { button.disabled = true; });
    let saved = false;
    try {
      const response = await fetch(path, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body || {}) });
      if (!response.ok) {
        if (response.status === 401) await load();
        throw new Error((await response.json()).error || 'Could not save your change.');
      }
      await load(); status(message); saved = true;
    } catch (error) { status(error.message); }
    finally {
      busy = false; controls.forEach((button, i) => { button.disabled = previous[i]; });
      if (closeAfter && (saved || trigger.hidden)) { setMenu(false); (trigger.hidden ? guest : trigger).focus(); }
    }
  }
  trigger.addEventListener('click', () => setMenu(menu.hidden));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setMenu(true, true); }
  });
  menu.addEventListener('keydown', (event) => {
    const buttons = [...menu.querySelectorAll('.header-character-choice:not(:disabled)')];
    const current = buttons.indexOf(document.activeElement);
    if (current < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); setMenu(false); trigger.focus(); }
  });
  document.addEventListener('click', (event) => { if (!$('header-account').contains(event.target)) setMenu(false); });
  $('header-account').addEventListener('focusout', (event) => {
    if (event.relatedTarget && !$('header-account').contains(event.relatedTarget)) setMenu(false);
  });
  $('header-account-logout').addEventListener('click', () => mutate('/api/auth/logout', null, 'Signed out of Studium.', true));
  $('account-logout')?.addEventListener('click', () => mutate('/api/auth/logout', null, 'Signed out of Studium.'));
  $('account-delete')?.addEventListener('click', () => {
    if (window.confirm('Remove your Studium profile, linked characters, and all sign-in sessions?')) {
      mutate('/api/auth/account', null, 'Your Studium account has been removed.');
    }
  });
  async function initialize() {
    try {
      await load();
      if (isAccount) {
        const url = new URL(window.location.href);
        const message = errors[url.searchParams.get('error')];
        const reference = url.searchParams.get('ref') || '';
        const safeReference = /^(token|user|characters|profile|database)-(failed|network|size|json|http|response)(-[1-5][0-9]{2})?(-(invalid_client|invalid_grant|invalid_request|invalid_scope|unauthorized_client|unsupported_grant_type|server_error|temporarily_unavailable))?$/.test(reference);
        if (message) status(`${message}${url.searchParams.get('error') === 'provider' && safeReference ? ` Reference: ${reference}.` : ''}`);
        url.searchParams.delete('ref');
        if (url.searchParams.has('error')) { url.searchParams.delete('error'); history.replaceState(null, '', url); }
      }
    } catch { status('Sign-in is temporarily unavailable. You can still use Chatpendium.'); }
  }
  initialize();
  window.addEventListener('pageshow', (event) => { if (event.persisted) initialize(); });
  window.addEventListener('focus', () => { if (!busy && menu.hidden) load().catch(() => {}); });
})();
