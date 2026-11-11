
const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));



window.addEventListener('error', (e) => {
  console.error('BADSHAH AI runtime error:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('BADSHAH AI unhandled promise rejection:', e.reason);
});

function initSplashAndLibWarning() {
  if (window.__libLoadFailures && window.__libLoadFailures.length) {
    setTimeout(() => {
      toast(`Some features may be limited (failed to load: ${window.__libLoadFailures.join(', ')})`, 'error');
    }, 800);
  }
  const splash = document.getElementById('introSplash');

  const dismissSplash = () => {
    if (!splash || splash.__dismissed) return;
    splash.__dismissed = true;
    try { if (typeof sfx !== 'undefined' && sfx.click) sfx.click(); } catch (e) {  }
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
      if (splash.parentNode) splash.remove();
    }, 600);
  };

  const enterBtn = document.getElementById('enterAppBtn');
  if (enterBtn && splash) {
    enterBtn.addEventListener('click', dismissSplash);
  }


  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#enterAppBtn')) dismissSplash();
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSplashAndLibWarning);
} else {
  initSplashAndLibWarning();
}


const PROMPT_LIBRARY = Array.isArray(window.PROMPT_LIBRARY) ? window.PROMPT_LIBRARY : [];

const THINKING_PHRASES = ['Thinking', 'Thinking', 'Thinking', 'Thinking', 'Thinking'];

const MODELS = {
  chat: {
    'groq-gpt-oss-120b':  { label: 'GPT-OSS 120B', icon: 'fa-brain', pro: false },
    'gpt-3-5': { label: 'GPT 3.5', icon: 'fa-comment', pro: false },
    'pollinations-text': { label: 'Pollinations', icon: 'fa-feather', pro: false },
    'fusion-synth':  { label: 'Synth',  icon: 'fa-wand-magic-sparkles', pro: true },
    'fusion-vortex': { label: 'Vortex', icon: 'fa-meteor', pro: true },
    'fusion-abyss':  { label: 'Abyss',  icon: 'fa-moon', pro: true },
    'fusion-shadow': { label: 'Shadow', icon: 'fa-ghost', pro: true },
    'fusion-reaper': { label: 'Reaper', icon: 'fa-skull', pro: true },
    'fusion-dread':  { label: 'Dread',  icon: 'fa-biohazard', pro: true },
    'fusion-void':   { label: 'Void',   icon: 'fa-circle-notch', pro: true },
  },
  image: {
    'pollinations-image': { label: 'Pollinations', icon: 'fa-image', pro: false },
    'stable-diffusion': { label: 'Stable Diffusion', icon: 'fa-wand-magic-sparkles', pro: false },
    'fusion-astra': { label: 'Astra', icon: 'fa-star', pro: true },
  },
};


const MODEL_COSTS = {
  'groq-gpt-oss-120b':  { inputPerWord: 2, outputPerWord: 4 },
  'gpt-3-5': { inputPerWord: 2, outputPerWord: 4 },
  'pollinations-text': { inputPerWord: 2, outputPerWord: 4 },
  'fusion-synth':  { inputPerWord: 3, outputPerWord: 6 },
  'fusion-vortex': { inputPerWord: 3, outputPerWord: 6 },
  'fusion-abyss':  { inputPerWord: 3, outputPerWord: 6 },
  'fusion-shadow': { inputPerWord: 3, outputPerWord: 6 },
  'fusion-reaper': { inputPerWord: 3, outputPerWord: 6 },
  'fusion-dread':  { inputPerWord: 3, outputPerWord: 6 },
  'fusion-void':   { inputPerWord: 3, outputPerWord: 6 },
  'pollinations-image': { flatCost: 22000 },
  'stable-diffusion': { flatCost: 22000 },
  'fusion-astra':  { flatCost: 40000 },
};

const FB = {
  ok: false,
  cfg: { maintenance: { on: false }, models: {}, apkUrl: undefined, subscriptionPlans: {}, subscriptionContact: '' }
};
const Auth = {
  uid: null, user: 'Badshah222', email: '', tokenLimit: null, subscription: null,
  get isAdmin() { return false; },
  clear() {}
};

/* ---- BADSHAH AI v2: Supabase backend ---- */
// Real values go in supabase-config.js after the Supabase project is created.
// No API key or password is ever written in this file.
const supabaseClient = (window.supabase && window.SUPABASE_URL && !window.SUPABASE_URL.includes('YOUR-PROJECT-REF'))
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;
const currentUserProfile = { is_pro: false, is_admin: false, plan_id: null, pro_expires_at: null, display_name: '', email: '' };
let currentUser = null;
let disabledModels = new Set();
let maintenanceMode = false;

function requireSupabase() {
  if (!supabaseClient) { toast('Supabase is not configured yet.', 'error'); return false; }
  return true;
}

// Public payment accounts shown on the Buy Pro screen (display data, not secrets).
// Defaults match the seeded admin_settings; loadAdminSettings() overwrites
// them from the admin panel's payment_accounts row when it exists.
let PAYMENT_ACCOUNTS = {
  easypaisa: { label: 'Easypaisa', number: '03095413705' },
  jazzcash: { label: 'JazzCash', number: '03251787969' },
  nayapay: { label: 'NayaPay', number: '03251787969' },
  bank: { label: 'Bank of Khyber (BOK)', iban: 'PK57KHYB5085003008639737' },
};
// Fallback plans used only if the plans table cannot be read.
const FALLBACK_PLANS = [
  { id: 'plan-1m', name: '1 Month', price_pkr: 100, duration_label: '1 Month' },
  { id: 'plan-3m', name: '3 Months', price_pkr: 230, duration_label: '3 Months' },
  { id: 'plan-5m', name: '5 Months', price_pkr: 400, duration_label: '5 Months' },
  { id: 'plan-8m', name: '8 Months', price_pkr: 699, duration_label: '8 Months' },
  { id: 'plan-1y', name: '1 Year', price_pkr: 999, duration_label: '1 Year' },
  { id: 'custom', name: 'Custom', price_pkr: 0, duration_label: 'Custom' },
];

function isModelLocked(modelId) {
  const info = MODELS.chat[modelId] || MODELS.image[modelId];
  return !!(info && info.pro && !currentUserProfile.is_pro);
}

function modelState(id) {
  const c = (FB.cfg.models || {})[id] || {};
  return { enabled: c.enabled !== false, maintenance: !!c.maintenance, apiId: id };
}
function modelAvailable(id) { if (disabledModels.has(id)) return false; const s = modelState(id); return s.enabled && !s.maintenance; }
function applyConfig() {
  const m = FB.cfg.maintenance || {};
  const ov = $('#maintenanceOverlay');
  if (ov) {
    ov.style.display = ((m.on || maintenanceMode) && !currentUserProfile.is_admin) ? 'flex' : 'none';
    const t = $('#maintenanceText'); if (t && m.message) t.textContent = m.message;
  }
  const apk = $('#appDownloadBtn');
  if (apk) {
    const row = apk.closest('.settings-row');
    if (typeof FB.cfg.apkUrl === 'string') {
      if (FB.cfg.apkUrl.trim()) { apk.href = FB.cfg.apkUrl.trim(); if (row) row.style.display = ''; }
      else if (row) row.style.display = 'none';
    }
  }
  if (typeof renderModelSelector === 'function' && typeof state !== 'undefined' && state.settings) renderModelSelector();
  updateTokenBadgeFromAuth();
}
function fbLogUsage() {}
function updateTokenBadgeFromAuth() {
  const name = $('#accountUsernameDisplay');
  if (name) name.textContent = currentUserProfile.display_name || currentUserProfile.email || (Auth.uid ? (Auth.user || 'User') : 'User');
  const logout = $('#logoutBtn');
  if (logout) logout.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
  if (typeof renderUsageAndStats === 'function' && typeof state !== 'undefined' && state.usage) renderUsageAndStats();
}

const LIMITS = {
  get maxTokens() { return Infinity; }
};
const CONTEXT_TOKEN_LIMIT = 3000;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const MAX_ATTACHMENT_CHARS = 60000;
const GLOBAL_STATS_KEY = 'badshahai_luxury_v3_global_lifetime_stats';
const LEGACY_DB_NAME = 'badshahai_v2_local_db';
const LEGACY_LS_PREFIX = 'badshahai_v2_';

const DB_NAME = 'badshahai_luxury_v3_db';
const DB_VERSION = 1;
let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('chats')) db.createObjectStore('chats', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(store, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { return lsFallbackPut(store, value); }
}

async function idbGetAll(store) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return lsFallbackGetAll(store); }
}

async function idbGet(store, key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return lsFallbackGet(store, key); }
}

async function idbDelete(store, key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { return lsFallbackDelete(store, key); }
}

function lsKey(store) { return `badshahai_luxury_v3_ls_${store}`; }
function lsFallbackPut(store, value) {
  try {
    const all = JSON.parse(localStorage.getItem(lsKey(store)) || '{}');
    const k = value.id || value.key;
    all[k] = value;
    localStorage.setItem(lsKey(store), JSON.stringify(all));
    return true;
  } catch (e) { return false; }
}
function lsFallbackGetAll(store) {
  try {
    const all = JSON.parse(localStorage.getItem(lsKey(store)) || '{}');
    return Object.values(all);
  } catch (e) { return []; }
}
function lsFallbackGet(store, key) {
  try {
    const all = JSON.parse(localStorage.getItem(lsKey(store)) || '{}');
    return all[key] || null;
  } catch (e) { return null; }
}
function lsFallbackDelete(store, key) {
  try {
    const all = JSON.parse(localStorage.getItem(lsKey(store)) || '{}');
    delete all[key];
    localStorage.setItem(lsKey(store), JSON.stringify(all));
    return true;
  } catch (e) { return false; }
}

async function clearLegacyClientStorage() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(LEGACY_LS_PREFIX) || key === 'badshahai_v2_global_lifetime_stats')) localStorage.removeItem(key);
    }
  } catch (e) {}
  try {
    if (indexedDB && indexedDB.databases) {
      const dbs = await indexedDB.databases();
      if (dbs.some(d => d.name === LEGACY_DB_NAME)) indexedDB.deleteDatabase(LEGACY_DB_NAME);
    }
  } catch (e) {}
}

const state = {
  chats: [],
  activeChatId: null,
  mode: 'chat',
  settings: { theme: 'noir', fontSize: 1, ttsVoice: 'auto', models: { chat: 'groq-gpt-oss-120b', image: 'pollinations-image' }, memories: [], memoryEnabled: true },
  usage: { tokensUsedLifetime: 0, alertsShown: {} },
  editingMessageId: null,
  abortController: null,
  generating: false,
  contextFrozen: false,
  pendingAttachment: null
};

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function getGlobalStats() {
  const defaults = { totalImages: 0, totalChats: 0, totalTokens: 0 };
  try {
    const raw = localStorage.getItem(GLOBAL_STATS_KEY);
    return raw ? JSON.parse(raw) : defaults;
  } catch(e) { return defaults; }
}

function saveGlobalStats(stats) {
  try { localStorage.setItem(GLOBAL_STATS_KEY, JSON.stringify(stats)); } catch(e) {}
}

function incrementGlobalStat(key, val = 1) {
  const stats = getGlobalStats();
  stats[key] = (stats[key] || 0) + val;
  saveGlobalStats(stats);
}



const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function toast(message, type = 'default') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-triangle-exclamation' : type === 'success' ? 'fa-circle-check' : 'fa-circle-info'}"></i><span>${message}</span>`;
  const container = $('#toastContainer');
  if (container) {
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, 3200);
  }
}

let _actx = null;
function playTone(freq, duration = 0.12, type = 'sine', volume = 0.05) {
  try {
    _actx = _actx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = _actx.createOscillator();
    const gain = _actx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, _actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, _actx.currentTime + duration);
    osc.connect(gain); gain.connect(_actx.destination);
    osc.start(); osc.stop(_actx.currentTime + duration);
  } catch (e) {}
}
const sfx = {
  send: () => playTone(720, 0.08, 'sine', 0.045),
  receive: () => playTone(480, 0.14, 'sine', 0.05),
  error: () => playTone(180, 0.22, 'sawtooth', 0.05),
  click: () => playTone(900, 0.05, 'triangle', 0.03)
};

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderMarkdown(text) {
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    return `<pre class="plain-fallback">${escapeHtml(text || '')}</pre>`;
  }
  try {
    const raw = marked.parse(text || '');
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
  } catch (e) {
    return `<pre class="plain-fallback">${escapeHtml(text || '')}</pre>`;
  }
}

