const PRESETS = {
  mobile: { name: 'Mobile', detail: '390 × 844', width: 390, height: 844 },
  'mobile-wide': { name: 'Large Mobile', detail: '430 × 932', width: 430, height: 932 },
  tablet: { name: 'Tablet', detail: '820 × 1180', width: 820, height: 1180 },
  desktop: { name: 'Desktop', detail: '1440 × 900', width: 1440, height: 900 },
  'desktop-wide': { name: 'Wide Desktop', detail: '1920 × 1080', width: 1920, height: 1080 }
};

const params = new URLSearchParams(window.location.search);
const url = params.get('url') || '';
const custom = params.get('custom') === '1';
const customName = (params.get('name') || 'Custom').slice(0, 24);
const customWidth = Number(params.get('w'));
const customHeight = Number(params.get('h'));

const deviceTitle = document.getElementById('deviceTitle');
const deviceCaption = document.getElementById('deviceCaption');
const simulatorUrl = document.getElementById('simulatorUrl');
const deviceSurface = document.getElementById('deviceSurface');
const deviceEmpty = document.getElementById('deviceEmpty');
const simFrame = document.getElementById('simFrame');
const simBlocked = document.getElementById('simBlocked');
const openOriginal = document.getElementById('openOriginal');
const blockedOriginal = document.getElementById('blockedOriginal');
const blockedBack = document.getElementById('blockedBack');
const openDeviceWindow = document.getElementById('openDeviceWindow');
const shareSimulator = document.getElementById('shareSimulator');
const zoomOut = document.getElementById('zoomOut');
const zoomIn = document.getElementById('zoomIn');
const zoomFit = document.getElementById('zoomFit');
const zoomValue = document.getElementById('zoomValue');
const rotateDevice = document.getElementById('rotateDevice');
const reloadDevice = document.getElementById('reloadDevice');
const tabs = [...document.querySelectorAll('[data-device]')];

const isValidCustom = custom && Number.isFinite(customWidth) && Number.isFinite(customHeight) && customWidth >= 240 && customHeight >= 240 && customWidth <= 4000 && customHeight <= 3000;
const customPreset = isValidCustom ? { name: customName, detail: `${Math.round(customWidth)} × ${Math.round(customHeight)}`, width: Math.round(customWidth), height: Math.round(customHeight) } : null;

let activeDevice = PRESETS[params.get('device')] ? params.get('device') : (customPreset ? 'custom' : 'desktop');
let currentWidth = 0;
let currentHeight = 0;
let fitScale = 1;
let zoomScale = null;
let rotated = false;
let loadTimer = null;

function normalizeUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname ? parsed.href : null;
  } catch {
    return null;
  }
}

function getPreset() {
  return activeDevice === 'custom' ? customPreset : PRESETS[activeDevice];
}

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
  if (!validUrl) return;
  const dims = getDimensions();
  if (!dims) return;
  const chromeAllowance = activeDevice.includes('desktop') ? 96 : 120;
  const features = [
    `width=${dims.width}`,
    `height=${Math.max(240, dims.height + chromeAllowance)}`,
    'resizable=yes',
    'scrollbars=yes',
    'noopener',
    'noreferrer'
  ].join(',');
  const popup = window.open(validUrl, 'screensize_device', features);
  if (!popup) openExternal();
}

function scaleSurface() {
  const dims = getDimensions();
  if (!dims) return;

  const maxWidth = Math.max(280, window.innerWidth - 48);
  const maxHeight = Math.max(240, window.innerHeight - 260);
  fitScale = Math.min(maxWidth / dims.width, maxHeight / dims.height, 1);
  const scale = zoomScale == null ? fitScale : Math.max(0.25, Math.min(1, zoomScale));

  currentWidth = dims.width;
  currentHeight = dims.height;
  deviceSurface.style.width = `${dims.width * scale}px`;
  deviceSurface.style.height = `${dims.height * scale}px`;
  simFrame.style.width = `${dims.width}px`;
  simFrame.style.height = `${dims.height}px`;
  simFrame.style.transform = `scale(${scale})`;
  simFrame.style.transformOrigin = 'top left';
  deviceEmpty.style.transform = `scale(${Math.min(scale, 1)})`;
  deviceEmpty.style.transformOrigin = 'center';
  zoomValue.textContent = zoomScale == null ? `Fit · ${Math.round(fitScale * 100)}%` : `${Math.round(scale * 100)}%`;
}

