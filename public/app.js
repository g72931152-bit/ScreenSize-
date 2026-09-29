const PRESETS = [
  { id: 'mobile', group: 'mobile', name: 'Mobile', detail: '390 × 844', width: 390, height: 844 },
  { id: 'mobile-wide', group: 'mobile', name: 'Large Mobile', detail: '430 × 932', width: 430, height: 932 },
  { id: 'tablet', group: 'tablet', name: 'Tablet', detail: '820 × 1180', width: 820, height: 1180 },
  { id: 'desktop', group: 'desktop', name: 'Desktop', detail: '1440 × 900', width: 1440, height: 900 },
  { id: 'desktop-wide', group: 'desktop', name: 'Wide Desktop', detail: '1920 × 1080', width: 1920, height: 1080 }
];

const HISTORY_KEY = 'screensize.recent.v3';
const MAX_HISTORY = 6;
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';
const $ = id => document.getElementById(id);
const form = $('previewForm'), urlInput = $('urlInput'), previewButton = $('previewButton'), urlMessage = $('urlMessage');
const previewGrid = $('previewGrid'), loadState = $('loadState'), reloadAll = $('reloadAll'), shareProject = $('shareProject');
const recentPanel = $('recentPanel'), recentList = $('recentList'), clearHistory = $('clearHistory');
const customSize = $('customSize'), deviceDialog = $('deviceDialog'), deviceForm = $('deviceForm');
const customName = $('customName'), customWidth = $('customWidth'), customHeight = $('customHeight'), snackbar = $('snackbar');
const tabs = [...document.querySelectorAll('.device-tab')];
const icon = name => `<svg class="i" aria-hidden="true"><use href="/sprite.svg#${name}"/></svg>`;

let currentUrl = '';
let loadToken = 0;
let toastTimer = 0;
const cardTimers = new WeakMap();

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function toast(text) {
  snackbar.textContent = text;
  snackbar.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => snackbar.classList.remove('is-visible'), 2800);
}

function setMessage(text = '', type = '') {
  urlMessage.textContent = text;
  urlMessage.className = `url-message${type ? ` ${type}` : ''}`;
}

function setLoading(isLoading, label = 'Ready') {
  previewButton.disabled = isLoading;
  reloadAll.disabled = isLoading;
  loadState.textContent = label;
  loadState.classList.toggle('is-loading', isLoading);
  document.body.classList.toggle('is-loading', isLoading);
}

function getHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(list) ? list.filter(item => typeof item === 'string').slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(targetUrl) {
  const list = [targetUrl, ...getHistory().filter(item => item !== targetUrl)].slice(0, MAX_HISTORY);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {}
  renderHistory();
}

function renderHistory() {
  const items = getHistory();
  recentPanel.hidden = !items.length;
  recentList.innerHTML = items.map(target => `
    <button class="recent-chip" type="button" data-url="${escapeHtml(target)}" title="Preview ${escapeHtml(target)}">${escapeHtml(target.replace(/^https?:\/\//i, '').replace(/\/$/, ''))}</button>`).join('');
}

function startPreview(target) {
  urlInput.value = target;
  const next = new URL(window.location.href);
  next.searchParams.set('url', target);
  window.history.replaceState({}, '', next);
  loadPreviews(target);
}

function cardTemplate(preset, index) {
  const name = escapeHtml(preset.name);
  return `<article class="preview-card" style="--i:${index}" data-group="${preset.group}" data-preset="${preset.id}">
    <div class="card-head">
      <div><div class="card-title">${name}</div><div class="card-meta">${escapeHtml(preset.detail)}</div></div>
      <div class="card-actions">
        <button class="small-action enter-action" type="button" title="Open simulator" aria-label="Open ${name} simulator">${icon('expand')}</button>
        <button class="small-action open-action" type="button" title="Open original" aria-label="Open original site">${icon('open')}</button>
        <button class="small-action reload-action" type="button" title="Reload preview" aria-label="Reload ${name} preview">${icon('reload')}</button>
      </div>
    </div>
    <div class="frame-stage" data-width="${preset.width}" data-height="${preset.height}">
      <div class="empty-preview"><div class="preview-logo" aria-hidden="true">
        <div class="preview-logo-mark"><span></span><span></span><span></span></div>
        <div class="preview-logo-caption">No preview yet</div>
      </div></div>
      <div class="frame-wrap"><iframe title="${name} preview" sandbox="${SANDBOX}" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      <div class="frame-status"><div>
        <strong>Embedding unavailable</strong>
        <span class="frame-status-text">This site does not allow ScreenSize to render it here.</span>
        <div class="status-actions"><button class="btn filled status-simulate" type="button">Open simulator</button><button class="btn outlined status-external" type="button">Open original</button></div>
      </div></div>
    </div>
    <div class="card-foot"><span class="state"><span class="state-dot"></span><span class="state-label">Waiting for URL</span></span></div>
  </article>`;
}