async function loadSettings() {
  const saved = await idbGet('meta', 'settings');
  if (saved && saved.value) {
    let migratedModels = { chat: 'groq-gpt-oss-120b', image: 'pollinations-image' };
    if (typeof saved.value.model === 'string') {
      migratedModels.chat = saved.value.model;
    } else if (saved.value.models) {
      migratedModels = { ...migratedModels, ...saved.value.models };
    }
    delete migratedModels.video;



    if (!MODELS.chat[migratedModels.chat]) migratedModels.chat = 'groq-gpt-oss-120b';
    if (!MODELS.image[migratedModels.image]) migratedModels.image = 'pollinations-image';
    state.settings = { theme: 'noir', fontSize: 1, ttsVoice: 'auto', memories: [], memoryEnabled: true, ...saved.value, models: migratedModels };
    state.settings.theme = 'noir';
    delete state.settings.model;
    if (!state.settings.ttsVoice) state.settings.ttsVoice = 'auto';
  } else {
    state.settings = { theme: 'noir', fontSize: 1, ttsVoice: 'auto', models: { chat: 'groq-gpt-oss-120b', image: 'pollinations-image' }, memories: [], memoryEnabled: true };
  }
  applyTheme();
  applyFontSize();
  syncSettingsUI();
  renderMemories();
}

async function saveSettings() {
  await idbPut('meta', { key: 'settings', value: state.settings });
}

function applyTheme() {
  const effective = 'noir';
  document.body.setAttribute('data-theme', effective);
  const themeLink = $('#hljs-theme');
  if (themeLink) {
    themeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
  }
}

function applyFontSize() {
  const scales = [0.9, 1, 1.12];
  document.documentElement.style.setProperty('--scale', scales[state.settings.fontSize] ?? 1);
}

function renderModelSelector() {
  const mode = state.mode || 'chat';
  const modelsForMode = MODELS[mode] || {};
  const visible = Object.keys(modelsForMode).filter(k => modelState(k).enabled && !disabledModels.has(k));
  let activeModelKey = state.settings.models[mode] || visible[0];
  if (!modelAvailable(activeModelKey) || isModelLocked(activeModelKey)) {
    const alt = visible.find(k => modelAvailable(k) && !isModelLocked(k));
    if (alt) { activeModelKey = alt; state.settings.models[mode] = alt; }
  }
  const popup = $('#modelPopupMain');
  if (!popup) return;

  popup.innerHTML = visible.map((key) => {
    const info = modelsForMode[key];
    const m = modelState(key);
    const locked = isModelLocked(key);
    return `<button class="mode-opt ${key === activeModelKey ? 'active' : ''} ${m.maintenance ? 'is-maint' : ''} ${locked ? 'is-pro-locked' : ''}" data-model="${key}" data-locked="${locked ? '1' : ''}" ${m.maintenance ? 'disabled' : ''}>
      <i class="fa-solid ${info.icon}"></i> ${escapeHtml(info.label)}${info.pro ? ' <span class="pro-badge">PRO</span>' : ''}
    </button>`;
  }).join('');

  const activeInfo = modelsForMode[activeModelKey];
  const triggerIcon = $('#modelTriggerIconMain');
  if (activeInfo && triggerIcon) {
    triggerIcon.className = `fa-solid ${activeInfo.icon}`;
  }
}

function syncSettingsUI() {
  $all('#themeGrid button').forEach(b => b.classList.toggle('active', b.dataset.theme === state.settings.theme));
  const fontRange = $('#fontSizeRange');
  if (fontRange) fontRange.value = state.settings.fontSize;
  const ttsSel = $('#ttsVoiceSelect');
  if (ttsSel) ttsSel.value = state.settings.ttsVoice || 'auto';
  const memoryToggle = $('#memoryEnabledToggle');
  if (memoryToggle) memoryToggle.checked = state.settings.memoryEnabled !== false;
  const memoryBlock = $('#memoryManagerBlock');
  if (memoryBlock) memoryBlock.style.display = state.settings.memoryEnabled !== false ? 'flex' : 'none';
  renderModelSelector();
}

$('#memoryEnabledToggle')?.addEventListener('change', (e) => {
  state.settings.memoryEnabled = e.target.checked;
  const memoryBlock = $('#memoryManagerBlock');
  if (memoryBlock) memoryBlock.style.display = e.target.checked ? 'flex' : 'none';
  saveSettings();
  sfx.click();
});

$('#fontSizeRange')?.addEventListener('input', (e) => {
  state.settings.fontSize = parseInt(e.target.value, 10);
  applyFontSize(); saveSettings();
});

$('#ttsVoiceSelect')?.addEventListener('change', (e) => {
  state.settings.ttsVoice = e.target.value;
  saveSettings();
});

// ---- Tools (Weather / Temp Mail / FB Downloader) ----
// All three run through the ai-chat function (mode "tool"), free for every
// registered user. Temp-mail address + token live in localStorage only.
async function callTool(body) {
  const { data, error } = await supabaseClient.functions.invoke('ai-chat', { body });
  if (error || !data || !data.ok) throw new Error((data && data.error) || 'Tool failed');
  return data;
}
function showTempMailAddr() {
  const box = $('#tempMailAddr');
  if (!box) return;
  let tm = null;
  try { tm = JSON.parse(localStorage.getItem('bw_tempmail_v1') || 'null'); } catch (_) {}
  if (tm && tm.address) {
    box.innerHTML = `Address: <strong>${escapeHtml(tm.address)}</strong> <button class="drawer-btn" id="tempMailCopyBtn">Copy</button>`;
    $('#tempMailCopyBtn')?.addEventListener('click', () => {
      if (navigator.clipboard) navigator.clipboard.writeText(tm.address);
      toast('Address copied', 'success');
    });
  } else box.textContent = '';
}
$('#openToolsBtn')?.addEventListener('click', () => { showTempMailAddr(); openModal('#toolsModal'); });
$('#weatherBtn')?.addEventListener('click', async () => {
  const city = ($('#weatherCityInput')?.value || 'Swabi').trim();
  const box = $('#weatherResult');
  if (box) box.textContent = 'Checking...';
  try {
    const d = await callTool({ mode: 'tool', tool: 'weather', city });
    if (box) box.innerHTML = `<strong>${escapeHtml(String(d.city || city))}, ${escapeHtml(String(d.country || ''))}</strong> — ${escapeHtml(String(d.description || ''))}, ${d.temp}&deg;C (feels ${d.feels_like}&deg;C), humidity ${d.humidity}%, wind ${d.wind} m/s`;
  } catch (e) { if (box) box.textContent = 'Weather unavailable. Try again.'; }
});
$('#tempMailNewBtn')?.addEventListener('click', async () => {
  const box = $('#tempMailAddr');
  if (box) box.textContent = 'Creating...';
  try {
    const d = await callTool({ mode: 'tool', tool: 'tempmail', action: 'new' });
    localStorage.setItem('bw_tempmail_v1', JSON.stringify({ address: d.address, token: d.token }));
    showTempMailAddr();
    toast('Temp address created', 'success');
  } catch (e) { if (box) box.textContent = 'Could not create an address. Try again.'; }
});
$('#tempMailCheckBtn')?.addEventListener('click', async () => {
  let tm = null;
  try { tm = JSON.parse(localStorage.getItem('bw_tempmail_v1') || 'null'); } catch (_) {}
  const list = $('#tempMailList');
  if (!tm || !tm.token) { if (list) list.textContent = 'Create an address first.'; return; }
  if (list) list.textContent = 'Checking inbox...';
  try {
    const d = await callTool({ mode: 'tool', tool: 'tempmail', action: 'check', token: tm.token });
    if (!d.messages || !d.messages.length) { if (list) list.textContent = 'Inbox is empty.'; return; }
    if (list) {
      list.innerHTML = d.messages.map(m => `<div class="tool-msg" data-id="${escapeHtml(String(m.id))}"><strong>${escapeHtml(String(m.subject || '(no subject)'))}</strong><br><span>${escapeHtml(String(m.from || ''))} — ${escapeHtml(String(m.intro || ''))}</span></div>`).join('');
      list.querySelectorAll('.tool-msg').forEach(el => el.addEventListener('click', async () => {
        try {
          const r = await callTool({ mode: 'tool', tool: 'tempmail', action: 'read', token: tm.token, id: el.dataset.id });
          el.innerHTML = `<strong>${escapeHtml(String(r.subject || ''))}</strong><br><span>${escapeHtml(String(r.from || ''))}</span><p>${escapeHtml(String(r.text || 'No text body.'))}</p>`;
        } catch (e) { toast('Could not open this message.', 'error'); }
      }));
    }
  } catch (e) { if (list) list.textContent = 'Inbox check failed. Try again.'; }
});
$('#fbdlBtn')?.addEventListener('click', async () => {
  const url = ($('#fbdlUrlInput')?.value || '').trim();
  const box = $('#fbdlResult');
  if (!url) { if (box) box.textContent = 'Paste a Facebook video link first.'; return; }
  if (box) box.textContent = 'Fetching links...';
  try {
    const d = await callTool({ mode: 'tool', tool: 'fbdl', url });
    const links = (d.downloads || []).map(x => `<a href="${escapeHtml(String(x.url))}" target="_blank" rel="noopener">${escapeHtml(String(x.quality || 'Video'))}</a>`).join(' &bull; ');
    if (box) box.innerHTML = `<strong>${escapeHtml(String(d.title || 'Facebook Video'))}</strong> (${escapeHtml(String(d.duration || ''))})<br>${links || 'No download links found.'}`;
  } catch (e) { if (box) box.textContent = 'Could not fetch this video. Try another link.'; }
});

function renderMemories() {
  const mList = $('#memoryList');
  if (!mList) return;
  const list = state.settings.memories || [];
  if (list.length === 0) {
    mList.innerHTML = `<div class="memory-item" style="color: var(--ink-faint); text-align: center; justify-content: center;">No stored memories yet.</div>`;
    return;
  }
  mList.innerHTML = list.map((item, idx) => `
    <div class="memory-item">
      <span>${escapeHtml(item)}</span>
      <i class="fa-solid fa-trash" data-idx="${idx}"></i>
    </div>
  `).join('');
}

$('#addMemoryBtn')?.addEventListener('click', () => {
  const input = $('#memoryInput');
  if (!input) return;
  const txt = input.value.trim();
  if (!txt) return;
  if (!state.settings.memories) state.settings.memories = [];
  state.settings.memories.push(txt);
  input.value = '';
  saveSettings();
  renderMemories();
  toast('Fact remembered!', 'success');
});

$('#memoryList')?.addEventListener('click', (e) => {
  const icon = e.target.closest('.fa-trash');
  if (!icon) return;
  const idx = parseInt(icon.dataset.idx, 10);
  state.settings.memories.splice(idx, 1);
  saveSettings();
  renderMemories();
  toast('Fact forgotten.', 'default');
});

async function loadUsage() {
  const saved = await idbGet('meta', 'usage');
  const old = saved && saved.value ? saved.value : {};
  state.usage = { tokensUsedLifetime: Number(old.tokensUsedLifetime ?? old.tokensUsedToday ?? 0), alertsShown: {}, ...old };
  delete state.usage.tokensUsedToday;
  delete state.usage.resetAt;
  await saveUsage();
  renderUsageAndStats();
}

async function saveUsage() { 
  await idbPut('meta', { key: 'usage', value: state.usage }); 
}

function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/* renderSubscriptionSection removed in v2: plans now live in Supabase
   and the Buy Pro modal (openBuyPro) replaces the old WhatsApp section. */

function renderUsageAndStats() {
  const used = state.usage.tokensUsedLifetime || 0;
  const planLabel = currentUserProfile.is_pro
    ? ('Pro until ' + (currentUserProfile.pro_expires_at ? new Date(currentUserProfile.pro_expires_at).toLocaleDateString() : '—'))
    : 'Free';
  const topText = `${used} / Unlimited · ${planLabel}`;
  const planDisplay = $('#planDisplay');
  if (planDisplay) planDisplay.textContent = planLabel;
  const tokenDisplay = $('#liveTokenDisplay');
  if (tokenDisplay) tokenDisplay.textContent = topText;
  
  const popUsed = $('#popTokensUsed');
  const popCost = $('#popTokensCost');
  if (popUsed) popUsed.textContent = used.toString();
  if (popCost) popCost.textContent = '$' + (used * 0.00005).toFixed(5);

  const pct = Math.min(100, (used / LIMITS.maxTokens) * 100);
  const bar = $('#usageProgressBar');
  const pctLabel = $('#usageProgressPct');
  if (bar) { bar.style.width = pct.toFixed(1) + '%'; bar.classList.toggle('danger', pct >= 90); bar.classList.toggle('warn', pct >= 75 && pct < 90); }
  if (pctLabel) pctLabel.textContent = 'Unlimited';
  
  const glob = getGlobalStats();
  const statsImages = $('#statsTotalImages');
  const statsChats = $('#statsTotalChats');
  const statsTokens = $('#statsTotalTokens');
  const statsCost = $('#statsTotalCost');
  
  if (statsImages) statsImages.textContent = glob.totalImages.toString();
  if (statsChats) statsChats.textContent = glob.totalChats.toString();
  if (statsTokens) statsTokens.textContent = glob.totalTokens.toString();
  if (statsCost) statsCost.textContent = '$' + (glob.totalTokens * 0.00005).toFixed(5);
}

const USAGE_ALERT_THRESHOLDS = [50, 75, 90];