function setDevice(deviceId, reload = true) {
  if (deviceId !== 'custom' && !PRESETS[deviceId]) return;
  activeDevice = deviceId;
  rotated = false;
  zoomScale = null;
  const preset = getPreset();
  if (!preset) return;

  document.body.dataset.device = deviceId;
  deviceTitle.textContent = preset.name;
  deviceCaption.textContent = preset.detail;
  tabs.forEach(tab => {
    const active = deviceId !== 'custom' && tab.dataset.device === deviceId;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  scaleSurface();
  if (reload && validUrl) loadFrame();
}

function loadFrame() {
  if (!validUrl) return;
  window.clearTimeout(loadTimer);
  simBlocked.classList.remove('is-visible');
  deviceEmpty.classList.remove('is-hidden');
  const source = new URL(validUrl);
  source.searchParams.set('_screensize_reload', Date.now());
  simFrame.src = source.href;
  loadTimer = window.setTimeout(() => {
    if (!simBlocked.classList.contains('is-visible')) {
      simBlocked.classList.add('is-visible');
      deviceEmpty.classList.add('is-hidden');
    }
  }, 7000);
}

function setZoom(next) {
  const target = Math.max(0.25, Math.min(1, next));
  zoomScale = target;
  scaleSurface();
}

function rotate() {
  rotated = !rotated;
  scaleSurface();
  if (validUrl) loadFrame();
}

async function shareSimulatorLink() {
  const shareUrl = new URL(window.location.href);
  try {
    await navigator.clipboard.writeText(shareUrl.href);
    simulatorUrl.textContent = 'Share link copied';
    window.setTimeout(() => { simulatorUrl.textContent = validUrl ? validUrl.replace(/^https?:\/\//i, '') : 'No valid website URL'; }, 1800);
  } catch {
    simulatorUrl.textContent = shareUrl.href;
  }
}

simFrame.addEventListener('load', () => {
  window.clearTimeout(loadTimer);
  deviceEmpty.classList.add('is-hidden');
  simBlocked.classList.remove('is-visible');
});

simFrame.addEventListener('error', () => {
  window.clearTimeout(loadTimer);
  deviceEmpty.classList.add('is-hidden');
  simBlocked.classList.add('is-visible');
});

tabs.forEach(tab => tab.addEventListener('click', () => {
  const next = new URL(window.location.href);
  next.searchParams.set('device', tab.dataset.device);
  next.searchParams.delete('custom');
  next.searchParams.delete('name');
  next.searchParams.delete('w');
  next.searchParams.delete('h');
  window.history.replaceState({}, '', next);
  setDevice(tab.dataset.device);
}));

zoomOut.addEventListener('click', () => setZoom((zoomScale ?? fitScale) - 0.1));
zoomIn.addEventListener('click', () => setZoom((zoomScale ?? fitScale) + 0.1));
zoomFit.addEventListener('click', () => { zoomScale = null; scaleSurface(); });
rotateDevice.addEventListener('click', rotate);
reloadDevice.addEventListener('click', loadFrame);
shareSimulator.addEventListener('click', shareSimulatorLink);
openOriginal.addEventListener('click', openExternal);
blockedOriginal.addEventListener('click', openExternal);
openDeviceWindow.addEventListener('click', openInDeviceWindow);
blockedBack.addEventListener('click', () => {
  window.location.href = '/';
});
window.addEventListener('resize', scaleSurface, { passive: true });

document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey) rotate();
  if (event.key === '+' || event.key === '=') setZoom((zoomScale ?? fitScale) + 0.05);
  if (event.key === '-') setZoom((zoomScale ?? fitScale) - 0.05);
  if (event.key === '0') { zoomScale = null; scaleSurface(); }
});

const validUrl = normalizeUrl(url);
if (!validUrl) {
  simulatorUrl.textContent = 'No valid website URL';
  deviceEmpty.classList.add('is-hidden');
  simBlocked.classList.add('is-visible');
} else {
  simulatorUrl.textContent = validUrl.replace(/^https?:\/\//i, '');
  setDevice(activeDevice, false);
  loadFrame();
}
