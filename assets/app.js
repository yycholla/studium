// Progressive enhancement: the complete, selectable catalog is server-rendered.
const $ = (selector) => document.querySelector(selector);
const cards = [...document.querySelectorAll('.expression-card')];
const search = $('#search');
const asciiOnly = $('#ascii-only');
const favoriteFilter = $('#favorites-filter');
const knownIds = new Set(cards.map((card) => card.dataset.id));
const storageKey = 'xiv-chatbook:favorites:v1';
let favorites = new Set();
let category = 'all';
let favoritesOnly = false;
let visibleLimit = 12;
let toastTimer;

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) favorites = new Set(saved.filter((id) => knownIds.has(id)));
} catch { /* Storage can be unavailable; favorites still work for this session. */ }

function notify(message) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
}

function saveFavorites() {
  try { localStorage.setItem(storageKey, JSON.stringify([...favorites])); }
  catch { notify('Favorites will last for this visit. Browser storage is unavailable.'); }
}

function updateFavorites() {
  for (const card of cards) {
    const button = card.querySelector('[data-action="favorite"]');
    const saved = favorites.has(card.dataset.id);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', `${saved ? 'Unfavorite' : 'Favorite'} ${card.dataset.name}`);
    button.textContent = saved ? '★' : '☆';
  }
  $('#favorite-count').textContent = String(favorites.size);
}

function updateUrl() {
  const params = new URLSearchParams();
  if (search.value.trim()) params.set('q', search.value.trim());
  if (category !== 'all') params.set('category', category);
  if (asciiOnly.checked) params.set('ascii', '1');
  if (favoritesOnly) params.set('favorites', '1');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

function render({ syncUrl = true } = {}) {
  const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = cards.filter((card) => {
    const data = card.dataset;
    const haystack = `${data.name} ${data.tags} ${data.text} ${data.category}`.toLowerCase();
    return (category === 'all' || category === data.category)
      && (!asciiOnly.checked || data.ascii === 'true')
      && (!favoritesOnly || favorites.has(data.id))
      && terms.every((term) => haystack.includes(term));
  });
  const visible = new Set(matches.slice(0, visibleLimit));
  for (const card of cards) card.hidden = !visible.has(card);
  $('#results-count').textContent = `${matches.length} expression${matches.length === 1 ? '' : 's'}`;
  $('#empty-state').hidden = matches.length > 0;
  const noFavorites = favoritesOnly && favorites.size === 0;
  $('#empty-title').textContent = noFavorites ? 'Your favorites start here' : 'No expressions found';
  $('#empty-description').textContent = noFavorites
    ? 'Tap the star on an expression to keep it close at hand.'
    : 'Try a different feeling or clear your filters.';
  $('#show-more').hidden = matches.length <= visibleLimit;
  $('#show-more').textContent = `Show more expressions (${matches.length - visibleLimit} remaining)`;
  for (const button of document.querySelectorAll('[data-category].filter')) {
    button.setAttribute('aria-pressed', String(button.dataset.category === category));
  }
  favoriteFilter.setAttribute('aria-pressed', String(favoritesOnly));
  if (syncUrl) updateUrl();
}

function preview(card) {
  for (const item of cards) item.removeAttribute('data-selected');
  card.dataset.selected = 'true';
  $('#preview-text').textContent = card.dataset.text;
  $('#preview-name').textContent = card.dataset.name;
  $('#preview-kind').textContent = card.dataset.ascii === 'true' ? 'ASCII expression' : 'Community-listed symbols';
  $('#copy-preview').dataset.text = card.dataset.text;
}

async function copy(text) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    notify('Copied! Your next chat message awaits.');
  } catch {
    const dialog = $('#copy-dialog');
    const input = $('#manual-copy');
    input.value = text;
    if (!dialog.open) dialog.showModal();
    input.focus();
    input.select();
  }
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  search.value = (params.get('q') || '').slice(0, 120);
  const requested = params.get('category');
  const categories = new Set(['all', ...cards.map((card) => card.dataset.category)]);
  category = categories.has(requested) ? requested : 'all';
  asciiOnly.checked = params.get('ascii') === '1';
  favoritesOnly = params.get('favorites') === '1';
  visibleLimit = 12;
  render({ syncUrl: false });
}

search.addEventListener('input', () => { visibleLimit = 12; render(); });
asciiOnly.addEventListener('change', () => { visibleLimit = 12; render(); });
favoriteFilter.addEventListener('click', () => { favoritesOnly = !favoritesOnly; visibleLimit = 12; render(); });
document.querySelector('.filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  category = button.dataset.category;
  visibleLimit = 12;
  render();
});
for (const button of document.querySelectorAll('[data-query]')) {
  button.addEventListener('click', () => {
    search.value = button.dataset.query;
    category = 'all'; favoritesOnly = false; asciiOnly.checked = false; visibleLimit = 12;
    render(); search.focus();
  });
}
$('#reset-filters').addEventListener('click', () => {
  search.value = ''; category = 'all'; favoritesOnly = false; asciiOnly.checked = false; visibleLimit = 12;
  render(); search.focus();
});
$('#show-more').addEventListener('click', () => {
  const previouslyVisible = new Set(cards.filter((card) => !card.hidden));
  visibleLimit += 12; render();
  cards.find((card) => !card.hidden && !previouslyVisible.has(card))?.querySelector('[data-action="copy"]').focus();
});
$('#results').addEventListener('click', (event) => {
  const card = event.target.closest('.expression-card');
  if (!card) return;
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'favorite') {
    const id = card.dataset.id;
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    saveFavorites(); updateFavorites(); render();
    if (card.hidden) favoriteFilter.focus();
    return;
  }
  preview(card);
  if (action === 'copy') void copy(card.dataset.text);
});
$('#results').addEventListener('focusin', (event) => {
  const card = event.target.closest('.expression-card');
  if (card) preview(card);
});
$('#copy-preview').addEventListener('click', () => { void copy($('#copy-preview').dataset.text); });
document.addEventListener('keydown', (event) => {
  const typing = event.target.closest('input, textarea, [contenteditable="true"]');
  if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey && !$('#copy-dialog').open) {
    event.preventDefault(); search.focus();
  }
  if (event.key === 'Escape' && document.activeElement === search) {
    search.value = ''; visibleLimit = 12; render(); search.blur();
  }
});
window.addEventListener('popstate', readUrl);
window.addEventListener('storage', (event) => {
  if (event.key !== storageKey && event.key !== null) return;
  try {
    const saved = JSON.parse(event.newValue || '[]');
    favorites = new Set(Array.isArray(saved) ? saved.filter((id) => knownIds.has(id)) : []);
    updateFavorites(); render({ syncUrl: false });
  } catch { /* Ignore corrupt storage from another tab. */ }
});

updateFavorites();
readUrl();
document.querySelectorAll('button[disabled], input[disabled]').forEach((element) => { element.disabled = false; });