function checkAndConsumeTokens(type, wordCount = 0, model = null) {
  const now = Date.now();
  if (!state.usage.alertsShown) state.usage.alertsShown = {};

  const costs = MODEL_COSTS[model] || {};
  let needed = 0;
  if (type === 'input') needed = Math.ceil(wordCount * (costs.inputPerWord ?? 2));
  else if (type === 'output') needed = Math.ceil(wordCount * (costs.outputPerWord ?? 4));
  else if (type === 'image') needed = costs.flatCost ?? 22000;

  const currentUsed = state.usage.tokensUsedLifetime || 0;
  if (currentUsed + needed > LIMITS.maxTokens) {
    if (!state.usage.alertsShown.limit) {
      toast('Lifetime token limit reached.', 'error');
      state.usage.alertsShown.limit = true;
      saveUsage();
    } else {
      toast('Not enough lifetime tokens.', 'error');
    }
    return false;
  }

  state.usage.tokensUsedLifetime = currentUsed + needed;
  incrementGlobalStat('totalTokens', needed);
  if (type === 'image') incrementGlobalStat('totalImages', 1);

  checkUsageAlerts();
  saveUsage();
  renderUsageAndStats();
  return true;
}

function checkUsageAlerts() {
  const pct = (state.usage.tokensUsedLifetime / LIMITS.maxTokens) * 100;
  for (const threshold of USAGE_ALERT_THRESHOLDS) {
    if (pct >= threshold && !state.usage.alertsShown[threshold]) {
      state.usage.alertsShown[threshold] = true;
      toast(`${threshold}% of your lifetime tokens used`, threshold >= 90 ? 'error' : 'default');
    }
  }
}

$('#tokenBadgeBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  $('#tokenPopup')?.classList.toggle('active');
});
$('#closeTokenPopup')?.addEventListener('click', () => {
  $('#tokenPopup')?.classList.remove('active');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#tokenPopup') && !e.target.closest('#tokenBadgeBtn')) {
    $('#tokenPopup')?.classList.remove('active');
  }
});

async function loadChats() {
  let all = [];
  try { all = await idbGetAll('chats'); }
  catch (e) { toast('Could not load chat history — starting fresh', 'error'); }
  state.chats = all.sort((a, b) => b.updatedAt - a.updatedAt);
  if (state.chats.length === 0) {
    await createNewChat(false);
  } else {
    const savedActive = await idbGet('meta', 'activeChatId');
    const restoredId = savedActive && savedActive.value;
    state.activeChatId = (restoredId && state.chats.some(c => c.id === restoredId)) ? restoredId : state.chats[0].id;
  }
  renderChatList();
  renderActiveChat();
}

function getActiveChat() { return state.chats.find(c => c.id === state.activeChatId); }

async function setActiveChatId(id) {
  state.activeChatId = id;
  await idbPut('meta', { key: 'activeChatId', value: id });
}

async function createNewChat(render = true) {
  const chat = { id: uid(), title: 'New chat', mode: 'chat', messages: [], pinned: false, favorite: false, createdAt: Date.now(), updatedAt: Date.now() };
  state.chats.unshift(chat);
  incrementGlobalStat('totalChats', 1);
  await setActiveChatId(chat.id);
  await idbPut('chats', chat);
  if (render) { renderChatList(); renderActiveChat(); closeSidebarOnMobile(); }
  setContextFrozen(false);
  return chat;
}

async function persistChat(chat) {
  chat.updatedAt = Date.now();
  await idbPut('chats', chat);
  if (chat.id === state.activeChatId) refreshContextGuard();
}

function autoTitleChat(chat, firstUserText) {
  if (chat.title === 'New chat' && firstUserText) {
    chat.title = firstUserText.slice(0, 42) + (firstUserText.length > 42 ? '…' : '');
  }
}

function renderChatList() {
  const pinnedWrap = $('#pinnedChatList');
  const listWrap = $('#chatList');
  if (!pinnedWrap || !listWrap) return;

  const searchInput = $('#searchChatsInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const filtered = state.chats.filter(c => {
    if (!query) return true;
    return c.title.toLowerCase().includes(query) || c.messages.some(m => (m.content || '').toLowerCase().includes(query));
  });
  const pinned = filtered.filter(c => c.pinned);
  const rest = filtered.filter(c => !c.pinned);
  pinnedWrap.innerHTML = pinned.map(chatItemHtml).join('');
  listWrap.innerHTML = rest.map(chatItemHtml).join('');
  $all('.chat-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.chat-more')) return;
      switchChat(el.dataset.id);
    });
    el.querySelector('.chat-more')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openContextMenu(e, el.dataset.id);
    });
  });
}

function chatItemHtml(c) {
  const active = c.id === state.activeChatId ? 'active' : '';
  const icon = c.mode === 'image' ? 'fa-image' : 'fa-message';
  return `<div class="chat-item ${active}" data-id="${c.id}">
    <span class="chat-icon"><i class="fa-solid ${icon}"></i></span>
    <span class="chat-info">
      <strong>${c.pinned ? '<i class="fa-solid fa-thumbtack pin-flag"></i> ' : ''}${c.favorite ? '<i class="fa-solid fa-star fav-flag"></i> ' : ''}${escapeHtml(c.title)}</strong>
      <small>${new Date(c.updatedAt).toLocaleDateString()}</small>
    </span>
    <button class="chat-more"><i class="fa-solid fa-ellipsis-vertical"></i></button>
  </div>`;
}

function switchChat(id) {
  setActiveChatId(id);
  const chat = getActiveChat();
  if (chat) setMode(chat.mode || 'chat', false);
  renderChatList();
  renderActiveChat();
  closeSidebarOnMobile();
}

function closeSidebarOnMobile() {
  if (window.innerWidth <= 900) {
    $('#sidebar')?.classList.remove('active');
    $('#sidebarOverlay')?.classList.remove('active');
  }
}

$('#searchChatsInput')?.addEventListener('input', renderChatList);
$('#newChatBtn')?.addEventListener('click', () => createNewChat());

let contextChatId = null;
function openContextMenu(e, chatId) {
  contextChatId = chatId;
  const menu = $('#chatContextMenu');
  if (!menu) return;
  menu.classList.add('active');
  const rect = e.target.getBoundingClientRect();
  menu.style.top = `${Math.min(rect.top, window.innerHeight - 220)}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#chatContextMenu') && !e.target.closest('.chat-more')) {
    $('#chatContextMenu')?.classList.remove('active');
  }
});
$('#chatContextMenu')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button'); if (!btn || !contextChatId) return;
  const chat = state.chats.find(c => c.id === contextChatId);
  if (!chat) return;
  const action = btn.dataset.action;
  if (action === 'pin') { chat.pinned = !chat.pinned; await persistChat(chat); }
  if (action === 'favorite') { chat.favorite = !chat.favorite; await persistChat(chat); }
  if (action === 'rename') {
    const name = prompt('Rename chat', chat.title);
    if (name && name.trim()) { chat.title = name.trim(); await persistChat(chat); }
  }
  if (action === 'export') exportChat(chat);
  if (action === 'delete') {
    if (confirm('Delete permanently?')) {
      state.chats = state.chats.filter(c => c.id !== chat.id);
      await idbDelete('chats', chat.id);
      if (state.activeChatId === chat.id) {
        if (state.chats.length) await setActiveChatId(state.chats[0].id);
        else await createNewChat(false);
      }
    }
  }
  $('#chatContextMenu')?.classList.remove('active');
  renderChatList(); renderActiveChat();
});

function exportChat(chat) {
  const lines = [`# ${chat.title}`, ''];
  chat.messages.forEach(m => {
    lines.push(`**${m.role === 'user' ? 'You' : 'BADSHAH AI'}** (${new Date(m.time).toLocaleString()})`);
    lines.push(m.content || (m.mediaUrl ? `[${m.type} generated]` : ''));
    if (m.voiceUrl) lines.push(`[Audio Voice Note attached]`);
    lines.push('');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${chat.title.replace(/[^a-z0-9]/gi, '_')}.md`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  toast('Chat exported', 'success');
}

function renderActiveChat() {
  const chat = getActiveChat();
  refreshContextGuard();
  const box = $('#chatBox');
  if (!box) return;
  box.innerHTML = '';
  if (!chat || chat.messages.length === 0) {
    box.innerHTML = `<div class="chat-hero"><div class="hero-logo"><img src="icon.png?v=20261006.6" alt=""></div><h2>Assalam-o-Alaikum! I am <span class="grad-text">BADSHAH AI</span></h2><p>Free &amp; unlimited. Ask anything, or pick an idea below to get started.</p><div class="hero-grid"><button class="hero-chip" data-mode="chat" data-prompt="Write a short, exciting story about a young king who learns to use AI for good."><span class="chip-ic"><i class="fa-solid fa-pen-nib"></i></span><span class="chip-tx"><strong>Write a story</strong><small>Write a short, exciting story about a yo…</small></span></button><button class="hero-chip" data-mode="chat" data-prompt="Explain how to build a simple login page with HTML, CSS and JavaScript, step by step."><span class="chip-ic"><i class="fa-solid fa-code"></i></span><span class="chip-tx"><strong>Help with code</strong><small>Explain how to build a simple login page…</small></span></button><button class="hero-chip" data-mode="chat" data-prompt="Translate this to Urdu: Hard work and patience always bring success."><span class="chip-ic"><i class="fa-solid fa-language"></i></span><span class="chip-tx"><strong>Translate to Urdu</strong><small>Translate this to Urdu: Hard work and pa…</small></span></button><button class="hero-chip" data-mode="chat" data-prompt="Give me 5 low-cost online business ideas I can start from my phone."><span class="chip-ic"><i class="fa-solid fa-lightbulb"></i></span><span class="chip-tx"><strong>Business ideas</strong><small>Give me 5 low-cost online business ideas…</small></span></button><button class="hero-chip" data-mode="image" data-prompt="A royal lion wearing a golden crown, cinematic lighting, ultra detailed"><span class="chip-ic"><i class="fa-solid fa-image"></i></span><span class="chip-tx"><strong>Create an image</strong><small>A royal lion wearing a golden crown, cin…</small></span></button><button class="hero-chip" data-mode="chat" data-prompt="Explain photosynthesis in very simple words with an easy example."><span class="chip-ic"><i class="fa-solid fa-graduation-cap"></i></span><span class="chip-tx"><strong>Study help</strong><small>Explain photosynthesis in very simple wo…</small></span></button></div><div class="hero-steps"><span><b>1</b> Type your question</span><span><b>2</b> Press Enter or the arrow</span><span><b>3</b> Tap the left icon to switch Chat / Image</span></div></div>`;
    return;
  }
  chat.messages.forEach(m => box.appendChild(buildMessageEl(m)));
  box.scrollTop = box.scrollHeight;
}

function buildMessageEl(m) {
  const div = document.createElement('div');
  div.className = `message ${m.role}`;
  div.dataset.id = m.id;

  let mediaHtml = '';
  if (m.type === 'image' && m.mediaUrl) mediaHtml = `<img class="gen-media" src="${escapeHtml(m.mediaUrl)}" data-src="${escapeHtml(m.mediaUrl)}" alt="Generated image" loading="lazy" referrerpolicy="no-referrer" onerror="ftImgFallback(this)">`;
  if (m.type === 'video') mediaHtml = `<div class="media-gone"><i class="fa-solid fa-triangle-exclamation"></i> Video is no longer supported.</div>`;
  if (m.pdfName) mediaHtml += `<div class="file-chip"><i class="fa-solid fa-file-pdf"></i> ${escapeHtml(m.pdfName)}</div>`;

  let voiceHtml = '';
  if (m.voiceUrl) voiceHtml = `<audio class="chat-voice-msg" src="${m.voiceUrl}" controls></audio>`;

  const textHtml = m.role === 'assistant' ? renderMarkdown(m.content || '') : escapeHtml(m.content || '');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = (m.role === 'user' ? textHtml.replace(/\n/g, '<br>') : textHtml) + voiceHtml + mediaHtml;
  div.appendChild(bubble);

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = nowTimeFrom(m.time);
  div.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  
  if (m.role === 'user') {
    actions.innerHTML = `<button class="mini-btn act-edit"><i class="fa-solid fa-pen"></i> Edit</button>`;
  } else if (m.type === 'image' || m.type === 'video') {
    actions.innerHTML = `
      <button class="mini-btn act-edit-media"><i class="fa-solid fa-pen"></i> Edit</button>
      <button class="mini-btn act-share"><i class="fa-solid fa-share-nodes"></i> Share</button>
      <button class="mini-btn act-download-media" ${m.type === 'video' ? 'disabled' : ''}><i class="fa-solid fa-download"></i> Download</button>
      <button class="mini-btn act-regen"><i class="fa-solid fa-rotate"></i> Regenerate</button>`;
  } else {
    actions.innerHTML = `
      <button class="mini-btn act-bookmark ${m.bookmarked ? 'active-bookmark' : ''}"><i class="fa-${m.bookmarked ? 'solid' : 'regular'} fa-bookmark"></i> ${m.bookmarked ? 'Bookmarked' : 'Bookmark'}</button>
      <button class="mini-btn act-copy"><i class="fa-solid fa-copy"></i> Copy</button>
      <button class="mini-btn act-edit-assistant"><i class="fa-solid fa-pen"></i> Edit</button>
      <button class="mini-btn act-continue"><i class="fa-solid fa-forward"></i> Continue</button>
      <button class="mini-btn act-share"><i class="fa-solid fa-share-nodes"></i> Share</button>
      <button class="mini-btn act-regen"><i class="fa-solid fa-rotate"></i> Regenerate</button>
      <button class="speak-btn" title="Read aloud">🔊</button>`;
  }
  div.appendChild(actions);

  bindMessageActions(div, m);
  enhanceCodeBlocks(bubble);
  bubble.querySelectorAll('img.gen-media').forEach(img => img.addEventListener('click', () => openLightbox(img.src)));
  return div;
}

function nowTimeFrom(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

function bindMessageActions(div, m) {
  const chat = getActiveChat();
  div.querySelector('.act-edit')?.addEventListener('click', () => startEditMessage(m));
  div.querySelector('.act-edit-assistant')?.addEventListener('click', () => editAssistantMsg(chat, m));
  div.querySelector('.act-edit-media')?.addEventListener('click', () => editMediaPrompt(chat, m));
  div.querySelector('.act-download-media')?.addEventListener('click', () => downloadMedia(m));
  div.querySelector('.act-copy')?.addEventListener('click', () => { navigator.clipboard.writeText(m.content || ''); toast('Copied', 'success'); });
  div.querySelector('.act-regen')?.addEventListener('click', () => regenerateMessage(chat, m));
  div.querySelector('.act-continue')?.addEventListener('click', () => continueMessage(chat, m));
  div.querySelector('.act-share')?.addEventListener('click', () => shareMessage(m));
  div.querySelector('.act-bookmark')?.addEventListener('click', () => toggleBookmark(chat, m));
  div.querySelector('.speak-btn')?.addEventListener('click', (ev) => speakText(ev.currentTarget, m.content || ''));
}

// ---- Read aloud (server TTS voice, device voice as fallback) ----
// The speaker button calls the ai-chat function (mode "tts"), which turns the
// text into MP3 parts via the TTS worker (StreamElements voices, Google Urdu
// for Urdu script) and plays them in order. If the server voice fails, the
// device's own text-to-speech is used instead.
let speakingBtn = null;
let ttsAudio = null;
let ttsUrls = [];
function resetSpeakBtn() {
  if (speakingBtn) { speakingBtn.classList.remove('speaking'); speakingBtn.textContent = '🔊'; speakingBtn = null; }
  if (ttsAudio) { try { ttsAudio.pause(); } catch (_) {} ttsAudio = null; }
  ttsUrls.forEach(u => URL.revokeObjectURL(u)); ttsUrls = [];
}
function speakText(btn, text) {
  try {
    if (speakingBtn === btn) { resetSpeakBtn(); return; }
    resetSpeakBtn();
    const plain = String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#*_`>\[\]()]/g, '')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!plain) return;
    speakingBtn = btn;
    btn.classList.add('speaking');
    btn.textContent = '⏹';
    const voice = (state.settings && state.settings.ttsVoice) || 'auto';
    const fallbackToDevice = () => {
      if (!('speechSynthesis' in window)) { toast('Read aloud is not available.', 'error'); resetSpeakBtn(); return; }
      const utter = new SpeechSynthesisUtterance(plain);
      utter.rate = 1;
      utter.onend = () => resetSpeakBtn();
      utter.onerror = () => resetSpeakBtn();
      window.speechSynthesis.speak(utter);
    };
    supabaseClient.functions.invoke('ai-chat', { body: { mode: 'tts', text: plain, voice } })
      .then(({ data, error }) => {
        if (error || !data || !data.ok || !Array.isArray(data.parts) || !data.parts.length) throw new Error('tts failed');
        const urls = data.parts.map(p => {
          const bin = atob(p);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const u = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
          ttsUrls.push(u); return u;
        });
        let i = 0;
        const playNext = () => {
          if (speakingBtn !== btn || i >= urls.length) { resetSpeakBtn(); return; }
          ttsAudio = new Audio(urls[i++]);
          ttsAudio.onended = playNext;
          ttsAudio.onerror = playNext;
          ttsAudio.play().catch(() => resetSpeakBtn());
        };
        playNext();
      })
      .catch(() => fallbackToDevice());
  } catch (e) { resetSpeakBtn(); }
}