function buildCards() {
  previewGrid.innerHTML = PRESETS.map(cardTemplate).join('');
  previewGrid.querySelectorAll('.preview-card').forEach(card => {
    card.querySelector('.enter-action').addEventListener('click', () => openSimulator(card));
    card.querySelector('.open-action').addEventListener('click', () => openOriginal(currentUrl));
    card.querySelector('.reload-action').addEventListener('click', () => loadCard(card, currentUrl, true));
    card.querySelector('.status-simulate').addEventListener('click', () => openSimulator(card));
    card.querySelector('.status-external').addEventListener('click', () => openOriginal(currentUrl));
    resizeFrame(card);
  });
}

function requireUrl(text) {
  if (currentUrl) return true;
  setMessage(text, 'error');
  urlInput.focus();
  return false;
}

function openOriginal(targetUrl) {
  if (!requireUrl('Enter a website address first.')) return;
  const popup = window.open(targetUrl, '_blank', 'noopener,noreferrer');
  if (!popup) window.location.href = targetUrl;
}

function openSimulator(card) {
  if (!requireUrl('Enter a website address first.')) return;
  const query = new URLSearchParams({ url: currentUrl, device: card.dataset.preset });
  window.location.href = `/simulate.html?${query}`;
}

function resizeFrame(card) {
  const stage = card.querySelector('.frame-stage');
  const wrap = card.querySelector('.frame-wrap');
  const width = Number(stage.dataset.width);
  const height = Number(stage.dataset.height);
  const available = stage.clientWidth;
  if (!available) return; // hidden card: measured again when it is shown
  const scale = Math.min(available / width, 1);
  wrap.style.width = `${width}px`;
  wrap.style.height = `${height}px`;
  wrap.style.left = `${Math.max(0, (available - width * scale) / 2)}px`;
  wrap.style.transform = `scale(${scale})`;
  stage.style.height = `${Math.max(200, Math.ceil(height * scale))}px`;
}

function updateAllFrameSizes() {
  previewGrid.querySelectorAll('.preview-card').forEach(resizeFrame);
}

function updateCardState(card, state, text) {
  const stateEl = card.querySelector('.state');
  stateEl.classList.toggle('loaded', state === 'loaded');
  stateEl.classList.toggle('blocked', state === 'error');
  stateEl.classList.toggle('loading', state === 'loading');
  card.querySelector('.state-label').textContent = text;
  const stage = card.querySelector('.frame-stage');
  stage.classList.toggle('is-busy', state === 'loading');
  card.querySelector('.preview-logo-caption').textContent = state === 'loading' ? 'Loading' : 'No preview yet';
}

// mode: 'empty' (logo) | 'ready' (site visible) | 'error' (fallback message)
function setStage(card, mode) {
  card.querySelector('.empty-preview').classList.toggle('is-hidden', mode !== 'empty');
  card.querySelector('.frame-wrap').classList.toggle('is-ready', mode === 'ready');
  card.querySelector('.frame-status').classList.toggle('is-visible', mode === 'error');
}

function clearCardTimer(card) {
  window.clearTimeout(cardTimers.get(card));
  cardTimers.delete(card);
}

async function inspectUrl(targetUrl) {
  const response = await fetch(`/api/inspect?url=${encodeURIComponent(targetUrl)}`, { headers: { Accept: 'application/json' } });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data?.error || 'The website could not be checked.');
  return data;
}

async function loadCard(card, targetUrl, force = false, inspection = null) {
  const token = (card._token = (card._token || 0) + 1);
  const stale = () => card._token !== token;
  const iframe = card.querySelector('iframe');
  const statusText = card.querySelector('.frame-status-text');
  clearCardTimer(card);
  iframe.onload = null;

  if (!targetUrl) {
    iframe.src = 'about:blank';
    setStage(card, 'empty');
    updateCardState(card, 'waiting', 'Waiting for URL');
    return 'waiting';
  }

  setStage(card, 'empty');
  updateCardState(card, 'loading', 'Checking');

  let check = inspection;
  if (!check) {
    try { check = await inspectUrl(targetUrl); } catch { check = { ok: true, uncertain: true }; }
  }
  if (stale()) return 'stale';

  if (check.ok === false) {
    statusText.textContent = `Embedding blocked by ${check.blockedBy.join(' and ')}.`;
    updateCardState(card, 'error', 'Blocked');
    setStage(card, 'error');
    return 'blocked';
  }

  updateCardState(card, 'loading', 'Loading');
  return new Promise(resolve => {
    let settled = false;
    const finish = (result, state, label, text) => {
      if (settled) return;
      settled = true;
      clearCardTimer(card);
      iframe.onload = null;
      if (stale()) return resolve('stale');
      if (text) statusText.textContent = text;
      updateCardState(card, state, label);
      setStage(card, state === 'loaded' ? 'ready' : 'error');
      resolve(result);
    };
    iframe.onload = () => window.setTimeout(() => finish('loaded', 'loaded', 'Loaded'), 150);
    cardTimers.set(card, window.setTimeout(() => finish('timeout', 'error', 'Timed out', 'The site took too long to load.'), 12000));
    // location.replace works across origins and reloads without altering the site's URL
    try { iframe.contentWindow.location.replace(targetUrl); } catch { iframe.src = targetUrl; }
  });
}

