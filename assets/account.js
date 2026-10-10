(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const isAccount = Boolean($('account-status'));
  let csrfToken = null;
  let busy = false;
  const errors = {
    invalid_state: 'That sign-in request expired or could not be verified. Please try again.',
    cancelled: 'Sign-in was cancelled. You can continue browsing or try again.',
    provider: 'We could not complete sign-in with XIVAuth. Please try again.',
  };
  const status = (message) => { if (isAccount) $('account-status').textContent = message; };
  async function load() {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Sign-in is temporarily unavailable. Please try again later.');
    const data = await response.json();
    csrfToken = data.csrf_token;
    const account = data.account;
    const selected = account?.characters.find(c => c.persistent_key === account.selected_character_key);
    if ($('account-link')) $('account-link').textContent = selected?.name || (account ? 'Your account' : 'Account');
    if (!isAccount) return;
    $('account-signed-out').hidden = !data.configured || Boolean(account);
    $('account-signed-in').hidden = !account;
    if (!data.configured) { status('Sign-in is not available yet. Chatpendium is ready to use without an account.'); return; }
    if (!account) { status('Sign in to link your characters.'); return; }
    $('account-greeting').textContent = `Signed in as ${account.display_name}`;
    $('account-characters').replaceChildren();
    $('account-no-characters').hidden = account.characters.length > 0;
    for (const character of account.characters) {
      const row = document.createElement('div'); row.className = 'account-character';
      const detail = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = character.name;
      const world = document.createElement('p'); world.textContent = `${character.home_world} · ${character.data_center}`;
      detail.append(name, world);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-button';
      const active = character.persistent_key === account.selected_character_key;
      button.textContent = active ? 'Selected' : 'Use character';
      button.setAttribute('aria-label', `${active ? 'Selected' : 'Use'} ${character.name}`);
      button.setAttribute('aria-pressed', String(active)); button.disabled = active;
      button.addEventListener('click', () => mutate('/api/auth/character', { persistent_key: character.persistent_key }, 'Character selected.'));
      row.append(detail, button); $('account-characters').append(row);
    }
    $('account-updated').textContent = `Characters refreshed ${new Date(account.linked_at * 1000).toLocaleString()}.`;
    status('Your account is connected.');
  }
  async function mutate(path, body, message) {
    if (busy) return;
    busy = true;
    const controls = [...document.querySelectorAll('#account-signed-in button')];
    const previous = controls.map(button => button.disabled);
    controls.forEach(button => { button.disabled = true; });
    try {
      const response = await fetch(path, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body || {}) });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not save your change.');
      await load(); status(message);
    } catch (error) { status(error.message); }
    finally { busy = false; controls.forEach((button, i) => { button.disabled = previous[i]; }); }
  }
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
        if (message) status(message);
        if (url.searchParams.has('error')) { url.searchParams.delete('error'); history.replaceState(null, '', url); }
      }
    } catch { status('Sign-in is temporarily unavailable. You can still use Chatpendium.'); }
  }
  initialize();
  window.addEventListener('pageshow', (event) => { if (event.persisted) initialize(); });
})();