function editAssistantMsg(chat, m) {
  const newTxt = prompt("Edit Assistant Response:", m.content);
  if (newTxt !== null) {
    m.content = newTxt;
    persistChat(chat);
    renderActiveChat();
    toast("Message updated!", "success");
  }
}

function toggleBookmark(chat, m) {
  m.bookmarked = !m.bookmarked;
  persistChat(chat);
  renderActiveChat();
  toast(m.bookmarked ? 'Message bookmarked' : 'Bookmark removed', 'default');
}

function getAllBookmarks() {
  const results = [];
  state.chats.forEach(c => {
    (c.messages || []).forEach(m => { if (m.bookmarked) results.push({ chat: c, message: m }); });
  });
  return results;
}

function renderBookmarks() {
  const wrap = $('#bookmarksList');
  if (!wrap) return;
  const items = getAllBookmarks();
  if (items.length === 0) {
    wrap.innerHTML = `<div class="memory-item" style="color: var(--ink-faint); text-align: center; justify-content: center;">No bookmarks yet.</div>`;
    return;
  }
  wrap.innerHTML = items.map(({ chat, message }) => `
    <div class="bookmark-item" data-chat-id="${chat.id}" data-msg-id="${message.id}">
      <div class="bookmark-item-text">${escapeHtml((message.content || '').slice(0, 90))}${(message.content || '').length > 90 ? '…' : ''}</div>
      <div class="bookmark-item-meta">${escapeHtml(chat.title)} · ${nowTimeFrom(message.time)}</div>
    </div>
  `).join('');
  $all('.bookmark-item').forEach(el => {
    el.addEventListener('click', () => {
      closeModal('#bookmarksModal');
      switchChat(el.dataset.chatId);
      setTimeout(() => {
        const target = document.querySelector(`[data-id="${el.dataset.msgId}"]`);
        if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.classList.add('flash-highlight'); setTimeout(() => target.classList.remove('flash-highlight'), 1500); }
      }, 150);
    });
  });
}
$('#openBookmarksBtn')?.addEventListener('click', () => { renderBookmarks(); openModal('#bookmarksModal'); });

function editMediaPrompt(chat, m) {
  const idx = chat.messages.findIndex(x => x.id === m.id);
  const priorUser = [...chat.messages.slice(0, idx)].reverse().find(x => x.role === 'user');
  if (priorUser) {
    userInput.value = priorUser.content;
    userInput.focus();
    syncSendBtnMode();
    toast("Prompt loaded into composer. Modify it and send again!", "default");
  } else {
    toast("Original prompt not found.", "error");
  }
}

function downloadMedia(m) {
  if (!m.mediaUrl) return;
  const a = document.createElement('a');
  a.href = m.mediaUrl;
  a.download = `ft-ai-media-${Date.now()}`;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("Downloading media...", "success");
}

function enhanceCodeBlocks(bubble) {

  Array.from(bubble.querySelectorAll('pre')).forEach((pre) => {
    if (pre.parentElement.classList.contains('code-wrapper')) return;
    const codeEl = pre.querySelector('code');
    const codeText = codeEl ? codeEl.innerText : pre.innerText;
    const language = (codeEl?.className || '').replace('language-', '') || 'code';
    const wrapper = document.createElement('div');
    wrapper.className = 'code-wrapper';
    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `<span class="code-lang">${language.toUpperCase()}</span>
      <div class="code-actions">
        <button class="code-btn cb-copy"><i class="fa-solid fa-copy"></i> Copy</button>
        <button class="code-btn cb-download"><i class="fa-solid fa-download"></i> Download</button>
      </div>`;
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header); wrapper.appendChild(pre);
    header.querySelector('.cb-copy').addEventListener('click', () => { navigator.clipboard.writeText(codeText); toast('Code copied', 'success'); });
    header.querySelector('.cb-download').addEventListener('click', () => downloadText(codeText, extFor(language)));
  });
  if (typeof hljs !== 'undefined') {
    bubble.querySelectorAll('pre code').forEach(b => {
      try { hljs.highlightElement(b); } catch (e) {}
    });
  }
}

function extFor(lang) {
  const map = { html: 'html', css: 'css', javascript: 'js', js: 'js', json: 'json', python: 'py', py: 'py' };
  return map[lang.toLowerCase()] || 'txt';
}

