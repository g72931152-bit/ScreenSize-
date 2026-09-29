const PRESETS = {
  mobile: { name: 'Mobile', detail: '390 × 844', width: 390, height: 844 },
  'mobile-wide': { name: 'Large Mobile', detail: '430 × 932', width: 430, height: 932 },
  tablet: { name: 'Tablet', detail: '820 × 1180', width: 820, height: 1180 },
  desktop: { name: 'Desktop', detail: '1440 × 900', width: 1440, height: 900 },
  'desktop-wide': { name: 'Wide Desktop', detail: '1920 × 1080', width: 1920, height: 1080 }
};

const $ = id => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const custom = params.get('custom') === '1';
const customName = (params.get('name') || 'Custom').slice(0, 24);
const customWidth = Number(params.get('w'));
const customHeight = Number(params.get('h'));
const deviceTitle = $('deviceTitle'), deviceCaption = $('deviceCaption'), simulatorUrl = $('simulatorUrl');
const workspace = $('simulatorWorkspace'), deviceSurface = $('deviceSurface'), deviceEmpty = $('deviceEmpty');
const simFrame = $('simFrame'), simBlocked = $('simBlocked'), blockedMessage = simBlocked.querySelector('p');
const zoomValue = $('zoomValue'), snackbar = $('snackbar');
const tabs = [...document.querySelectorAll('[data-device]')];

const isValidCustom = custom && Number.isFinite(customWidth) && Number.isFinite(customHeight) && customWidth >= 240 && customHeight >= 240 && customWidth <= 4000 && customHeight <= 3000;
const customPreset = isValidCustom ? { name: customName, width: Math.round(customWidth), height: Math.round(customHeight) } : null;

let activeDevice = PRESETS[params.get('device')] ? params.get('device') : (customPreset ? 'custom' : 'desktop');
let fitScale = 1;
let zoomScale = null;
let rotated = false;
let loadTimer = 0;
let toastTimer = 0;
let requestToken = 0;

function normalizeUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}
const validUrl = normalizeUrl(params.get('url') || '');
const displayUrl = () => validUrl ? validUrl.replace(/^https?:\/\//i, '') : 'No valid website URL';

function toast(text) {
  snackbar.textContent = text;
  snackbar.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => snackbar.classList.remove('is-visible'), 2800);
}

function backHref() {
  return validUrl ? `/?${new URLSearchParams({ url: validUrl })}` : '/';
}

function getPreset() { return activeDevice === 'custom' ? customPreset : PRESETS[activeDevice]; }

function getDimensions() {
  const base = getPreset();
  if (!base) return null;
  return rotated ? { width: base.height, height: base.width } : { width: base.width, height: base.height };
}

function openExternal() {
  if (!validUrl) return;
  const popup = window.open(validUrl, '_blank', 'noopener,noreferrer');
  if (!popup) window.location.href = validUrl;
}

function openInDeviceWindow() {
  const dims = getDimensions();
  if (!validUrl || !dims) return;
  const chromeAllowance = activeDevice.includes('desktop') ? 96 : 120;
  const popup = window.open(validUrl, 'screensize_device', `width=${dims.width},height=${Math.max(240, dims.height + chromeAllowance)},resizable=yes,scrollbars=yes,noopener,noreferrer`);
  if (!popup) openExternal();
}

function scaleSurface() {
  const dims = getDimensions();
  if (!dims) return;
  const maxWidth = Math.max(200, workspace.clientWidth - 32);
  const maxHeight = Math.max(200, workspace.clientHeight - 32 - 28);
  fitScale = Math.min(maxWidth / dims.width, maxHeight / dims.height, 1);
  const scale = zoomScale == null ? fitScale : zoomScale;
  deviceSurface.style.width = `${dims.width * scale}px`;
  deviceSurface.style.height = `${dims.height * scale}px`;
  simFrame.style.width = `${dims.width}px`;
  simFrame.style.height = `${dims.height}px`;
  simFrame.style.transform = `scale(${scale})`;
  deviceCaption.textContent = `${dims.width} × ${dims.height}`;
  zoomValue.textContent = zoomScale == null ? `Fit · ${Math.round(fitScale * 100)}%` : `${Math.round(scale * 100)}%`;
}

