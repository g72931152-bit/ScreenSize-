const PRESETS = [
  { id: 'mobile', group: 'mobile', name: 'Mobile', detail: '390 × 844', width: 390, height: 844 },
  { id: 'mobile-wide', group: 'mobile', name: 'Large Mobile', detail: '430 × 932', width: 430, height: 932 },
  { id: 'tablet', group: 'tablet', name: 'Tablet', detail: '820 × 1180', width: 820, height: 1180 },
  { id: 'desktop', group: 'desktop', name: 'Desktop', detail: '1440 × 900', width: 1440, height: 900 },
  { id: 'desktop-wide', group: 'desktop', name: 'Wide Desktop', detail: '1920 × 1080', width: 1920, height: 1080 }
];

const HISTORY_KEY = 'screensize.recent.v2';
const MAX_HISTORY = 6;
const form = document.getElementById('previewForm');
const urlInput = document.getElementById('urlInput');
const previewButton = document.getElementById('previewButton');
const urlMessage = document.getElementById('urlMessage');
const previewGrid = document.getElementById('previewGrid');
const loadState = document.getElementById('loadState');
const reloadAll = document.getElementById('reloadAll');
const shareProject = document.getElementById('shareProject');
const recentList = document.getElementById('recentList');
const clearHistory = document.getElementById('clearHistory');
const customSize = document.getElementById('customSize');
const deviceDialog = document.getElementById('deviceDialog');
const deviceForm = document.getElementById('deviceForm');
const customName = document.getElementById('customName');
const customWidth = document.getElementById('customWidth');
const customHeight = document.getElementById('customHeight');
const tabs = [...document.querySelectorAll('.device-tab')];

let currentUrl = '';
let loadToken = 0;
let cardTimers = new WeakMap();

function escapeHtml(value) {
  return String(value).replace(/[&<>\'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function setMessage(text = '', type = '') {
  urlMessage.textContent = text;
  urlMessage.className = `url-message${type ? ` ${type}` : ''}`;
}

function setLoading(isLoading) {
  previewButton.disabled = isLoading;
  reloadAll.disabled = isLoading;
  loadState.textContent = isLoading ? 'Loading…' : 'Ready';
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
  const history = getHistory();
  if (!history.length) {
    recentList.innerHTML = '<span class="recent-empty">Your recently previewed websites will appear here.</span>';
    clearHistory.disabled = true;
    return;
  }
  clearHistory.disabled = false;
  recentList.innerHTML = history.map(target => `
    <button class="recent-chip" type="button" data-url="${escapeHtml(target)}" title="Preview ${escapeHtml(target)}">
      <span class="recent-dot"></span><span>${escapeHtml(target.replace(/^https?:\/\//i, '').replace(/\/$/, ''))}</span>
    </button>`).join('');
  recentList.querySelectorAll('.recent-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const target = normalizeUrl(chip.dataset.url);
      if (!target) return;
      urlInput.value = target;
      loadPreviews(target);
    });
  });
}

function logoMarkup(extraClass = '') {
  return `
    <div class="preview-logo ${extraClass}" aria-hidden="true">
      <div class="preview-logo-mark"><span></span><span></span><span></span></div>
      <div class="preview-logo-name">ScreenSize</div>
      <div class="preview-logo-pulse"></div>
      <div class="preview-logo-caption">Awaiting URL</div>
    </div>`;
}