function downloadText(text, ext) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `ft-ai-code-${Date.now()}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function openLightbox(src) {
  const img = $('#lightboxImg');
  const dwn = $('#lightboxDownload');
  if (img) img.src = src;
  if (dwn) dwn.href = src;
  $('#lightbox')?.classList.add('active');
}
$('#lightboxClose')?.addEventListener('click', () => $('#lightbox')?.classList.remove('active'));
$('#lightbox')?.addEventListener('click', (e) => { if (e.target.id === 'lightbox') $('#lightbox')?.classList.remove('active'); });

const MODE_ICONS = { chat: 'fa-message', image: 'fa-image' };
const MODE_LABELS = { chat: 'Chat', image: 'Image' };

function setMode(mode, updateChat = true) {
  if (mode === 'video' || !MODE_ICONS[mode]) mode = 'chat';
  state.mode = mode;
  $all('.mode-opt').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  const trigIcon = $('#modeTriggerIcon');
  if (trigIcon) trigIcon.className = `fa-solid ${MODE_ICONS[mode]}`;
  const placeholders = { chat: 'Ask Me Anything...', image: 'Image Gen...' };
  const inputEl = $('#userInput');
  if (inputEl) inputEl.placeholder = placeholders[mode];
  renderModelSelector();
  if (updateChat) {
    const chat = getActiveChat();
    if (chat && chat.messages.length === 0) { chat.mode = mode; persistChat(chat); renderChatList(); }
  }
}

function positionModePopup() {
  const popup = $('#modePopup');
  const trigger = $('#modeTriggerBtn');
  if (!popup || !trigger) return;
  popup.style.left = '0px'; popup.style.right = 'auto';
  const rect = trigger.getBoundingClientRect();
  const popupWidth = popup.offsetWidth || 160;
  const margin = 10; let left = 0;
  const overflowRight = (rect.left + popupWidth) - (window.innerWidth - margin);
  if (overflowRight > 0) left -= overflowRight;
  const minLeft = -rect.left + margin;
  if (left < minLeft) left = minLeft;
  popup.style.left = `${left}px`;
}

function positionModelPopup() {
  const popup = $('#modelPopupMain');
  const trigger = $('#modelTriggerBtnMain');
  if (!popup || !trigger) return;
  popup.style.left = '0px'; popup.style.right = 'auto';
  const rect = trigger.getBoundingClientRect();
  const popupWidth = popup.offsetWidth || 160;
  const margin = 10; let left = 0;
  const overflowRight = (rect.left + popupWidth) - (window.innerWidth - margin);
  if (overflowRight > 0) left -= overflowRight;
  const minLeft = -rect.left + margin;
  if (left < minLeft) left = minLeft;
  popup.style.left = `${left}px`;
}

$('#modeTriggerBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const opening = !$('#modePopup')?.classList.contains('active');
  $('#modelPopupMain')?.classList.remove('active');
  $('#modePopup')?.classList.toggle('active');
  if (opening) positionModePopup();
});

$('#modePopup')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-opt'); if (!btn) return;
  setMode(btn.dataset.mode);
  $('#modePopup')?.classList.remove('active');
  sfx.click();
});

$('#modelTriggerBtnMain')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const opening = !$('#modelPopupMain')?.classList.contains('active');
  $('#modePopup')?.classList.remove('active');
  $('#modelPopupMain')?.classList.toggle('active');
  if (opening) positionModelPopup();
});

$('#modelPopupMain')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-opt'); if (!btn || btn.disabled) return;
  const selectedModel = btn.dataset.model;
  const mode = state.mode || 'chat';
  if (btn.dataset.locked === '1' || isModelLocked(selectedModel)) {
    toast('This model needs Pro — tap Buy Pro to upgrade.', 'error');
    $('#modelPopupMain')?.classList.remove('active');
    openBuyPro();
    return;
  }
  state.settings.models[mode] = selectedModel;
  saveSettings();
  renderModelSelector();
  $('#modelPopupMain')?.classList.remove('active');
  sfx.click();
  toast(`Model Switched To ${MODELS[mode][selectedModel].label}`, 'success');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.mode-trigger-wrap')) {
    $('#modePopup')?.classList.remove('active');
    $('#modelPopupMain')?.classList.remove('active');
  }
});

window.addEventListener('resize', () => {
  if ($('#modePopup')?.classList.contains('active')) positionModePopup();
  if ($('#modelPopupMain')?.classList.contains('active')) positionModelPopup();
});

let recognition = null;
let recordingTimer = null;
let recordingSeconds = 0;
let isRecording = false;

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const ui = $('#userInput');
    if (ui) {
      ui.value = transcript;
      ui.style.height = 'auto';
      ui.style.height = Math.min(ui.scrollHeight, 160) + 'px';
      syncSendBtnMode();
    }
  };
  rec.onerror = (e) => {
    stopSpeechToText();
    toast("Speech Recognition Error: " + e.error, "error");
  };
  rec.onend = () => { if (isRecording) stopSpeechToText(); };
  return rec;
}

function startSpeechToText() {
  if (!recognition) recognition = initSpeechRecognition();
  if (!recognition) {
    toast("Speech recognition is not supported in this browser.", "error");
    return;
  }
  try {
    recognition.start();
    isRecording = true;
    recordingSeconds = 0;
    const sendIcon = $('#sendBtnIcon');
    if (sendIcon) sendIcon.className = 'fa-solid fa-stop animate-pulse-red';
    $('#sendBtn')?.classList.add('recording-active');
    updatePlaceholderWithTimer();
    recordingTimer = setInterval(() => {
      recordingSeconds++;
      updatePlaceholderWithTimer();
    }, 1000);
    toast("Listening... Speak now", "success");
  } catch (err) {
    toast("Could not start speech recognition.", "error");
  }
}

function stopSpeechToText() {
  if (!isRecording) return;
  isRecording = false;
  if (recognition) { try { recognition.stop(); } catch(e){} }
  if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
  const ui = $('#userInput');
  const mode = state.mode || 'chat';
  const placeholders = { chat: 'Ask Me Anything...', image: 'Image Gen...' };
  if (ui) ui.placeholder = placeholders[mode] || 'Ask me anything...';
  $('#sendBtn')?.classList.remove('recording-active');
  syncSendBtnMode();
  toast("Speech recorded successfully!", "success");
}

function updatePlaceholderWithTimer() {
  const minutes = Math.floor(recordingSeconds / 60);
  const seconds = recordingSeconds % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const ui = $('#userInput');
  if (ui) ui.placeholder = `Listening... [${formattedTime}] Speak Clearly...`;
}

function syncSendBtnMode() {
  if (state.generating || isRecording) return;
  const hasText = userInput.value.trim().length > 0;
  const sendBtn = $('#sendBtn');
  const sendIcon = $('#sendBtnIcon');
  if (sendBtn) sendBtn.classList.toggle('send-mode', hasText);
  if (sendIcon) sendIcon.className = hasText ? 'fa-solid fa-arrow-up' : 'fa-solid fa-microphone';
  if (sendBtn) sendBtn.title = hasText ? 'Send' : 'Voice';
}

const MAX_PDF_PAGES = 200;

async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  const maxPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
    if (text.length > MAX_ATTACHMENT_CHARS) break;
  }
  return text.slice(0, MAX_ATTACHMENT_CHARS).trim();
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

const ALLOWED_TEXT_EXTS = [
  'txt', 'html', 'css', 'js', 'json', 'py', 'java', 'cpp', 'c', 'cs', 'ts', 
  'sh', 'md', 'xml', 'yaml', 'yml', 'sql', 'php', 'rb', 'h', 'hpp', 'kt', 
  'rs', 'go', 'swift', 'scala', 'r', 'pl', 'pm', 't', 'pod', 'm', 'mm'
];

function clearPendingAttachment() {
  state.pendingAttachment = null;
  const preview = $('#filePreview');
  const uploadInput = $('#fileUploadInput');
  if (preview) preview.hidden = true;
  if (uploadInput) uploadInput.value = '';
}

$('#cancelFileBtn')?.addEventListener('click', clearPendingAttachment);
$('#fileUploadBtn')?.addEventListener('click', () => $('#fileUploadInput')?.click());

$('#fileUploadInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const parts = file.name.split('.');
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';

  const blockedExtensions = [
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'exe', 'msi', 'apk', 'app', 'dmg', 
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'tiff', 'svg', 
    'mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'mpeg', 'mpg', '3gp',
    'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'
  ];

  if (blockedExtensions.includes(ext)) {
    toast('Images, videos, zip files, and archives are strictly not allowed!', 'error');
    clearPendingAttachment();
    return;
  }

  try {
    if (ext === 'pdf') {
      toast('Reading PDF…', 'default');
      const text = await extractPdfText(file);
      if (!text) { 
        toast('Could not extract text from PDF.', 'error'); 
        clearPendingAttachment(); 
        return; 
      }
      state.pendingAttachment = { name: file.name, text };
      const previewTitle = $('#filePreviewTitle');
      const previewBlock = $('#filePreview');
      if (previewTitle) previewTitle.textContent = `PDF: ${file.name}`;
      if (previewBlock) previewBlock.hidden = false;
      toast('PDF loaded successfully!', 'success');
    } else if (ALLOWED_TEXT_EXTS.includes(ext) || file.type === 'text/plain') {
      const text = await readFileAsText(file);
      if (!text.trim()) {
        toast('The uploaded file is empty.', 'error');
        clearPendingAttachment();
        return;
      }
      state.pendingAttachment = { name: file.name, text };
      const previewTitle = $('#filePreviewTitle');
      const previewBlock = $('#filePreview');
      if (previewTitle) previewTitle.textContent = `File: ${file.name}`;
      if (previewBlock) previewBlock.hidden = false;
      toast('File loaded successfully!', 'success');
    } else {
      toast('Unsupported format! Only TXT, PDF, and code files are allowed.', 'error');
      clearPendingAttachment();
    }
  } catch (err) {
    toast('Could not read file contents.', 'error');
    clearPendingAttachment();
  }
});

const promptLibState = { cat: 'all', query: '', tabsBuilt: false };

function buildPromptLibTabs() {
  const tabs = $('#promptLibTabs');
  if (!tabs || promptLibState.tabsBuilt) return;
  const categories = [...new Set(PROMPT_LIBRARY.map(p => p.category))].sort();
  const allBtn = `<button class="prompt-tab active" data-cat="all"><i class="fa-solid fa-layer-group"></i> All</button>`;
  const catBtns = categories.map(cat =>
    `<button class="prompt-tab" data-cat="${escapeHtml(cat)}"><i class="fa-solid fa-tag"></i> ${escapeHtml(cat)}</button>`
  ).join('');
  tabs.innerHTML = allBtn + catBtns;
  promptLibState.tabsBuilt = true;
}

function renderPromptLibrary() {
  const list = $('#promptLibList');
  if (!list) return;
  const { cat, query } = promptLibState;
  const q = query.trim().toLowerCase();
  const filtered = PROMPT_LIBRARY.filter(p => {
    const matchesCat = cat === 'all' || p.category === cat;
    if (!matchesCat) return false;
    if (!q) return true;
    return p.title.toLowerCase().includes(q) ||
           p.description.toLowerCase().includes(q) ||
           p.prompt.toLowerCase().includes(q);
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="prompt-lib-empty"><i class="fa-solid fa-magnifying-glass"></i> No prompts found.</div>`;
    return;
  }

  list.innerHTML = filtered.map(p => `
    <button class="prompt-item" data-id="${p.id}">
      <span class="prompt-item-title">${escapeHtml(p.title)}</span>
      <span class="prompt-item-desc">${escapeHtml(p.description)}</span>
    </button>
  `).join('');
}

$('#promptLibList')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.prompt-item');
  if (!btn) return;
  const item = PROMPT_LIBRARY.find(p => String(p.id) === btn.dataset.id);
  if (!item) return;
  userInput.value = item.prompt;
  userInput.focus();
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
  syncSendBtnMode();
  closeModal('#promptLibModal');
});

$('#openPromptLibBtn')?.addEventListener('click', () => {
  buildPromptLibTabs();
  renderPromptLibrary();
  openModal('#promptLibModal');
});

$('#promptLibTabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.prompt-tab'); if (!btn) return;
  $all('.prompt-tab').forEach(b => b.classList.toggle('active', b === btn));
  promptLibState.cat = btn.dataset.cat;
  renderPromptLibrary();
});

$('#promptLibSearchInput')?.addEventListener('input', (e) => {
  promptLibState.query = e.target.value;
  renderPromptLibrary();
});

const userInput = $('#userInput');
if (userInput) {
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
    syncSendBtnMode();
  });
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
}
$('#sendBtn')?.addEventListener('click', () => {
  if (state.generating) { stopGeneration(); return; }
  if (isRecording) { stopSpeechToText(); return; }
  if (userInput.value.trim().length > 0 || state.pendingAttachment) { handleSend(); return; }
  startSpeechToText();
});

function estimateTokens(str) { return Math.ceil((str || '').length / CHARS_PER_TOKEN_ESTIMATE); }

function refreshContextGuard() {
  const chat = getActiveChat();
  if (!chat || chat.mode !== 'chat') { setContextFrozen(false); return; }
  const historyText = chat.messages.map(m => m.content || '').join(' ');
  const tooLong = estimateTokens(historyText) > CONTEXT_TOKEN_LIMIT;
  setContextFrozen(tooLong);
}

function setContextFrozen(on) {
  state.contextFrozen = on;
  const banner = $('#contextLimitBanner');
  const input = $('#userInput');
  const sendBtn = $('#sendBtn');
  const inputCard = $('#inputCard');

  if (banner) banner.hidden = !on;
  if (input) input.disabled = on;
  if (sendBtn) sendBtn.disabled = on;
  if (inputCard) inputCard.classList.toggle('frozen', on);
}

$('#contextLimitNewChatBtn')?.addEventListener('click', async () => {
  await createNewChat();
  setContextFrozen(false);
});

function buildContextPrompt(chat, newText) {
  const historyMsgs = chat.messages.slice(0, -1).slice(-3);
  let history = '';
  for (const m of historyMsgs) {
    if (m.content) {
      history += `${m.role === 'user' ? 'U' : 'A'}:${m.content.slice(0, 100)}|`;
    }
  }
  let memoryPrefix = '';
  if (state.settings.memoryEnabled !== false && state.settings.memories && state.settings.memories.length > 0) {
    memoryPrefix = `[AI Memories: ${state.settings.memories.join(', ')}] `;
  }
  const prefix = history ? `Ctx:${history}\n` : '';
  const prompt = `${memoryPrefix}${prefix}Q:${newText}`;
  return prompt.slice(0, 800);
}

async function fetchResilient(url, { signal, timeoutMs = 20000, attempts = 3 } = {}) {
  const headers = {};
  let lastError = null;
  for (let a = 0; a < attempts; a++) {
    try {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      if (signal) signal.addEventListener('abort', onAbort);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal, headers });
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      } catch (innerErr) {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        throw innerErr;
      }
    } catch (err) {
      if (err.name === 'AbortError' && signal && signal.aborted) throw err;
      lastError = err;
      if (a < attempts - 1) await new Promise(r => setTimeout(r, 500 * (a + 1)));
    }
  }
  throw lastError || new Error('All requests failed');
}

async function handleSend() {
  if (state.contextFrozen) return;
  const attachment = state.pendingAttachment;
  const typedText = userInput ? userInput.value.trim() : '';
  if (!typedText && !attachment) return;
  if (state.generating) return;

  if (state.editingMessageId) {
    await applyEditAndResend(typedText);
    return;
  }

  const chat = getActiveChat();

  if (attachment) {
    const displayText = typedText || `Analyze this file: ${attachment.name}`;
    const promptForApi = `${typedText ? typedText + '\n\n' : ''}File "${attachment.name}" content:\n${attachment.text}`.slice(0, MAX_ATTACHMENT_CHARS);
    const inWords = countWords(promptForApi);
    if (!checkAndConsumeTokens('input', inWords, state.settings.models.chat || 'groq-gpt-oss-120b')) return;

    autoTitleChat(chat, displayText);
    chat.mode = 'chat';
    const userMsg = { id: uid(), role: 'user', content: displayText, type: 'text', pdfName: attachment.name, time: Date.now() };
    chat.messages.push(userMsg);
    await persistChat(chat);
    $('#chatBox')?.appendChild(buildMessageEl(userMsg));
    const chatBoxEl = $('#chatBox');
    if (chatBoxEl) chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
    if (userInput) { userInput.value = ''; userInput.style.height = 'auto'; }
    syncSendBtnMode();
    clearPendingAttachment();
    renderChatList();
    return runChatGeneration(chat, promptForApi);
  }

  const text = typedText;
  const inWords = countWords(text);
  if (!checkAndConsumeTokens('input', inWords, state.settings.models.chat || 'groq-gpt-oss-120b')) return;

  autoTitleChat(chat, text);
  chat.mode = state.mode;

  const userMsg = { id: uid(), role: 'user', content: text, type: 'text', time: Date.now() };
  
  chat.messages.push(userMsg);
  await persistChat(chat);
  $('#chatBox')?.appendChild(buildMessageEl(userMsg));
  const chatBoxEl = $('#chatBox');
  if (chatBoxEl) chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
  if (userInput) { userInput.value = ''; userInput.style.height = 'auto'; }
  syncSendBtnMode();
  renderChatList();

  if (state.mode === 'image') return runImageGeneration(chat, text);
  return runChatGeneration(chat, text);
}