function setDevice(deviceId) {
  if (deviceId !== 'custom' && !PRESETS[deviceId]) return;
  activeDevice = deviceId;
  rotated = false;
  zoomScale = null;
  deviceTitle.textContent = getPreset().name;
  tabs.forEach(tab => tab.setAttribute('aria-pressed', String(deviceId !== 'custom' && tab.dataset.device === deviceId)));
  scaleSurface();
}

function setBusy(busy) {
  document.body.classList.toggle('is-loading', busy);
  deviceEmpty.classList.toggle('is-busy', busy);
}

function showBlocked(message) {
  window.clearTimeout(loadTimer);
  setBusy(false);
  blockedMessage.textContent = message;
  simBlocked.classList.add('is-visible');
  deviceEmpty.classList.add('is-hidden');
}

async function inspect() {
  const response = await fetch(`/api/inspect?url=${encodeURIComponent(validUrl)}`, { headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Unable to verify this website.');
  return data;
}

async function loadFrame() {
  if (!validUrl) return;
  const token = ++requestToken;
  window.clearTimeout(loadTimer);
  simBlocked.classList.remove('is-visible');
  deviceEmpty.classList.remove('is-hidden');
  setBusy(true);
  simulatorUrl.textContent = displayUrl();

  let check;
  try { check = await inspect(); } catch { check = { ok: true, uncertain: true }; }
  if (token !== requestToken) return;
  if (check.ok === false) {
    showBlocked(`The page reports a ${check.blockedBy.join(' + ')} policy that prevents iframe embedding.`);
    return;
  }

  simFrame.onload = () => {
    if (token !== requestToken) return;
    window.clearTimeout(loadTimer);
    setBusy(false);
    deviceEmpty.classList.add('is-hidden');
    simBlocked.classList.remove('is-visible');
  };
  const target = check.finalUrl || validUrl;
  try { simFrame.contentWindow.location.replace(target); } catch { simFrame.src = target; }
  loadTimer = window.setTimeout(() => showBlocked('The website did not finish loading inside the simulator. You can still open it directly.'), 15000);
}

function setZoom(next) {
  zoomScale = Math.max(0.25, Math.min(1, next));
  scaleSurface();
}

function fitZoom() { zoomScale = null; scaleSurface(); }

function rotate() {
  rotated = !rotated;
  zoomScale = null;
  scaleSurface(); // the page inside reacts to the new viewport on its own — no reload needed
}

tabs.forEach(tab => tab.addEventListener('click', () => {
  const next = new URL(window.location.href);
  next.searchParams.set('device', tab.dataset.device);
  ['custom', 'name', 'w', 'h'].forEach(key => next.searchParams.delete(key));
  window.history.replaceState({}, '', next);
  setDevice(tab.dataset.device);
}));
$('zoomOut').addEventListener('click', () => setZoom((zoomScale ?? fitScale) - 0.1));
$('zoomIn').addEventListener('click', () => setZoom((zoomScale ?? fitScale) + 0.1));
$('zoomFit').addEventListener('click', fitZoom);
$('rotateDevice').addEventListener('click', rotate);
$('reloadDevice').addEventListener('click', loadFrame);
$('openOriginal').addEventListener('click', openExternal);
$('blockedOriginal').addEventListener('click', openExternal);
$('openDeviceWindow').addEventListener('click', openInDeviceWindow);
$('blockedBack').addEventListener('click', () => { window.location.href = backHref(); });
$('shareSimulator').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    toast('Link copied');
  } catch {
    simulatorUrl.textContent = window.location.href;
  }
});
window.addEventListener('resize', scaleSurface, { passive: true });
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return; // keep browser shortcuts (Ctrl+R, Ctrl+-, …) intact
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  if (key === 'r') rotate();
  else if (key === '+' || key === '=') setZoom((zoomScale ?? fitScale) + 0.05);
  else if (key === '-') setZoom((zoomScale ?? fitScale) - 0.05);
  else if (key === '0') fitZoom();
});

$('backLink').href = backHref();
$('brandLink').href = backHref();
setDevice(activeDevice);
if (!validUrl) {
  simulatorUrl.textContent = displayUrl();
  showBlocked('Choose a valid website URL on the main ScreenSize page.');
} else {
  loadFrame();
}
