const PRESETS = [
  { id: 'mobile', group: 'mobile', name: 'Mobile', detail: '390 × 844', width: 390, height: 844 },
  { id: 'mobile-wide', group: 'mobile', name: 'Large Mobile', detail: '430 × 932', width: 430, height: 932 },
  { id: 'tablet', group: 'tablet', name: 'Tablet', detail: '820 × 1180', width: 820, height: 1180 },
  { id: 'desktop', group: 'desktop', name: 'Desktop', detail: '1440 × 900', width: 1440, height: 900 }
];

const form = document.getElementById('previewForm');
const urlInput = document.getElementById('urlInput');
const previewButton = document.getElementById('previewButton');
const urlMessage = document.getElementById('urlMessage');
const previewGrid = document.getElementById('previewGrid');
const loadState = document.getElementById('loadState');
const reloadAll = document.getElementById('reloadAll');
const tabs = [...document.querySelectorAll('.device-tab')];

let currentUrl = '';
let loadToken = 0;

function escapeHtml(value) {
  return String(value).replace(/[&<>\'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function normalizeUrl(value) {
  const raw = value.trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = parsed.hash || '';
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

function logoMarkup(extraClass = '') {
  return `
    <div class="preview-logo ${extraClass}" aria-hidden="true">
      <div class="preview-logo-mark"><span></span><span></span><span></span></div>
      <div class="preview-logo-name">ScreenSize</div>
      <div class="preview-logo-pulse"></div>
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
          <button class="small-action open-action" type="button" title="Open in new tab" aria-label="Open ${escapeHtml(preset.name)} in new tab">↗</button>
          <button class="small-action reload-action" type="button" title="Reload preview" aria-label="Reload ${escapeHtml(preset.name)} preview">↻</button>
        </div>
      </div>
      <div class="frame-stage" data-width="${preset.width}" data-height="${preset.height}">
        <div class="empty-preview">${logoMarkup()}</div>
        <div class="frame-wrap" style="width:${preset.width}px;height:${preset.height}px">
          <iframe title="${escapeHtml(preset.name)} preview" loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>
        <div class="frame-status"><div><strong>Preview unavailable</strong><span>This site may block embedding. Use the simulator or open the original site.</span><div class="status-actions"><button class="status-simulate" type="button">Open simulator</button><button class="status-external" type="button">Open original</button></div></div></div>
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
  card.querySelector('.state-label').textContent = text;
}

function setEmptyVisible(card, visible) {
  card.querySelector('.empty-preview').classList.toggle('is-hidden', !visible);
  card.querySelector('.frame-wrap').classList.toggle('is-ready', !visible);
}

function loadCard(card, targetUrl, force = false) {
  const iframe = card.querySelector('iframe');
  const status = card.querySelector('.frame-status');
  if (!targetUrl) {
    setEmptyVisible(card, true);
    updateCardState(card, 'waiting', 'Waiting for URL');
    return;
  }

  setEmptyVisible(card, false);
  updateCardState(card, 'loading', 'Loading');
  status.classList.remove('is-visible');

  const separator = targetUrl.includes('?') ? '&' : '?';
  const nextSrc = force && iframe.src ? `${targetUrl}${separator}_screensize_reload=${Date.now()}` : targetUrl;
  iframe.src = nextSrc;
  iframe.onload = () => {
    updateCardState(card, 'loaded', 'Loaded');
    status.classList.remove('is-visible');
  };
  iframe.onerror = () => showBlockedState(card);

  window.setTimeout(() => {
    if (!iframe.src || iframe.src === 'about:blank') return;
    const label = card.querySelector('.state-label').textContent;
    if (label === 'Loading') showBlockedState(card);
  }, 7000);
}

function showBlockedState(card) {
  updateCardState(card, 'error', 'Blocked / unavailable');
  card.querySelector('.frame-status').classList.add('is-visible');
}

function loadPreviews(targetUrl) {
  const token = ++loadToken;
  currentUrl = targetUrl;
  setLoading(true);
  let finished = 0;

  previewGrid.querySelectorAll('.preview-card').forEach(card => {
    loadCard(card, targetUrl);
    const iframe = card.querySelector('iframe');
    const done = () => {
      finished += 1;
      if (token !== loadToken) return;
      if (finished >= PRESETS.length) setLoading(false);
    };
    iframe.addEventListener('load', done, { once: true });
  });

  setMessage(`Previewing ${targetUrl}`, 'success');
  window.setTimeout(() => { if (token === loadToken) setLoading(false); }, 8000);
}

function showEmptyState() {
  currentUrl = '';
  setLoading(false);
  previewGrid.querySelectorAll('.preview-card').forEach(card => {
    const iframe = card.querySelector('iframe');
    iframe.src = 'about:blank';
    card.querySelector('.frame-status').classList.remove('is-visible');
    setEmptyVisible(card, true);
    updateCardState(card, 'waiting', 'Waiting for URL');
  });
  setMessage('Paste a URL above to load the previews.', '');
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
  loadPreviews(target);
});

reloadAll.addEventListener('click', () => {
  if (!currentUrl) {
    setMessage('Enter a URL first.', 'error');
    urlInput.focus();
    return;
  }
  const token = ++loadToken;
  setLoading(true);
  let left = PRESETS.length;
  previewGrid.querySelectorAll('.preview-card').forEach(card => {
    const iframe = card.querySelector('iframe');
    iframe.addEventListener('load', () => {
      left -= 1;
      if (token === loadToken && left <= 0) setLoading(false);
    }, { once: true });
    loadCard(card, currentUrl, true);
  });
  window.setTimeout(() => { if (token === loadToken) setLoading(false); }, 8000);
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

window.addEventListener('resize', updateAllFrameSizes, { passive: true });

buildCards();
showEmptyState();