function showSkeleton() {
  const box = $('#chatBox');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'message assistant'; div.id = 'skeletonMsg';
  div.innerHTML = `<div class="bubble thinking-bubble">
    <span class="thinking-orb"></span>
    <span class="thinking-text" id="thinkingText">${THINKING_PHRASES[0]}</span><span class="thinking-dots"><i></i><i></i><i></i></span>
  </div>`;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
  let idx = 0;
  window._thinkingInterval = setInterval(() => {
    idx = (idx + 1) % THINKING_PHRASES.length;
    const el = document.getElementById('thinkingText');
    if (el) el.textContent = THINKING_PHRASES[idx];
  }, 1600);
}

function removeSkeleton() {
  clearInterval(window._thinkingInterval);
  $('#skeletonMsg')?.remove();
}

function setGenerating(on) {
  state.generating = on;
  const sendBtn = $('#sendBtn');
  const sendIcon = $('#sendBtnIcon');
  if (sendBtn) sendBtn.classList.toggle('generating', on);
  if (on) {
    if (sendIcon) sendIcon.className = 'fa-solid fa-stop';
    if (sendBtn) sendBtn.title = 'Stop generating';
  } else {
    syncSendBtnMode();
  }
}

function stopGeneration() {
  if (state.abortController) state.abortController.abort();
  setGenerating(false);
  removeSkeleton();
  clearInterval(window._typingInterval);
  clearInterval(window._thinkingInterval);
}

// All AI traffic goes through the Supabase Edge Function 'ai-chat'.
// The upstream API key lives only as an Edge Function secret — never in the frontend.
// (Free-plan safety filtering happens server-side in the Edge Function.)
async function callAiEdge(model, q) {
  if (!supabaseClient) throw new Error('Supabase is not configured yet.');
  const { data, error } = await supabaseClient.functions.invoke('ai-chat', { body: { model, q } });
  if (error) throw new Error(error.message || 'AI request failed');
  if (!data || data.ok === false) throw new Error((data && data.error) || 'AI request failed');
  return data;
}
function aiPrecheck(model) {
  if (!supabaseClient) { toast('Supabase is not configured yet.', 'error'); return false; }
  if (maintenanceMode && !currentUserProfile.is_admin) { toast('BADSHAH AI is under maintenance right now.', 'error'); return false; }
  if (isModelLocked(model)) { toast('This model needs Pro — tap Buy Pro to upgrade.', 'error'); openBuyPro(); return false; }
  if (!modelState(model).enabled || !modelAvailable(model)) { toast('This model is under maintenance right now.', 'error'); return false; }
  return true;
}
function blobToDataUrl(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}

async function runChatGeneration(chat, text) {
  const model = state.settings.models.chat || 'groq-gpt-oss-120b';
  if (!aiPrecheck(model)) { setGenerating(false); return; }
  setGenerating(true); showSkeleton();
  state.abortController = new AbortController();
  const signal = state.abortController.signal;
  const inTok = Math.ceil(countWords(text) * (MODEL_COSTS[model]?.inputPerWord ?? 2));
  let reply = '', ok = false;
  try {
    const data = await callAiEdge(model, buildContextPrompt(chat, text));
    if (signal.aborted) return;
    reply = (data && data.text) || ''; ok = reply.length > 0;
  } catch (err) {
    if (signal.aborted) return;
    reply = 'Sorry, the AI could not respond right now. Please try again in a moment.';
  }
  removeSkeleton();
  if (!state.generating) return;
  let outTok = 0;
  if (ok) {
    const before = state.usage.tokensUsedLifetime || 0;
    checkAndConsumeTokens('output', countWords(reply), model);
    outTok = Math.max(0, (state.usage.tokensUsedLifetime || 0) - before);
  }
  fbLogUsage(model, inTok + outTok, ok);
  const msg = { id: uid(), role: 'assistant', content: reply, type: 'text', time: Date.now(), model };
  chat.messages.push(msg); await persistChat(chat);
  await typeOutMessage(msg);
  setGenerating(false);
  if (typeof refreshContextGuard === 'function') refreshContextGuard();
  renderChatList();
}

async function runImageGeneration(chat, text) {
  const model = state.settings.models.image || 'pollinations-image';
  if (!aiPrecheck(model)) { setGenerating(false); return; }
  if (!checkAndConsumeTokens('image', 0, model)) { setGenerating(false); return; }
  setGenerating(true); showSkeleton();
  state.abortController = new AbortController();
  const signal = state.abortController.signal;
  try {
    const data = await callAiEdge(model, text.slice(0, 800));
    if (signal.aborted) return;
    let src = '';
    if (data.image_url) src = data.image_url;
    else if (data.image_base64) src = 'data:' + (data.content_type || 'image/png') + ';base64,' + data.image_base64;
    if (!src) throw new Error('No image returned');
    removeSkeleton();
    if (!state.generating) return;
    fbLogUsage(model, MODEL_COSTS[model]?.flatCost || 0, true);
    const msg = { id: uid(), role: 'assistant', content: '', type: 'image', mediaUrl: src, time: Date.now(), model };
    chat.messages.push(msg); await persistChat(chat);
    const box = $('#chatBox');
    if (box) { box.appendChild(buildMessageEl(msg)); box.scrollTop = box.scrollHeight; }
  } catch (err) {
    removeSkeleton();
    if (signal.aborted || !state.generating) return;
    fbLogUsage(model, 0, false);
    appendErrorMessage(chat, 'Sorry, the image could not be generated right now. Please try again.');
  }
  setGenerating(false);
  renderChatList();
}


function appendErrorMessage(chat, text) {
  const errMsg = { id: uid(), role: 'assistant', content: text, type: 'text', time: Date.now() };
  chat.messages.push(errMsg); persistChat(chat);
  const chatBoxEl = $('#chatBox');
  if (chatBoxEl) {
    chatBoxEl.appendChild(buildMessageEl(errMsg));
    chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
  }
}

function typeOutMessage(msg) {
  return new Promise((resolve) => {
    const box = $('#chatBox');
    if (!box) return resolve();
    const el = document.createElement('div');
    el.className = 'message assistant';
    el.dataset.id = msg.id;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    bubble.appendChild(cursor);
    el.appendChild(bubble);
    box.appendChild(el); box.scrollTop = box.scrollHeight;
    const full = msg.content || '';
    let i = 0;
    const step = Math.max(1, Math.round(full.length / 220));
    window._typingInterval = setInterval(() => {
      i += step;
      const partial = full.slice(0, i);
      bubble.innerHTML = renderMarkdown(partial);
      bubble.appendChild(cursor);
      box.scrollTop = box.scrollHeight;
      if (i >= full.length) {
        clearInterval(window._typingInterval);
        finalizeRenderedMessage(el, msg);
        resolve();
      }
    }, 12);
  });
}

function finalizeRenderedMessage(el, msg) {
  el.replaceWith(buildMessageEl(msg));
  const chatBoxEl = $('#chatBox');
  if (chatBoxEl) chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
}

function startEditMessage(m) {
  state.editingMessageId = m.id;
  if (userInput) {
    userInput.value = m.content;
    userInput.focus();
  }
  syncSendBtnMode();
  $('#editPreview')?.classList.add('active');
}
$('#cancelEditBtn')?.addEventListener('click', () => {
  state.editingMessageId = null;
  $('#editPreview')?.classList.remove('active');
  if (userInput) userInput.value = '';
  syncSendBtnMode();
});

async function applyEditAndResend(newText) {
  const chat = getActiveChat();
  const idx = chat.messages.findIndex(m => m.id === state.editingMessageId);
  if (idx === -1) return;
  chat.messages = chat.messages.slice(0, idx);
  state.editingMessageId = null;
  $('#editPreview')?.classList.remove('active');
  await persistChat(chat);
  renderActiveChat();
  if (userInput) userInput.value = newText;
  await handleSend();
}

async function regenerateMessage(chat, m) {
  const idx = chat.messages.findIndex(x => x.id === m.id);
  const priorUser = [...chat.messages.slice(0, idx)].reverse().find(x => x.role === 'user');
  if (!priorUser) return toast('Nothing to regenerate', 'error');
  chat.messages = chat.messages.filter(x => x.id !== m.id);
  await persistChat(chat);
  renderActiveChat();
  if (chat.mode === 'image') return runImageGeneration(chat, priorUser.content);
  return runChatGeneration(chat, priorUser.content);
}

async function continueMessage(chat, m) {
  if (state.generating) return;
  const model = state.settings.models.chat || 'groq-gpt-oss-120b';
  if (!aiPrecheck(model)) return;
  setGenerating(true); showSkeleton();
  state.abortController = new AbortController();
  const signal = state.abortController.signal;
  try {
    const q = `Continue this answer naturally from where it stopped:\n${(m.content || '').slice(-500)}`;
    const data = await callAiEdge(model, q);
    if (signal.aborted) return;
    const more = (data && data.text) || '';
    removeSkeleton();
    const before = state.usage.tokensUsedLifetime || 0;
    checkAndConsumeTokens('output', countWords(more), model);
    fbLogUsage(model, Math.max(0, (state.usage.tokensUsedLifetime || 0) - before), true);
    m.content = (m.content || '') + '\n\n' + more;
    await persistChat(chat); renderActiveChat();
  } catch (err) {
    removeSkeleton();
    if (!signal.aborted) { fbLogUsage(model, 0, false); toast('Could not continue right now.', 'error'); }
  }
  setGenerating(false);
}

window.ftImgFallback = async function (img) {
  const tries = Number(img.dataset.tries || 0);
  img.dataset.tries = String(tries + 1);
  const src = img.dataset.src || '';
  const showLink = () => img.replaceWith(Object.assign(document.createElement('a'), { href: src, target: '_blank', rel: 'noopener', className: 'media-gone', textContent: 'Open generated image' }));
  if (tries >= 2 || !src || src.startsWith('data:')) return showLink();
  const apply = (blob) => { img.src = URL.createObjectURL(blob); };
  try {
    if (tries === 0) {
      try {
        const r = await fetch(src);
        if (r.ok) {
          const b = await r.blob();
          if (b.type.startsWith('image/')) return apply(b);
          const next = extractImageSource(await b.text(), b.type);
          if (next && next !== src) { img.dataset.src = next; img.src = next; return; }
        }
      } catch (e) {}
    }
  } catch (e) {}
  showLink();
};

function extractImageSource(raw, contentType = '') {
  if (!raw || String(contentType).toLowerCase().startsWith('image/')) return '';
  const urlRe = /https?:\/\/[^\s"'<>)\\]+|data:image\/[^\s"'<>)\\]+/i;
  const pick = (v) => {
    if (typeof v !== 'string') return '';
    const m = v.trim().replace(/\\\//g, '/').match(urlRe);
    return m ? m[0] : '';
  };
  let json = null;
  try { json = JSON.parse(raw); } catch (e) {}
  if (json && typeof json === 'object') {
    const keys = ['image_url', 'imageUrl', 'image', 'img', 'images', 'url', 'link', 'src', 'output', 'result', 'data'];
    const walk = (node, depth) => {
      if (node == null || depth > 5) return '';
      if (typeof node === 'string') return pick(node);
      if (Array.isArray(node)) {
        for (const item of node) { const r = walk(item, depth + 1); if (r) return r; }
        return '';
      }
      if (typeof node === 'object') {
        for (const k of keys) {
          if (k in node) { const r = walk(node[k], depth + 1); if (r) return r; }
        }
        for (const k of Object.keys(node)) {
          if (!keys.includes(k)) { const r = walk(node[k], depth + 1); if (r) return r; }
        }
      }
      return '';
    };
    const found = walk(json, 0);
    if (found) return found;
  }
  return pick(raw);
}

async function dataUrlOrRemoteToFile(src, filename, mime) {
  const res = await fetch(src);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || mime });
}

async function shareMessage(m) {
  try {
    const caption = m.type === 'image' ? 'BADSHAH AI IMAGE' : (m.content || 'BADSHAH AI MESSAGE');
    if (navigator.share) {
      await navigator.share({ title: 'BADSHAH AI', text: caption, url: window.location.href });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(window.location.href);
      toast('Page link copied', 'success');
    }
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Share cancelled or unavailable.', 'error');
  }
}