function cardTemplate(preset) {
  return `
    <article class="preview-card" data-group="${preset.group}" data-preset="${preset.id}">
      <div class="card-head">
        <div>
          <div class="card-title">${escapeHtml(preset.name)}</div>
          <div class="card-meta">${escapeHtml(preset.detail)}</div>
        </div>
        <div class="card-actions">
          <button class="small-action enter-action" type="button" title="Enter simulator" aria-label="Enter ${escapeHtml(preset.name)} simulator">⛶</button>
          <button class="small-action open-action" type="button" title="Open original" aria-label="Open ${escapeHtml(preset.name)} original">↗</button>
          <button class="small-action reload-action" type="button" title="Reload preview" aria-label="Reload ${escapeHtml(preset.name)} preview">↻</button>
        </div>
      </div>
      <div class="frame-stage" data-width="${preset.width}" data-height="${preset.height}">
        <div class="empty-preview">${logoMarkup()}</div>
        <div class="frame-wrap" style="width:${preset.width}px;height:${preset.height}px">
          <iframe title="${escapeHtml(preset.name)} preview" loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>
        <div class="frame-status"><div>
          <strong>Preview unavailable</strong>
          <span>This site may block embedding. Use the simulator or open the original site.</span>
          <div class="status-actions"><button class="status-simulate" type="button">Open simulator</button><button class="status-external" type="button">Open original</button></div>
        </div></div>
      </div>
      <div class="card-foot">
        <span class="state"><span class="state-dot"></span><span class="state-label">Waiting for URL</span></span>
        <span>viewport</span>
      </div>
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

function openOriginal(targetUrl) {
  if (!targetUrl) return;
  const popup = window.open(targetUrl, '_blank', 'noopener,noreferrer');
  if (!popup) setMessage('The browser blocked the new tab. Allow pop-ups for ScreenSize.', 'error');
}

function openSimulator(card) {
  if (!currentUrl) {
    setMessage('Enter a website address first.', 'error');
    urlInput.focus();
    return;
  }
  const preset = PRESETS.find(item => item.id === card.dataset.preset);
  if (!preset) return;
  const query = new URLSearchParams({ url: currentUrl, device: preset.id });
  window.open(`/simulate.html?${query.toString()}`, '_blank', 'noopener,noreferrer');
}

function openCustomSimulator() {
  if (!currentUrl) {
    setMessage('Enter a website address first.', 'error');
    urlInput.focus();
    return;
  }
  if (typeof deviceDialog.showModal === 'function') deviceDialog.showModal();
  else deviceDialog.setAttribute('open', '');
  customName.focus();
}

function resizeFrame(card) {
  const stage = card.querySelector('.frame-stage');
  const wrap = card.querySelector('.frame-wrap');
  const width = Number(stage.dataset.width);
  const height = Number(stage.dataset.height);
  const available = Math.max(100, stage.clientWidth - 26);
  const scale = Math.min(available / width, 1);
  wrap.style.transform = `scale(${scale})`;
  stage.style.height = `${Math.ceil(height * scale)}px`;
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
}

function setEmptyVisible(card, visible) {
  card.querySelector('.empty-preview').classList.toggle('is-hidden', !visible);
  card.querySelector('.frame-wrap').classList.toggle('is-ready', !visible);
}

function clearCardTimer(card) {
  const timer = cardTimers.get(card);
  if (timer) window.clearTimeout(timer);
  cardTimers.delete(card);
}

function loadCard(card, targetUrl, force = false) {
  const iframe = card.querySelector('iframe');
  const status = card.querySelector('.frame-status');
  clearCardTimer(card);

  if (!targetUrl) {
    iframe.src = 'about:blank';
    setEmptyVisible(card, true);
    status.classList.remove('is-visible');
    updateCardState(card, 'waiting', 'Waiting for URL');
    return Promise.resolve('waiting');
  }

  setEmptyVisible(card, false);
  updateCardState(card, 'loading', 'Loading');
  status.classList.remove('is-visible');

  const separator = targetUrl.includes('?') ? '&' : '?';
  const nextSrc = force ? `${targetUrl}${separator}_screensize_reload=${Date.now()}` : targetUrl;

  return new Promise(resolve => {
    let settled = false;
    const finish = (result, state, label) => {
      if (settled) return;
      settled = true;
      clearCardTimer(card);
      updateCardState(card, state, label);
      if (state === 'loaded') status.classList.remove('is-visible');
      else if (state === 'error') status.classList.add('is-visible');
      resolve(result);
    };

    iframe.onload = () => finish('loaded', 'loaded', 'Loaded');
    iframe.onerror = () => finish('blocked', 'error', 'Blocked / unavailable');
    iframe.src = nextSrc;
    cardTimers.set(card, window.setTimeout(() => finish('timeout', 'error', 'Blocked / unavailable'), 7000));
  });
}

async function loadPreviews(targetUrl) {
  const token = ++loadToken;
  currentUrl = targetUrl;
  setLoading(true);
  saveHistory(targetUrl);
  setMessage(`Previewing ${targetUrl}`, 'success');

  const cards = [...previewGrid.querySelectorAll('.preview-card')];
  await Promise.all(cards.map(card => loadCard(card, targetUrl)));
  if (token === loadToken) setLoading(false);
}

function showEmptyState() {
  currentUrl = '';
  setLoading(false);
  previewGrid.querySelectorAll('.preview-card').forEach(card => {
    loadCard(card, '', false);
  });
  setMessage('Paste a URL above to load the previews. Your last used sites are saved locally.', '');
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
    setMessage('Share link copied to the clipboard.', 'success');
  } catch {
    setMessage(shareUrl.href, 'success');
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const target = normalizeUrl(urlInput.value);
  if (!target) {
    setMessage('Enter a valid website address, for example https://example.com', 'error');
    urlInput.focus();
    return;
  }
  urlInput.value = target;
  const next = new URL(window.location.href);
  next.searchParams.set('url', target);
  history.replaceState({}, '', next);
  loadPreviews(target);
});

reloadAll.addEventListener('click', async () => {
  if (!currentUrl) {
    setMessage('Enter a URL first.', 'error');
    urlInput.focus();
    return;
  }
  const token = ++loadToken;
  setLoading(true);
  await Promise.all([...previewGrid.querySelectorAll('.preview-card')].map(card => loadCard(card, currentUrl, true)));
  if (token === loadToken) setLoading(false);
});

shareProject.addEventListener('click', shareCurrent);
clearHistory.addEventListener('click', () => {
  try { localStorage.removeItem(HISTORY_KEY); } catch {}
  renderHistory();
  setMessage('Recent websites cleared from this device.', 'success');
});
customSize.addEventListener('click', openCustomSimulator);
deviceForm.addEventListener('submit', event => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  const width = Number(customWidth.value);
  const height = Number(customHeight.value);
  const name = (customName.value.trim() || 'Custom').slice(0, 24);
  if (!currentUrl || !Number.isFinite(width) || !Number.isFinite(height) || width < 240 || height < 240 || width > 4000 || height > 3000) {
    setMessage('Custom viewport must be between 240–4000 px wide and 240–3000 px high.', 'error');
    return;
  }
  const query = new URLSearchParams({ url: currentUrl, custom: '1', name, w: String(Math.round(width)), h: String(Math.round(height)) });
  deviceDialog.close();
  window.open(`/simulate.html?${query.toString()}`, '_blank', 'noopener,noreferrer');
});

tabs.forEach(tab => tab.addEventListener('click', () => {
  const group = tab.dataset.group;
  tabs.forEach(item => {
    const active = item === tab;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  previewGrid.querySelectorAll('.preview-card').forEach(card => {
    card.classList.toggle('is-hidden', group !== 'all' && card.dataset.group !== group);
  });
  window.requestAnimationFrame(updateAllFrameSizes);
}));

urlInput.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') return;
  if (event.key === 'Escape') urlInput.blur();
});

window.addEventListener('resize', updateAllFrameSizes, { passive: true });

buildCards();
renderHistory();

const initialUrl = new URL(window.location.href).searchParams.get('url');
const normalizedInitial = normalizeUrl(initialUrl || '');
if (normalizedInitial) {
  urlInput.value = normalizedInitial;
  loadPreviews(normalizedInitial);
} else {
  showEmptyState();
}