async function runAll(targetUrl, force) {
  const token = ++loadToken;
  const cards = [...previewGrid.querySelectorAll('.preview-card')];
  let inspection;
  try {
    inspection = await inspectUrl(targetUrl);
  } catch {
    inspection = { ok: true, uncertain: true };
    setMessage('Loading directly — the embedding policy could not be pre-checked.');
  }
  if (token !== loadToken) return;
  const results = await Promise.all(cards.map(card => loadCard(card, targetUrl, force, inspection)));
  if (token !== loadToken) return;
  const failed = results.filter(result => result === 'blocked' || result === 'timeout').length;
  setLoading(false, failed ? `${results.length - failed} loaded · ${failed} failed` : `${results.length} loaded`);
  setMessage(failed ? 'Some previews could not be embedded. Use the simulator or open the original site.' : '');
}

function loadPreviews(targetUrl) {
  currentUrl = targetUrl;
  setLoading(true, 'Checking…');
  saveHistory(targetUrl);
  setMessage('');
  return runAll(targetUrl, false);
}

function showEmptyState() {
  currentUrl = '';
  setLoading(false, 'Ready');
  previewGrid.querySelectorAll('.preview-card').forEach(card => loadCard(card, '', false));
}

async function shareCurrent() {
  const target = currentUrl || normalizeUrl(urlInput.value);
  if (!target) {
    setMessage('Enter a URL before sharing.', 'error');
    urlInput.focus();
    return;
  }
  const shareUrl = new URL('/', window.location.href);
  shareUrl.searchParams.set('url', target);
  try {
    await navigator.clipboard.writeText(shareUrl.href);
    toast('Link copied');
  } catch {
    setMessage(shareUrl.href);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const target = normalizeUrl(urlInput.value);
  if (!target) {
    setMessage('Enter a valid website address, for example example.com', 'error');
    urlInput.focus();
    return;
  }
  startPreview(target);
});

reloadAll.addEventListener('click', () => {
  if (!requireUrl('Enter a URL first.')) return;
  setLoading(true, 'Reloading…');
  runAll(currentUrl, true);
});

recentList.addEventListener('click', event => {
  const chip = event.target.closest('.recent-chip');
  const target = chip && normalizeUrl(chip.dataset.url);
  if (target) startPreview(target);
});

shareProject.addEventListener('click', shareCurrent);
clearHistory.addEventListener('click', () => {
  try { localStorage.removeItem(HISTORY_KEY); } catch {}
  renderHistory();
  toast('Recent websites cleared');
});

customSize.addEventListener('click', () => {
  if (!requireUrl('Enter a URL before opening a custom viewport.')) return;
  if (typeof deviceDialog.showModal === 'function') deviceDialog.showModal();
  else deviceDialog.setAttribute('open', '');
  customName.focus();
});
$('dialogClose').addEventListener('click', () => deviceDialog.close());
$('dialogCancel').addEventListener('click', () => deviceDialog.close());
deviceDialog.addEventListener('click', event => { if (event.target === deviceDialog) deviceDialog.close(); });
deviceForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!deviceForm.reportValidity()) return;
  const query = new URLSearchParams({
    url: currentUrl, custom: '1',
    name: (customName.value.trim() || 'Custom').slice(0, 24),
    w: String(Math.round(Number(customWidth.value))),
    h: String(Math.round(Number(customHeight.value)))
  });
  deviceDialog.close();
  window.location.href = `/simulate.html?${query}`;
});

tabs.forEach(tab => tab.addEventListener('click', () => {
  const group = tab.dataset.group;
  tabs.forEach(item => item.setAttribute('aria-pressed', String(item === tab)));
  previewGrid.querySelectorAll('.preview-card').forEach(card => card.classList.toggle('is-hidden', group !== 'all' && card.dataset.group !== group));
  window.requestAnimationFrame(updateAllFrameSizes);
}));

window.addEventListener('resize', updateAllFrameSizes, { passive: true });

buildCards();
renderHistory();

const initialUrl = normalizeUrl(new URL(window.location.href).searchParams.get('url') || '');
if (initialUrl) {
  urlInput.value = initialUrl;
  loadPreviews(initialUrl);
} else {
  showEmptyState();
}