$('#exportDataBtn')?.addEventListener('click', async () => {
  const data = { chats: state.chats, settings: state.settings, usage: state.usage, exportedAt: Date.now() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `ftai-backup-${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  toast('Backup downloaded', 'success');
});

$('#importDataBtn')?.addEventListener('click', () => $('#importDataInput')?.click());
$('#importDataInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data.chats)) {
      for (const c of data.chats) await idbPut('chats', c);
    }
    if (data.settings) { state.settings = data.settings; await saveSettings(); applyTheme(); applyFontSize(); syncSettingsUI(); renderMemories(); }
    if (data.usage) { state.usage = data.usage; await saveUsage(); renderUsageAndStats(); }
    await loadChats();
    toast('Data imported successfully', 'success');
  } catch (err) { toast('Import failed — invalid file', 'error'); }
  e.target.value = '';
});

$('#clearDataBtn')?.addEventListener('click', async () => {
  if (!confirm('This will delete all conversations on this device. Continue?')) return;
  const all = await idbGetAll('chats');
  for (const c of all) await idbDelete('chats', c.id);
  await idbDelete('meta', 'activeChatId');
  state.chats = [];
  await createNewChat(true);
  toast('All conversations cleared!', 'success');
});

function openModal(id) { $(id)?.classList.add('active'); }
function closeModal(id) { $(id)?.classList.remove('active'); }
$all('.close-modal').forEach(btn => btn.addEventListener('click', (e) => {
  const overlay = e.target.closest('.modal-overlay');
  if (overlay) closeModal('#' + overlay.id);
}));
$all('.modal-overlay').forEach(ov => ov.addEventListener('click', (e) => { if (e.target === ov) closeModal('#' + ov.id); }));

$('#openSettingsBtn')?.addEventListener('click', () => openModal('#settingsModal'));
$('#openAboutBtn')?.addEventListener('click', () => openModal('#aboutModal'));
$('#openSidebarBtn')?.addEventListener('click', () => { $('#sidebar')?.classList.add('active'); $('#sidebarOverlay')?.classList.add('active'); });
$('#closeSidebarBtn')?.addEventListener('click', closeSidebarOnMobile);
$('#sidebarOverlay')?.addEventListener('click', closeSidebarOnMobile);



/* ================= BADSHAH AI v2: Auth / Profile / Buy Pro / Help / Policies ================= */

function showAuthLoggedOut() {
  currentUser = null;
  currentUserProfile.is_pro = false;
  currentUserProfile.is_admin = false;
  currentUserProfile.plan_id = null;
  currentUserProfile.pro_expires_at = null;
  currentUserProfile.display_name = '';
  currentUserProfile.email = '';
  disabledModels = new Set();
  maintenanceMode = false;
  const authBox = $('#authBox');
  if (authBox) authBox.style.display = '';
  const loginForm = $('#loginForm');
  if (loginForm) loginForm.hidden = false;
  const registerForm = $('#registerForm');
  if (registerForm) registerForm.hidden = true;
  const enterBtn = $('#enterAppBtn');
  if (enterBtn) enterBtn.hidden = true;
  const adminBtn = $('#openAdminBtn');
  if (adminBtn) adminBtn.hidden = true;
  updateTokenBadgeFromAuth();
  if (typeof renderModelSelector === 'function') renderModelSelector();
}

async function afterLogin(user, recordHistory) {
  currentUser = user;
  await loadUserProfile();
  const authBox = $('#authBox');
  if (authBox) authBox.style.display = 'none';
  const enterBtn = $('#enterAppBtn');
  if (enterBtn) enterBtn.hidden = false;
  updateTokenBadgeFromAuth();
  if (recordHistory) recordLoginHistory(user);
}

function applyProfile(p) {
  currentUserProfile.is_pro = !!p.is_pro;
  currentUserProfile.is_admin = !!p.is_admin;
  currentUserProfile.plan_id = p.plan_id ?? null;
  currentUserProfile.pro_expires_at = p.pro_expires_at ?? null;
  currentUserProfile.display_name = p.display_name || '';
  currentUserProfile.email = p.email || '';
  // An expired Pro date means Free in the UI (a null date means no expiry set).
  if (currentUserProfile.pro_expires_at && new Date(currentUserProfile.pro_expires_at) < new Date()) {
    currentUserProfile.is_pro = false;
  }
  const adminBtn = $('#openAdminBtn');
  if (adminBtn) adminBtn.hidden = !currentUserProfile.is_admin;
}

// 7) PROFILE + PLAN LOAD (safe fallbacks: app keeps working as Free if tables are missing)
async function loadUserProfile() {
  if (!supabaseClient || !currentUser) return;
  try {
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    if (error || !data) {
      // Fallback if the DB trigger did not create the row: insert it ourselves.
      const fallback = {
        id: currentUser.id,
        email: currentUser.email || '',
        display_name: (currentUser.user_metadata && currentUser.user_metadata.display_name) || currentUser.email || '',
      };
      try {
        const ins = await supabaseClient.from('profiles').insert(fallback).select('*').single();
        if (!ins.error && ins.data) applyProfile(ins.data);
        else applyProfile(fallback);
      } catch (e) { applyProfile(fallback); }
    } else {
      applyProfile(data);
    }
  } catch (e) { /* keep Free defaults */ }
  try { await loadAdminSettings(); } catch (e) { /* keep defaults */ }
  updateTokenBadgeFromAuth();
  if (typeof renderModelSelector === 'function') renderModelSelector();
}

// Apply the admin's APK URL to every APK download link in the app.
function applyApkUrl(url) {
  if (!url || typeof url !== 'string' || !url.trim()) return;
  const clean = url.trim();
  document.querySelectorAll('a[href$=".apk"]').forEach(function (a) { a.href = clean; });
  const btn = $('#apkDownloadBtn');
  if (btn) btn.href = clean;
}

// Apply the admin's site display name to the brand spots in the app.
function applySiteName(name) {
  if (!name || typeof name !== 'string' || !name.trim()) return;
  const clean = name.trim();
  document.title = clean + ' — AI Chat & Image Generator';
  const brand = document.querySelector('.brand-text strong');
  if (brand) brand.textContent = clean;
  const aboutH = document.querySelector('.about-body h3');
  if (aboutH) aboutH.textContent = clean;
  const ibName = document.querySelector('.ib-text .grad-text');
  if (ibName) ibName.textContent = clean;
  const introPara = document.querySelector('.intro-landing > p');
  if (introPara) introPara.textContent = clean + ' — smart AI chat and image generation. Login to continue.';
}

async function loadAdminSettings() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from('admin_settings').select('*');
  if (error || !Array.isArray(data)) return;
  for (const row of data) {
    const key = row.key || row.setting_key || row.name || row.id;
    const value = row.value ?? row.setting_value ?? row.data ?? row;
    if (key === 'maintenance') {
      maintenanceMode = !!(value && typeof value === 'object' ? value.on : value === true);
      const ov = $('#maintenanceOverlay');
      if (ov) {
        ov.style.display = (maintenanceMode && !currentUserProfile.is_admin) ? 'flex' : 'none';
        if (value && typeof value === 'object' && value.message) {
          const t = $('#maintenanceText');
          if (t) t.textContent = value.message;
        }
      }
    } else if (key === 'models') {
      const list = (value && typeof value === 'object' && Array.isArray(value.disabled)) ? value.disabled : [];
      disabledModels = new Set(list);
    } else if (key === 'payment_accounts') {
      // Buy Pro shows the admin's current accounts, not the hard-coded ones.
      if (value && typeof value === 'object') {
        if (value.easypaisa) PAYMENT_ACCOUNTS.easypaisa.number = String(value.easypaisa);
        if (value.jazzcash) PAYMENT_ACCOUNTS.jazzcash.number = String(value.jazzcash);
        if (value.nayapay) PAYMENT_ACCOUNTS.nayapay.number = String(value.nayapay);
        if (value.bank_name) PAYMENT_ACCOUNTS.bank.label = String(value.bank_name);
        if (value.iban) PAYMENT_ACCOUNTS.bank.iban = String(value.iban);
      }
    } else if (key === 'apk_url') {
      const url = value && typeof value === 'object' ? value.url : value;
      if (typeof url === 'string' && url.trim()) applyApkUrl(url.trim());
    } else if (key === 'site_name') {
      const name = value && typeof value === 'object' ? (value.name || value.value) : value;
      if (typeof name === 'string' && name.trim()) applySiteName(name.trim());
    }
  }
}

// 6) LOGIN HISTORY (best-effort, never blocks login)
async function recordLoginHistory(user) {
  if (!supabaseClient || !user) return;
  let ip = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      const json = await res.json();
      ip = json && json.ip ? String(json.ip) : null;
    } finally { clearTimeout(timer); }
  } catch (e) { ip = null; }
  const device = (navigator.userAgent || '').slice(0, 255);
  try {
    await supabaseClient.from('login_history').insert({ user_id: user.id, ip, device });
  } catch (e) { /* ignore */ }
  try {
    await supabaseClient.from('profiles').update({ last_ip: ip, last_device: device }).eq('id', user.id);
  } catch (e) { /* ignore */ }
}

// 5) AUTH wiring
function passwordChecks(pw) {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}
function validatePasswordLive() {
  const pw = $('#regPassword') ? $('#regPassword').value : '';
  const checks = passwordChecks(pw);
  const map = { ruleLength: 'length', ruleUpper: 'upper', ruleLower: 'lower', ruleNumber: 'number', ruleSpecial: 'special' };
  Object.entries(map).forEach(([id, key]) => {
    const li = document.getElementById(id);
    if (!li) return;
    li.classList.toggle('valid', !!checks[key]);
    li.classList.toggle('invalid', !checks[key]);
  });
  return checks;
}

function wireAuthUI() {
  $('#showRegisterBtn')?.addEventListener('click', () => {
    const loginForm = $('#loginForm');
    const registerForm = $('#registerForm');
    if (loginForm) loginForm.hidden = true;
    if (registerForm) registerForm.hidden = false;
  });
  $('#showLoginBtn')?.addEventListener('click', () => {
    const loginForm = $('#loginForm');
    const registerForm = $('#registerForm');
    if (loginForm) loginForm.hidden = false;
    if (registerForm) registerForm.hidden = true;
  });
  $('#regPassword')?.addEventListener('input', validatePasswordLive);

  $('#loginBtn')?.addEventListener('click', async () => {
    if (!requireSupabase()) return;
    const email = $('#loginEmail') ? $('#loginEmail').value.trim() : '';
    const password = $('#loginPassword') ? $('#loginPassword').value : '';
    const errEl = $('#loginError');
    if (errEl) errEl.textContent = '';
    if (!email || !password) { if (errEl) errEl.textContent = 'Enter your email and password.'; return; }
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { if (errEl) errEl.textContent = error.message || 'Login failed.'; return; }
    const user = (data && (data.user || (data.session && data.session.user))) || null;
    if (!user) { if (errEl) errEl.textContent = 'Login failed — please try again.'; return; }
    await afterLogin(user, true);
    toast('Welcome back!', 'success');
  });

  $('#registerBtn')?.addEventListener('click', async () => {
    if (!requireSupabase()) return;
    const name = $('#regName') ? $('#regName').value.trim() : '';
    const email = $('#regEmail') ? $('#regEmail').value.trim() : '';
    const password = $('#regPassword') ? $('#regPassword').value : '';
    const confirm = $('#regConfirmPassword') ? $('#regConfirmPassword').value : '';
    const errEl = $('#registerError');
    if (errEl) errEl.textContent = '';
    if (!name) { if (errEl) errEl.textContent = 'Please enter your name.'; return; }
    if (!email) { if (errEl) errEl.textContent = 'Please enter your email.'; return; }
    const checks = validatePasswordLive();
    if (!checks.length || !checks.upper || !checks.lower || !checks.number || !checks.special) {
      if (errEl) errEl.textContent = 'Password must be 8+ characters with an uppercase letter, a lowercase letter, a number and a special character.';
      return;
    }
    if (password !== confirm) { if (errEl) errEl.textContent = 'Passwords do not match.'; return; }
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    });
    if (error) { if (errEl) errEl.textContent = error.message || 'Could not create account.'; return; }
    const user = (data && (data.user || (data.session && data.session.user))) || null;
    if (data && data.session && user) {
      await afterLogin(user, true);
      toast('Account created — you are logged in.', 'success');
    } else if (user) {
      if (errEl) errEl.textContent = 'Account created — please login.';
      const loginForm = $('#loginForm');
      const registerForm = $('#registerForm');
      if (loginForm) loginForm.hidden = false;
      if (registerForm) registerForm.hidden = true;
    } else {
      if (errEl) errEl.textContent = 'Account created — please login.';
    }
  });

  $('#logoutBtn')?.addEventListener('click', async () => {
    try { if (supabaseClient) await supabaseClient.auth.signOut(); } catch (e) {}
    location.reload();
  });
}

async function initAuth() {
  wireAuthUI();
  wireBuyPro();
  wireHelpCenter();
  wirePolicies();
  updateTokenBadgeFromAuth();
  applyConfig();
  if (!supabaseClient) { showAuthLoggedOut(); return; }
  let initialHandled = false;
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session && session.user) { await afterLogin(session.user, true); }
    else if (event === 'SIGNED_OUT') { showAuthLoggedOut(); }
    else if (event === 'INITIAL_SESSION' && session && session.user && !initialHandled) {
      initialHandled = true;
      await afterLogin(session.user, false);
    }
  });
  try {
    const { data } = await supabaseClient.auth.getSession();
    if (data && data.session && data.session.user && !initialHandled) {
      initialHandled = true;
      await afterLogin(data.session.user, false);
    } else if (!data || !data.session) {
      showAuthLoggedOut();
    }
  } catch (e) { showAuthLoggedOut(); }
}

// 10) BUY PRO
let selectedPlan = null;
let selectedMethod = null;

function planPrice(p) { return Number(p.price_pkr ?? p.price ?? p.amount_pkr ?? 0) || 0; }
function planName(p) { return p.name || p.title || p.id; }
function isCustomPlan(p) { return !!p.is_custom || /custom/i.test(planName(p)); }

function renderBuyProPlans(plans) {
  const wrap = $('#buyProPlans');
  if (!wrap) return;
  wrap.innerHTML = plans.map((p) => {
    const price = planPrice(p);
    const label = isCustomPlan(p) ? 'Custom — admin will confirm price' : ('Rs ' + price.toLocaleString());
    return `<button type="button" class="buy-plan-card${selectedPlan && selectedPlan.id === p.id ? ' active' : ''}" data-plan-id="${escapeHtml(String(p.id))}">
      <strong>${escapeHtml(planName(p))}</strong><span>${escapeHtml(label)}</span>
    </button>`;
  }).join('');
  $all('.buy-plan-card', wrap).forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedPlan = plans.find((p) => String(p.id) === btn.dataset.planId) || null;
      renderBuyProPlans(plans);
      updateBuyProDetails();
    });
  });
}

function renderBuyProMethods() {
  const wrap = $('#buyProMethods');
  if (!wrap) return;
  wrap.innerHTML = Object.entries(PAYMENT_ACCOUNTS).map(([key, acc]) => (
    `<button type="button" class="buy-method-btn${selectedMethod === key ? ' active' : ''}" data-method="${key}">${escapeHtml(acc.label)}</button>`
  )).join('');
  $all('.buy-method-btn', wrap).forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedMethod = btn.dataset.method;
      renderBuyProMethods();
      updateBuyProDetails();
    });
  });
}

function updateBuyProDetails() {
  const details = $('#buyProDetails');
  const form = $('#buyProForm');
  const success = $('#orderSuccess');
  if (success) success.hidden = true;
  if (!selectedPlan || !selectedMethod) {
    if (details) details.innerHTML = '';
    if (form) form.hidden = true;
    return;
  }
  const acc = PAYMENT_ACCOUNTS[selectedMethod];
  if (details && acc) {
    const price = planPrice(selectedPlan);
    const priceText = isCustomPlan(selectedPlan) ? 'Custom — admin will confirm price' : ('Rs ' + price.toLocaleString());
    const accountLine = acc.iban
      ? `<div>IBAN: <strong>${escapeHtml(acc.iban)}</strong></div>`
      : `<div>Number: <strong>${escapeHtml(acc.number || '')}</strong></div>`;
    details.innerHTML = `<div class="buy-pro-details"><strong>${escapeHtml(acc.label)}</strong>${accountLine}<div>Plan: <strong>${escapeHtml(planName(selectedPlan))}</strong> · ${escapeHtml(priceText)}</div><div>Pay first, then submit your name + payment screenshot below.</div></div>`;
  }
  if (form) form.hidden = false;
}

async function openBuyPro() {
  if (!requireSupabase()) return;
  selectedPlan = null;
  selectedMethod = null;
  const errEl = $('#orderError');
  if (errEl) errEl.textContent = '';
  const success = $('#orderSuccess');
  if (success) success.hidden = true;
  const form = $('#buyProForm');
  if (form) form.hidden = true;
  const details = $('#buyProDetails');
  if (details) details.innerHTML = '';
  openModal('#buyProModal');
  let plans = FALLBACK_PLANS;
  try {
    const { data, error } = await supabaseClient.from('plans').select('*').order('sort_order', { ascending: true });
    if (!error && Array.isArray(data) && data.length) plans = data;
  } catch (e) { /* fallback plans stay */ }
  renderBuyProPlans(plans);
  renderBuyProMethods();
}

async function submitBuyProOrder() {
  if (!requireSupabase()) return;
  const errEl = $('#orderError');
  const success = $('#orderSuccess');
  if (errEl) errEl.textContent = '';
  if (!currentUser) { if (errEl) errEl.textContent = 'Please login first.'; return; }
  if (!selectedPlan) { if (errEl) errEl.textContent = 'Please choose a plan.'; return; }
  if (!selectedMethod) { if (errEl) errEl.textContent = 'Please choose a payment method.'; return; }
  const payerName = $('#payerName') ? $('#payerName').value.trim() : '';
  if (!payerName) { if (errEl) errEl.textContent = 'Please enter the name you paid from.'; return; }
  const fileInput = $('#proofFile');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!file) { if (errEl) errEl.textContent = 'Please attach your payment screenshot.'; return; }
  const path = `${currentUser.id}/${Date.now()}-${file.name}`;
  try {
    const { error: upErr } = await supabaseClient.storage.from('payment-proofs').upload(path, file);
    if (upErr) throw upErr;
    const amount = isCustomPlan(selectedPlan) ? 0 : planPrice(selectedPlan);
    const { error: insErr } = await supabaseClient.from('payment_orders').insert({
      user_id: currentUser.id,
      plan_id: selectedPlan.id,
      amount_pkr: amount,
      method: selectedMethod,
      payer_name: payerName,
      screenshot_path: path,
    });
    if (insErr) throw insErr;
    const form = $('#buyProForm');
    if (form) form.hidden = true;
    if (success) {
      success.textContent = 'Order submitted! Pay first, then admin will activate Pro after verification.';
      success.hidden = false;
    }
    toast('Order submitted!', 'success');
  } catch (e) {
    if (errEl) errEl.textContent = (e && e.message) || 'Could not submit order. Please try again.';
  }
}

function wireBuyPro() {
  $('#buyProBtn')?.addEventListener('click', openBuyPro);
  $('#buyProClose')?.addEventListener('click', () => closeModal('#buyProModal'));
  $('#proofFile')?.addEventListener('change', (e) => {
    const nameEl = $('#proofFileName');
    const file = e.target.files && e.target.files[0];
    if (nameEl) nameEl.textContent = file ? file.name : '';
  });
  $('#submitOrderBtn')?.addEventListener('click', submitBuyProOrder);
}

// 11) HELP CENTER
async function loadHelpMessages() {
  const wrap = $('#helpReplies');
  if (!wrap) return;
  if (!supabaseClient || !currentUser) {
    wrap.innerHTML = '<div class="memory-item">Please login to view help messages.</div>';
    return;
  }
  try {
    const { data, error } = await supabaseClient.from('help_messages').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if (error) throw error;
    if (!data || !data.length) {
      wrap.innerHTML = '<div class="memory-item">No help messages yet.</div>';
      return;
    }
    wrap.innerHTML = data.map((h) => {
      const reply = h.admin_reply || h.reply || h.admin_response || '';
      return `<div class="help-item"><strong>${escapeHtml(h.subject || '')}</strong><span class="help-status">${escapeHtml(h.status || 'pending')}</span><p>${escapeHtml(h.message || '')}</p>${reply ? `<p class="help-reply"><strong>Admin:</strong> ${escapeHtml(reply)}</p>` : ''}</div>`;
    }).join('');
  } catch (e) {
    wrap.innerHTML = '<div class="memory-item">Could not load help messages.</div>';
  }
}

async function sendHelpMessage() {
  if (!requireSupabase()) return;
  const status = $('#helpStatus');
  if (status) status.textContent = '';
  if (!currentUser) { if (status) status.textContent = 'Please login first.'; return; }
  const subject = $('#helpSubject') ? $('#helpSubject').value.trim() : '';
  const message = $('#helpMessage') ? $('#helpMessage').value.trim() : '';
  if (!subject || !message) { if (status) status.textContent = 'Please enter a subject and a message.'; return; }
  try {
    const { error } = await supabaseClient.from('help_messages').insert({ user_id: currentUser.id, subject, message });
    if (error) throw error;
    if ($('#helpSubject')) $('#helpSubject').value = '';
    if ($('#helpMessage')) $('#helpMessage').value = '';
    if (status) status.textContent = 'Message sent — admin will reply here.';
    await loadHelpMessages();
  } catch (e) {
    if (status) status.textContent = (e && e.message) || 'Could not send message.';
  }
}

function wireHelpCenter() {
  $('#helpBtn')?.addEventListener('click', () => { openModal('#helpModal'); loadHelpMessages(); });
  $('#helpClose')?.addEventListener('click', () => closeModal('#helpModal'));
  $('#helpSendBtn')?.addEventListener('click', sendHelpMessage);
}

// 12) POLICIES
async function openPolicy(file, title) {
  const titleEl = $('#policyModalTitle');
  const bodyEl = $('#policyModalBody');
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = 'Loading…';
  openModal('#policyModal');
  try {
    const r = await fetch('policies/' + file);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    if (bodyEl) bodyEl.innerHTML = html;
  } catch (e) {
    if (bodyEl) bodyEl.textContent = 'Policy file could not be loaded.';
  }
}

function wirePolicies() {
  $('#policyPrivacyLink')?.addEventListener('click', (e) => { e.preventDefault(); openPolicy('privacy-policy.html', 'Privacy Policy'); });
  $('#authPrivacyLink')?.addEventListener('click', (e) => { e.preventDefault(); openPolicy('privacy-policy.html', 'Privacy Policy'); });
  $('#policyPaymentLink')?.addEventListener('click', (e) => { e.preventDefault(); openPolicy('payment-privacy-policy.html', 'Payment Privacy Policy'); });
  $('#policyTermsLink')?.addEventListener('click', (e) => { e.preventDefault(); openPolicy('terms-conditions.html', 'Terms & Conditions'); });
  $('#authTermsLink')?.addEventListener('click', (e) => { e.preventDefault(); openPolicy('terms-conditions.html', 'Terms & Conditions'); });
  $('#policyModalClose')?.addEventListener('click', () => closeModal('#policyModal'));
}

document.addEventListener('click', (e) => {
  const c = e.target.closest && e.target.closest('.hero-chip');
  if (!c) return;
  const ui = $('#userInput'); if (!ui) return;
  try { setMode(c.dataset.mode === 'image' ? 'image' : 'chat', true); } catch (x) {}
  ui.value = c.dataset.prompt || '';
  syncSendBtnMode();
  handleSend();
});
(function rotatePlaceholder() {
  const tips = ['Ask Me Anything...', 'Try: Write a poem', 'Try: Explain this code', 'Try: A 7-day study plan', 'Try: Translate to Urdu'];
  let i = 0;
  setInterval(() => {
    const ui = $('#userInput');
    if (!ui || document.activeElement === ui || ui.value || state.mode !== 'chat' || state.generating) return;
    i = (i + 1) % tips.length; ui.placeholder = tips[i];
  }, 3500);
})();

/* ---- App install bar ---- */
(function installBar() {
  const bar = $('#installBar'); if (!bar) return;
  const KEY = 'badshahai_install_bar_hidden';
  const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} } };
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const hiddenAt = Number(store.get() || 0);
  if (standalone || (hiddenAt && Date.now() - hiddenAt < 3 * 24 * 3600 * 1000)) { bar.classList.add('is-hidden'); }
  else { requestAnimationFrame(() => bar.classList.add('show')); }
  if (isIOS) {
    const apk = $('#apkDownloadBtn'); if (apk) { apk.removeAttribute('href'); apk.removeAttribute('download'); apk.querySelector('span').textContent = 'Add to Home Screen'; apk.addEventListener('click', (e) => { e.preventDefault(); openModal('#installGuideModal'); }); }
    const sub = $('#ibSub'); if (sub) sub.innerHTML = '<i class="fa-solid fa-infinity"></i> Free &amp; Unlimited &bull; <i class="fa-brands fa-apple"></i> Works on iPhone';
  } else if (!isAndroid) {
    const sub = $('#ibSub'); if (sub) sub.innerHTML = '<i class="fa-solid fa-infinity"></i> Free &amp; Unlimited &bull; <i class="fa-brands fa-android"></i> Android app &bull; 3.2 MB';
  }
  $('#installClose')?.addEventListener('click', () => { bar.classList.remove('show'); setTimeout(() => bar.classList.add('is-hidden'), 400); store.set(String(Date.now())); });
  $('#installHowBtn')?.addEventListener('click', () => openModal('#installGuideModal'));
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; const b = $('#pwaInstallBtn'); if (b) b.hidden = false; });
  $('#pwaInstallBtn')?.addEventListener('click', async () => {
    if (!deferred) return openModal('#installGuideModal');
    deferred.prompt(); try { await deferred.userChoice; } catch (e) {} deferred = null; const b = $('#pwaInstallBtn'); if (b) b.hidden = true;
  });
  window.addEventListener('appinstalled', () => { bar.classList.remove('show'); setTimeout(() => bar.classList.add('is-hidden'), 400); });
  const apkLinks = $all('a[href$="Badshah222-ai.apk"]');
  apkLinks.forEach(a => a.addEventListener('click', () => { if (!isIOS) { toast('Downloading BADSHAH AI app...', 'success'); if (!a.closest('#installGuideModal')) setTimeout(() => openModal('#installGuideModal'), 900); } }));
})();

(async function boot() {
  await clearLegacyClientStorage();
  await loadSettings();
  await loadUsage();
  await loadChats();
  await initAuth();
  const activeChat = getActiveChat();
  setMode((activeChat && activeChat.mode) || 'chat', false);
})();
