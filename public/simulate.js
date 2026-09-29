const PRESETS = {
  mobile: { name: 'Mobile', detail: '390 × 844', width: 390, height: 844 },
  'mobile-wide': { name: 'Large Mobile', detail: '430 × 932', width: 430, height: 932 },
  tablet: { name: 'Tablet', detail: '820 × 1180', width: 820, height: 1180 },
  desktop: { name: 'Desktop', detail: '1440 × 900', width: 1440, height: 900 }
};

const params = new URLSearchParams(window.location.search);
const url = params.get('url') || '';
const requestedDevice = params.get('device') || 'desktop';
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
const tabs = [...document.querySelectorAll('[data-device]')];

let activeDevice = PRESETS[requestedDevice] ? requestedDevice : 'desktop';

function normalizeUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function openExternal() {
  if (!url) return;
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) window.location.href = url;
}

function openInDeviceWindow() {
  if (!url || !PRESETS[activeDevice]) return;
  const preset = PRESETS[activeDevice];
  const chromeAllowance = activeDevice === 'desktop' ? 96 : 120;
  const features = [
    `width=${preset.width}`,
    `height=${Math.max(240, preset.height + chromeAllowance)}`,
    'resizable=yes',
    'scrollbars=yes',
    'noopener',
    'noreferrer'
  ].join(',');
  const popup = window.open(url, 'screensize_device', features);
  if (!popup) openExternal();
}

function scaleSurface() {
  const preset = PRESETS[activeDevice];
  if (!preset) return;

  const maxWidth = Math.max(300, Math.min(window.innerWidth - 48, 1500));
  const maxHeight = Math.max(240, window.innerHeight - 180);
  const scale = Math.min(maxWidth / preset.width, maxHeight / preset.height, 1);

  deviceSurface.style.width = `${preset.width * scale}px`;
  deviceSurface.style.height = `${preset.height * scale}px`;
  simFrame.style.width = `${preset.width}px`;
  simFrame.style.height = `${preset.height}px`;
  simFrame.style.transform = `scale(${scale})`;
  simFrame.style.transformOrigin = 'top left';
  deviceEmpty.style.transform = `scale(${Math.min(scale, 1)})`;
  deviceEmpty.style.transformOrigin = 'center';
}

function setDevice(deviceId, reload = true) {
  if (!PRESETS[deviceId]) return;
  activeDevice = deviceId;
  const preset = PRESETS[deviceId];
  document.body.dataset.device = deviceId;
  deviceTitle.textContent = preset.name;
  deviceCaption.textContent = preset.detail;
  tabs.forEach(tab => {
    const active = tab.dataset.device === deviceId;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  scaleSurface();
  if (reload && url) {
    simBlocked.classList.remove('is-visible');
    deviceEmpty.classList.remove('is-hidden');
    simFrame.src = url;
    window.setTimeout(() => deviceEmpty.classList.add('is-hidden'), 900);
  }
}

simFrame.addEventListener('load', () => {
  deviceEmpty.classList.add('is-hidden');
  simBlocked.classList.remove('is-visible');
});

simFrame.addEventListener('error', () => {
  deviceEmpty.classList.add('is-hidden');
  simBlocked.classList.add('is-visible');
});

window.setTimeout(() => {
  if (simFrame.src && simFrame.src !== 'about:blank' && !simBlocked.classList.contains('is-visible')) {
    simBlocked.classList.add('is-visible');
    deviceEmpty.classList.add('is-hidden');
  }
}, 7000);

tabs.forEach(tab => tab.addEventListener('click', () => {
  const next = new URL(window.location.href);
  next.searchParams.set('device', tab.dataset.device);
  window.history.replaceState({}, '', next);
  setDevice(tab.dataset.device);
}));

openOriginal.addEventListener('click', openExternal);
blockedOriginal.addEventListener('click', openExternal);
openDeviceWindow.addEventListener('click', openInDeviceWindow);
blockedBack.addEventListener('click', () => {
  if (window.history.length > 1) window.history.back();
  else window.location.href = '/';
});
window.addEventListener('resize', scaleSurface, { passive: true });

const validUrl = normalizeUrl(url);
if (!validUrl) {
  simulatorUrl.textContent = 'No valid website URL';
  deviceEmpty.classList.add('is-hidden');
  simBlocked.classList.add('is-visible');
} else {
  simulatorUrl.textContent = validUrl.replace(/^https?:\/\//i, '');
  simFrame.src = validUrl;
  setDevice(activeDevice, false);
}
