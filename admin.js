// BADSHAH AI — Admin Panel logic (admin.js)
// All admin work goes through Supabase (RLS-checked queries + SECURITY
// DEFINER RPCs). No API keys or passwords are stored or written here.
// The Supabase client is created the same way as the main app: the
// supabase-js CDN plus supabase-config.js, which exposes
// window.SUPABASE_URL and window.SUPABASE_ANON_KEY (placeholders only
// until the real project values are filled in).
'use strict';

// ---------------------------------------------------------------------------
// Client setup
// ---------------------------------------------------------------------------

// True when a value looks like a real configured value rather than a
// placeholder such as "YOUR_SUPABASE_URL".
function isConfiguredValue(value) {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  return !/YOUR_|PASTE_|REPLACE|PLACEHOLDER|EXAMPLE/i.test(v);
}

let supabaseClient = null;
if (
  typeof window !== 'undefined' &&
  window.supabase &&
  typeof window.supabase.createClient === 'function' &&
  isConfiguredValue(window.SUPABASE_URL) &&
  isConfiguredValue(window.SUPABASE_ANON_KEY)
) {
  supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

let toastTimer = null;
function toast(msg) {
  const box = el('adminToast');
  if (!box) return;
  box.textContent = msg;
  box.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    box.style.display = 'none';
  }, 4000);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setStatus(id, msg, ok) {
  const node = el(id);
  if (!node) return;
  node.textContent = msg || '';
  node.classList.remove('ok', 'err');
  if (msg) node.classList.add(ok === false ? 'err' : 'ok');
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRs(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 'Rs —';
  return 'Rs ' + n.toLocaleString('en-PK');
}

// ---------------------------------------------------------------------------
// Constants / state
// ---------------------------------------------------------------------------

// All 12 models the app offers (chat + image), used for the settings toggles.
const MODELS = [
  { id: 'groq-gpt-oss-120b', kind: 'chat' },
  { id: 'gpt-3-5', kind: 'chat' },
  { id: 'pollinations-text', kind: 'chat' },
  { id: 'fusion-synth', kind: 'chat' },
  { id: 'fusion-vortex', kind: 'chat' },
  { id: 'fusion-abyss', kind: 'chat' },
  { id: 'fusion-shadow', kind: 'chat' },
  { id: 'fusion-reaper', kind: 'chat' },
  { id: 'fusion-dread', kind: 'chat' },
  { id: 'fusion-void', kind: 'chat' },
  { id: 'pollinations-image', kind: 'image' },
  { id: 'stable-diffusion', kind: 'image' },
  { id: 'fusion-astra', kind: 'image' }
];

const SETTING_KEYS = [
  'maintenance',
  'models',
  'apk_url',
  'payment_accounts',
  'custom_plan',
  'support_contact',
  'safety_filter',
  'site_name'
];

let currentUserId = null;
let plansCache = []; // rows from plans
let usersCache = []; // rows from profiles
let ordersCache = []; // rows from payment_orders
let helpCache = []; // rows from help_messages
let profilesById = {}; // id -> { email, display_name }
let ordersFilter = 'all';
let settingsLoaded = false;
let usersLoaded = false;
let ordersLoaded = false;
let helpLoaded = false;

// ---------------------------------------------------------------------------
// Guard / auth
// ---------------------------------------------------------------------------

function showGuard(message) {
  const guard = el('adminGuard');
  const text = el('adminGuardText');
  if (text && message) text.textContent = message;
  if (guard) guard.style.display = 'block';
  const panels = el('adminPanels');
  if (panels) panels.style.display = 'none';
}

function showPanels() {
  const guard = el('adminGuard');
  if (guard) guard.style.display = 'none';
  const panels = el('adminPanels');
  if (panels) panels.style.display = 'block';
}

async function loadPlans() {
  if (plansCache.length) return plansCache;
  const { data, error } = await supabaseClient
    .from('plans')
    .select('id, name, months, price_pkr, token_limit, is_custom, sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  plansCache = data || [];
  return plansCache;
}

function planName(planId) {
  const plan = plansCache.find(function (p) { return p.id === planId; });
  return plan ? plan.name : (planId || 'Free');
}

async function initAdmin() {
  if (!supabaseClient) {
    showGuard('Supabase is not configured yet.');
    return;
  }

  const { data: sessionData, error: sessionError } =
    await supabaseClient.auth.getSession();
  if (sessionError) {
    showGuard('Could not check your login. Please login from the main app as an admin.');
    return;
  }
  const user = sessionData && sessionData.session && sessionData.session.user;
  if (!user) {
    showGuard('Please login from the main app as an admin.');
    return;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('id, email, display_name, is_admin, is_pro, plan_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_admin) {
    showGuard('You are not an admin.');
    return;
  }

  currentUserId = user.id;
  showPanels();
  await loadDashboard();
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function switchTab(name) {
  document.querySelectorAll('nav.tab-bar button').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('.admin-panel').forEach(function (panel) {
    panel.classList.toggle('active', panel.id === 'tab-' + name);
  });

  // Lazy-load each tab's data the first time it is opened.
  if (name === 'dashboard') loadDashboard().catch(handleLoadError);
  if (name === 'users' && !usersLoaded) loadUsers().catch(handleLoadError);
  if (name === 'orders' && !ordersLoaded) loadOrders().catch(handleLoadError);
  if (name === 'help' && !helpLoaded) loadHelp().catch(handleLoadError);
  if (name === 'settings' && !settingsLoaded) loadSettings().catch(handleLoadError);
}

function handleLoadError(err) {
  console.error(err);
  toast(err && err.message ? err.message : 'Something went wrong.');
}

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------

async function loadDashboard() {
  // Total users
  const usersCount = await supabaseClient
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  if (usersCount.error) throw usersCount.error;
  el('statUsers').textContent = usersCount.count != null ? usersCount.count : '—';

  // Pro users
  const proCount = await supabaseClient
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_pro', true);
  if (proCount.error) throw proCount.error;
  el('statPro').textContent = proCount.count != null ? proCount.count : '—';

  // Pending orders
  const pendingCount = await supabaseClient
    .from('payment_orders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (pendingCount.error) throw pendingCount.error;
  el('statPending').textContent = pendingCount.count != null ? pendingCount.count : '—';

  // Revenue: sum of approved order amounts, computed client-side.
  const approved = await supabaseClient
    .from('payment_orders')
    .select('amount_pkr')
    .eq('status', 'approved');
  if (approved.error) throw approved.error;
  const revenue = (approved.data || []).reduce(function (sum, row) {
    return sum + (Number(row.amount_pkr) || 0);
  }, 0);
  el('statRevenue').textContent = formatRs(revenue);

  // Recent logins (latest 10), with the user's email resolved from profiles.
  const logins = await supabaseClient
    .from('login_history')
    .select('user_id, ip, device, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  if (logins.error) throw logins.error;

  const rows = logins.data || [];
  const userIds = Array.from(new Set(rows.map(function (r) { return r.user_id; })));
  if (userIds.length) {
    const { data: users, error: usersError } = await supabaseClient
      .from('profiles')
      .select('id, email, display_name')
      .in('id', userIds);
    if (!usersError && users) {
      users.forEach(function (u) { profilesById[u.id] = u; });
    }
  }

  const list = el('recentLogins');
  if (!rows.length) {
    list.innerHTML = '<li class="empty">No logins recorded yet.</li>';
    return;
  }
  list.innerHTML = rows.map(function (row) {
    const user = profilesById[row.user_id] || {};
    const who = user.email || user.display_name || row.user_id;
    return '<li><span>' + escapeHtml(who) + '</span>' +
      '<span class="meta">' + escapeHtml(row.ip || '—') +
      ' · ' + escapeHtml(row.device || '—') +
      ' · ' + escapeHtml(fmtDateTime(row.created_at)) + '</span></li>';
  }).join('');
}

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------

async function loadUsers() {
  const tbody = el('usersTableBody');
  tbody.innerHTML = '<tr><td colspan="8" class="muted">Loading…</td></tr>';

  await loadPlans();

  const { data: profiles, error } = await supabaseClient
    .from('profiles')
    .select('id, email, display_name, is_admin, is_pro, plan_id, pro_expires_at, created_at, last_ip, last_device')
    .order('created_at', { ascending: false });
  if (error) throw error;
  usersCache = profiles || [];

  // One extra query for the latest login per user: rows are newest first,
  // so the first row seen for a user id is that user's latest login.
  const lastLoginByUser = {};
  const { data: logins, error: loginsError } = await supabaseClient
    .from('login_history')
    .select('user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (!loginsError && logins) {
    logins.forEach(function (row) {
      if (!lastLoginByUser[row.user_id]) lastLoginByUser[row.user_id] = row.created_at;
    });
  }
  usersCache.forEach(function (u) {
    u._lastLogin = lastLoginByUser[u.id] || null;
  });

  usersLoaded = true;
  renderUsers();
}

function renderUsers() {
  const query = (el('userSearch').value || '').trim().toLowerCase();
  const tbody = el('usersTableBody');

  const filtered = usersCache.filter(function (u) {
    if (!query) return true;
    return (u.email || '').toLowerCase().includes(query) ||
      (u.display_name || '').toLowerCase().includes(query);
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="muted">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function (u) {
    const adminBtn = u.is_admin
      ? '<button type="button" class="btn-small" data-action="remove-admin" data-id="' + escapeHtml(u.id) + '">Remove Admin</button>'
      : '<button type="button" class="btn-small" data-action="make-admin" data-id="' + escapeHtml(u.id) + '">Make Admin</button>';

    return '<tr>' +
      '<td>' + escapeHtml(u.display_name || '—') +
        (u.is_admin ? ' <span class="badge badge-admin">Admin</span>' : '') + '</td>' +
      '<td>' + escapeHtml(u.email || '—') + '</td>' +
      '<td>' + (u.is_pro
        ? '<span class="badge badge-pro">' + escapeHtml(planName(u.plan_id)) + '</span>'
        : '<span class="badge badge-free">Free</span>') + '</td>' +
      '<td>' + escapeHtml(u.is_pro ? fmtDate(u.pro_expires_at) : '—') + '</td>' +
      '<td>' + escapeHtml(u.last_ip || '—') + '</td>' +
      '<td>' + escapeHtml(u.last_device || '—') + '</td>' +
      '<td>' + escapeHtml(fmtDateTime(u._lastLogin)) + '</td>' +
      '<td><div class="row-actions">' +
        '<button type="button" class="btn-small btn-gold" data-action="grant-pro" data-id="' + escapeHtml(u.id) + '">Grant Pro</button>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<button type="button" class="btn-small" data-action="revoke-pro" data-id="' + escapeHtml(u.id) + '">Revoke Pro</button>' +
          '<button type="button" class="btn-small" data-action="edit-expiry" data-id="' + escapeHtml(u.id) + '">Edit Expiry</button>' +
        '</div>' +
        adminBtn +
      '</div></td>' +
    '</tr>';
  }).join('');
}

async function reloadUsers(message) {
  usersLoaded = false;
  try {
    await loadUsers();
    if (message) {
      setStatus('usersStatus', message, true);
      toast(message);
    }
  } catch (err) {
    console.error(err);
    setStatus('usersStatus', err.message || 'Failed to reload users.', false);
  }
}

// User row actions (event delegation on the table body).
async function handleUserAction(action, userId, button) {
  const user = usersCache.find(function (u) { return u.id === userId; });
  const who = user ? (user.email || user.display_name || userId) : userId;

  if (action === 'grant-pro') {
    openGrantProModal(userId, 'grant');
    return;
  }

  if (action === 'revoke-pro') {
    if (!window.confirm('Revoke Pro from ' + who + '?')) return;
    button.disabled = true;
    const { error } = await supabaseClient.rpc('revoke_pro', { p_user_id: userId });
    button.disabled = false;
    if (error) { setStatus('usersStatus', error.message, false); return; }
    await reloadUsers('Pro revoked from ' + who + '.');
  }

  if (action === 'make-admin' || action === 'remove-admin') {
    const makeAdmin = action === 'make-admin';
    // Never allow demoting yourself — you would lock yourself out.
    if (!makeAdmin && userId === currentUserId) {
      toast('You cannot remove your own admin rights.');
      setStatus('usersStatus', 'You cannot remove your own admin rights.', false);
      return;
    }
    if (!window.confirm((makeAdmin ? 'Make ' : 'Remove admin rights from ') + who + '?')) return;
    button.disabled = true;
    const { error } = await supabaseClient.rpc('set_admin_status', {
      p_user_id: userId,
      p_is_admin: makeAdmin
    });
    button.disabled = false;
    if (error) { setStatus('usersStatus', error.message, false); return; }
    await reloadUsers(makeAdmin ? who + ' is now an admin.' : 'Admin rights removed from ' + who + '.');
  }

  if (action === 'edit-expiry') {
    openGrantProModal(userId, 'expiry');
    return;
  }
}

// ---------------------------------------------------------------------------
// GRANT PRO MODAL — any selected duration
// ---------------------------------------------------------------------------

let grantTargetUserId = null;
let grantModalMode = 'grant'; // 'grant' | 'expiry'

function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(date, n) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

// Base time for a new grant: the user's current expiry when it is still
// in the future and "add on top" is checked, otherwise now.
function grantBaseDate() {
  const user = usersCache.find(function (u) { return u.id === grantTargetUserId; });
  const extend = el('grantExtend') && el('grantExtend').checked;
  if (extend && user && user.pro_expires_at) {
    const current = new Date(user.pro_expires_at);
    if (!Number.isNaN(current.getTime()) && current.getTime() > Date.now()) return current;
  }
  return new Date();
}

function grantSelectedMode() {
  const checked = document.querySelector('input[name="grantMode"]:checked');
  return checked ? checked.value : 'preset';
}

function updateGrantPreview() {
  const preview = el('grantPreview');
  if (!preview) return;
  preview.classList.remove('err');

  if (grantModalMode === 'expiry') {
    const value = el('grantEndDate').value;
    if (!value) { preview.textContent = 'Pick an end date for this user\'s Pro.'; return; }
    const end = new Date(value + 'T23:59:59');
    if (Number.isNaN(end.getTime())) { preview.textContent = 'Invalid date.'; preview.classList.add('err'); return; }
    preview.textContent = end.getTime() > Date.now()
      ? 'Pro will stay active until ' + fmtDateTime(end.toISOString()) + '.'
      : 'This date is in the past — Pro will be turned off.';
    return;
  }

  const mode = grantSelectedMode();
  if (mode === 'preset') {
    const plan = plansCache.find(function (p) { return p.id === el('grantPlanSelect').value; });
    if (!plan) { preview.textContent = 'Pick a plan.'; return; }
    const months = Number(plan.months) || 1;
    preview.textContent = 'Pro will be active until ' +
      fmtDateTime(addMonths(grantBaseDate(), months).toISOString()) + ' (' + plan.name + ').';
  } else if (mode === 'custom') {
    const amount = parseInt(el('grantCustomAmount').value, 10);
    const unit = el('grantCustomUnit').value;
    if (!Number.isFinite(amount) || amount < 1) {
      preview.textContent = 'Enter a duration of 1 or more.'; preview.classList.add('err'); return;
    }
    const expiry = unit === 'days' ? addDays(grantBaseDate(), amount) : addMonths(grantBaseDate(), amount);
    preview.textContent = 'Pro will be active until ' + fmtDateTime(expiry.toISOString()) +
      ' (' + amount + ' ' + unit + ').';
  } else {
    const value = el('grantEndDate').value;
    if (!value) { preview.textContent = 'Pick an end date for this user\'s Pro.'; return; }
    const end = new Date(value + 'T23:59:59');
    if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
      preview.textContent = 'Pick a future date.'; preview.classList.add('err'); return;
    }
    preview.textContent = 'Pro will be active until ' + fmtDateTime(end.toISOString()) + '.';
  }
}

function openGrantProModal(userId, mode) {
  const user = usersCache.find(function (u) { return u.id === userId; });
  if (!user) { toast('User not found.'); return; }
  grantTargetUserId = userId;
  grantModalMode = mode || 'grant';

  const box = document.querySelector('.grant-modal-box');
  const title = el('grantProTitle');
  const who = user.email || user.display_name || userId;
  el('grantProUser').textContent = who +
    (user.is_pro && user.pro_expires_at ? ' · currently Pro until ' + fmtDate(user.pro_expires_at) : ' · currently Free');

  // Populate the plan select from the plans cache.
  const select = el('grantPlanSelect');
  select.innerHTML = plansCache.map(function (p) {
    return '<option value="' + escapeHtml(p.id) + '">' +
      escapeHtml(p.name) + ' — ' + formatRs(p.price_pkr) + '</option>';
  }).join('');
  if (user.plan_id) select.value = user.plan_id;

  if (grantModalMode === 'expiry') {
    if (title) title.textContent = 'Set Pro expiry';
    if (box) box.classList.add('mode-expiry');
    el('grantProConfirm').textContent = 'Save expiry';
    el('grantProClear').hidden = false;
    el('grantOptPreset').hidden = true;
    el('grantOptCustom').hidden = true;
    el('grantOptEnddate').hidden = false;
    el('grantEndDate').value = user.pro_expires_at ? user.pro_expires_at.slice(0, 10) : '';
  } else {
    if (title) title.textContent = 'Grant Pro';
    if (box) box.classList.remove('mode-expiry');
    el('grantProConfirm').textContent = 'Grant Pro';
    el('grantProClear').hidden = true;
    const preset = document.querySelector('input[name="grantMode"][value="preset"]');
    if (preset) preset.checked = true;
    syncGrantModeVisibility();
    el('grantEndDate').value = '';
  }

  setStatus('grantProStatus', '');
  el('grantProModal').hidden = false;
  updateGrantPreview();
}

function closeGrantProModal() {
  el('grantProModal').hidden = true;
  grantTargetUserId = null;
  setStatus('grantProStatus', '');
}

function syncGrantModeVisibility() {
  const mode = grantSelectedMode();
  el('grantOptPreset').hidden = mode !== 'preset';
  el('grantOptCustom').hidden = mode !== 'custom';
  el('grantOptEnddate').hidden = mode !== 'enddate';
  updateGrantPreview();
}

async function confirmGrantPro() {
  const user = usersCache.find(function (u) { return u.id === grantTargetUserId; });
  const who = user ? (user.email || user.display_name || grantTargetUserId) : grantTargetUserId;
  const confirmBtn = el('grantProConfirm');
  const statusEl = 'grantProStatus';

  // Expiry mode: set the exact end date via set_pro_expiry.
  if (grantModalMode === 'expiry') {
    const value = el('grantEndDate').value;
    if (!value) { setStatus(statusEl, 'Pick an end date first.', false); return; }
    const end = new Date(value + 'T23:59:59');
    if (Number.isNaN(end.getTime())) { setStatus(statusEl, 'Invalid date.', false); return; }
    confirmBtn.disabled = true;
    const { error } = await supabaseClient.rpc('set_pro_expiry', {
      p_user_id: grantTargetUserId,
      p_expires_at: end.toISOString()
    });
    confirmBtn.disabled = false;
    if (error) { setStatus(statusEl, error.message, false); return; }
    closeGrantProModal();
    await reloadUsers('Pro expiry set for ' + who + ' to ' + value + '.');
    return;
  }

  // Grant mode: preset / custom / end-date.
  const mode = grantSelectedMode();
  const extend = el('grantExtend') ? el('grantExtend').checked : true;
  const params = { p_user_id: grantTargetUserId, p_extend: extend };

  if (mode === 'preset') {
    params.p_plan_id = el('grantPlanSelect').value;
    if (!params.p_plan_id) { setStatus(statusEl, 'Pick a plan first.', false); return; }
  } else if (mode === 'custom') {
    const amount = parseInt(el('grantCustomAmount').value, 10);
    const unit = el('grantCustomUnit').value;
    if (!Number.isFinite(amount) || amount < 1) {
      setStatus(statusEl, 'Enter a duration of 1 or more.', false); return;
    }
    params.p_plan_id = 'plan-custom';
    if (unit === 'days') params.p_days = amount;
    else params.p_months = amount;
  } else {
    const value = el('grantEndDate').value;
    if (!value) { setStatus(statusEl, 'Pick an end date first.', false); return; }
    const end = new Date(value + 'T23:59:59');
    if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
      setStatus(statusEl, 'Pick a future date.', false); return;
    }
    params.p_expires_at = end.toISOString();
    params.p_extend = false; // an explicit end date is absolute
  }

  confirmBtn.disabled = true;
  const { data, error } = await supabaseClient.rpc('grant_pro', params);
  confirmBtn.disabled = false;
  if (error) { setStatus(statusEl, error.message, false); return; }
  const expires = data && data.expires_at ? fmtDate(data.expires_at) : '';
  closeGrantProModal();
  await reloadUsers('Pro granted to ' + who + (expires ? ' until ' + expires : '') + '.');
}

async function clearProFromModal() {
  const user = usersCache.find(function (u) { return u.id === grantTargetUserId; });
  const who = user ? (user.email || user.display_name || grantTargetUserId) : grantTargetUserId;
  if (!window.confirm('Clear Pro from ' + who + '?')) return;
  const { error } = await supabaseClient.rpc('set_pro_expiry', {
    p_user_id: grantTargetUserId,
    p_expires_at: null
  });
  if (error) { setStatus('grantProStatus', error.message, false); return; }
  closeGrantProModal();
  await reloadUsers('Pro cleared from ' + who + '.');
}

// ---------------------------------------------------------------------------
// PAYMENT ORDERS
// ---------------------------------------------------------------------------

async function loadOrders() {
  const list = el('ordersList');
  list.innerHTML = '<p class="empty">Loading…</p>';

  await loadPlans();

  const { data: orders, error } = await supabaseClient
    .from('payment_orders')
    .select('id, user_id, plan_id, amount_pkr, method, payer_name, screenshot_path, status, admin_note, created_at, reviewed_at, reviewed_by')
    .order('created_at', { ascending: false });
  if (error) throw error;
  ordersCache = orders || [];

  // Resolve user emails (single query) for the orders list.
  const userIds = Array.from(new Set(ordersCache.map(function (o) { return o.user_id; })));
  if (userIds.length) {
    const { data: users, error: usersError } = await supabaseClient
      .from('profiles')
      .select('id, email, display_name')
      .in('id', userIds);
    if (!usersError && users) {
      users.forEach(function (u) { profilesById[u.id] = u; });
    }
  }

  // Signed URLs for payment-proof screenshots (1 hour), fetched up front
  // so every thumbnail renders together.
  await Promise.all(ordersCache.map(async function (order) {
    order._proofUrl = null;
    if (!order.screenshot_path) return;
    const { data, error: urlError } = await supabaseClient
      .storage
      .from('payment-proofs')
      .createSignedUrl(order.screenshot_path, 3600);
    if (!urlError && data) order._proofUrl = data.signedUrl;
  }));

  ordersLoaded = true;
  renderOrders();
}

function renderOrders() {
  const list = el('ordersList');
  const filtered = ordersCache.filter(function (o) {
    return ordersFilter === 'all' || o.status === ordersFilter;
  });

  if (!filtered.length) {
    list.innerHTML = '<p class="empty">No ' +
      (ordersFilter === 'all' ? '' : escapeHtml(ordersFilter) + ' ') +
      'orders found.</p>';
    return;
  }

  list.innerHTML = filtered.map(function (o) {
    const user = profilesById[o.user_id] || {};
    const who = user.email || user.display_name || o.user_id;
    const badgeClass = o.status === 'approved' ? 'badge-approved'
      : o.status === 'rejected' ? 'badge-rejected' : 'badge-pending';

    let proofHtml = '';
    if (o.screenshot_path) {
      proofHtml = o._proofUrl
        ? '<a href="' + escapeHtml(o._proofUrl) + '" target="_blank" rel="noopener">' +
          '<img class="proof-thumb" src="' + escapeHtml(o._proofUrl) + '" alt="Payment proof screenshot"></a>'
        : '<p class="meta">Payment proof: ' + escapeHtml(o.screenshot_path) + ' (preview unavailable)</p>';
    }

    const noteHtml = o.admin_note
      ? '<p class="meta">Admin note: ' + escapeHtml(o.admin_note) + '</p>'
      : '';

    const actionsHtml = o.status === 'pending'
      ? '<div class="actions">' +
          '<button type="button" class="btn-small btn-gold" data-action="approve-order" data-id="' + escapeHtml(o.id) + '">Approve</button>' +
          '<button type="button" class="btn-small btn-danger" data-action="reject-order" data-id="' + escapeHtml(o.id) + '">Reject</button>' +
        '</div>'
      : '';

    return '<article class="order-item">' +
      '<div class="head"><b>' + escapeHtml(planName(o.plan_id)) + ' — ' + formatRs(o.amount_pkr) + '</b>' +
      '<span class="badge ' + badgeClass + '">' + escapeHtml(o.status) + '</span></div>' +
      '<p>' + escapeHtml(who) + '</p>' +
      '<p class="meta">Method: ' + escapeHtml(o.method || '—') +
      ' · Payer: ' + escapeHtml(o.payer_name || '—') +
      ' · ' + escapeHtml(fmtDateTime(o.created_at)) + '</p>' +
      noteHtml + proofHtml + actionsHtml +
    '</article>';
  }).join('');
}

async function reloadOrders(message) {
  ordersLoaded = false;
  try {
    await loadOrders();
    if (message) {
      setStatus('ordersStatus', message, true);
      toast(message);
    }
  } catch (err) {
    console.error(err);
    setStatus('ordersStatus', err.message || 'Failed to reload orders.', false);
  }
}

async function handleOrderAction(action, orderId, button) {
  if (action === 'approve-order') {
    button.disabled = true;
    const { error } = await supabaseClient.rpc('approve_payment_order', {
      p_order_id: orderId
    });
    button.disabled = false;
    if (error) { setStatus('ordersStatus', error.message, false); return; }
    await reloadOrders('Order approved — Pro activated.');
    loadDashboard().catch(handleLoadError);
  }

  if (action === 'reject-order') {
    const note = window.prompt('Reason for rejecting this order (shown to the user):', '');
    if (note === null) return; // cancelled
    button.disabled = true;
    const { error } = await supabaseClient.rpc('reject_payment_order', {
      p_order_id: orderId,
      p_note: note.trim()
    });
    button.disabled = false;
    if (error) { setStatus('ordersStatus', error.message, false); return; }
    await reloadOrders('Order rejected.');
  }
}

// ---------------------------------------------------------------------------
// HELP MESSAGES
// ---------------------------------------------------------------------------

async function loadHelp() {
  const list = el('helpList');
  list.innerHTML = '<p class="empty">Loading…</p>';

  const { data: messages, error } = await supabaseClient
    .from('help_messages')
    .select('id, user_id, subject, message, reply, status, created_at, replied_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  helpCache = messages || [];

  const userIds = Array.from(new Set(helpCache.map(function (m) { return m.user_id; })));
  if (userIds.length) {
    const { data: users, error: usersError } = await supabaseClient
      .from('profiles')
      .select('id, email, display_name')
      .in('id', userIds);
    if (!usersError && users) {
      users.forEach(function (u) { profilesById[u.id] = u; });
    }
  }

  helpLoaded = true;
  renderHelp();
}

function renderHelp() {
  const list = el('helpList');
  if (!helpCache.length) {
    list.innerHTML = '<p class="empty">No help messages yet.</p>';
    return;
  }

  list.innerHTML = helpCache.map(function (m) {
    const user = profilesById[m.user_id] || {};
    const who = user.email || user.display_name || m.user_id;
    const badgeClass = m.status === 'replied' ? 'badge-replied' : 'badge-open';

    const replyHtml = m.reply
      ? '<div class="existing-reply"><b>Your reply:</b> ' + escapeHtml(m.reply) + '</div>'
      : '';

    const replyBoxHtml = m.status === 'open'
      ? '<div class="reply-box">' +
          '<textarea data-reply-for="' + escapeHtml(m.id) + '" placeholder="Write your reply…" aria-label="Reply text"></textarea>' +
          '<div class="actions">' +
            '<button type="button" class="btn-small btn-gold" data-action="reply-help" data-id="' + escapeHtml(m.id) + '">Reply</button>' +
          '</div>' +
        '</div>'
      : '';

    return '<article class="help-item">' +
      '<div class="head"><b>' + escapeHtml(m.subject || '(no subject)') + '</b>' +
      '<span class="badge ' + badgeClass + '">' + escapeHtml(m.status) + '</span></div>' +
      '<p class="meta">' + escapeHtml(who) + ' · ' + escapeHtml(fmtDateTime(m.created_at)) + '</p>' +
      '<p>' + escapeHtml(m.message || '') + '</p>' +
      replyHtml + replyBoxHtml +
    '</article>';
  }).join('');
}

async function handleHelpReply(messageId, button) {
  const textarea = document.querySelector('textarea[data-reply-for="' + CSS.escape(messageId) + '"]');
  const text = textarea ? textarea.value.trim() : '';
  if (!text) {
    setStatus('helpStatus', 'Write a reply first.', false);
    return;
  }
  button.disabled = true;
  const { error } = await supabaseClient
    .from('help_messages')
    .update({
      reply: text,
      status: 'replied',
      replied_at: new Date().toISOString()
    })
    .eq('id', messageId);
  button.disabled = false;
  if (error) { setStatus('helpStatus', error.message, false); return; }
  helpLoaded = false;
  try {
    await loadHelp();
    setStatus('helpStatus', 'Reply sent.', true);
    toast('Reply sent.');
  } catch (err) {
    console.error(err);
    setStatus('helpStatus', err.message || 'Failed to reload help messages.', false);
  }
}

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------

async function upsertSetting(key, value) {
  const { error } = await supabaseClient
    .from('admin_settings')
    .upsert({ key: key, value: value }, { onConflict: 'key' });
  if (error) throw error;
}

async function loadSettings() {
  const { data, error } = await supabaseClient
    .from('admin_settings')
    .select('key, value')
    .in('key', SETTING_KEYS);
  if (error) throw error;

  const settings = {};
  (data || []).forEach(function (row) { settings[row.key] = row.value; });

  // Maintenance toggle
  el('setMaintenance').checked = Boolean(settings.maintenance && settings.maintenance.on);

  // Model toggles: checked = enabled (not in the disabled list).
  const disabled = (settings.models && Array.isArray(settings.models.disabled))
    ? settings.models.disabled
    : [];
  renderModelToggles(disabled);

  // APK URL
  el('setApkUrl').value = (settings.apk_url && settings.apk_url.url) || '';

  // Payment accounts (defaults match the seeded values; the inputs in
  // admin.html already carry them, so only overwrite when a row exists).
  if (settings.payment_accounts) {
    const pa = settings.payment_accounts;
    if (pa.easypaisa) el('setEasypaisa').value = pa.easypaisa;
    if (pa.jazzcash) el('setJazzcash').value = pa.jazzcash;
    if (pa.nayapay) el('setNayapay').value = pa.nayapay;
    if (pa.bank_name) el('setBankName').value = pa.bank_name;
    if (pa.iban) el('setIban').value = pa.iban;
  }

  // Custom plan: prefer the plans row (source of truth for pricing),
  // fall back to the admin_settings custom_plan row.
  let months = settings.custom_plan ? settings.custom_plan.months : null;
  let price = settings.custom_plan ? settings.custom_plan.price_pkr : null;
  try {
    const { data: customPlan, error: planError } = await supabaseClient
      .from('plans')
      .select('months, price_pkr')
      .eq('id', 'plan-custom')
      .maybeSingle();
    if (!planError && customPlan) {
      if (customPlan.months != null) months = customPlan.months;
      if (customPlan.price_pkr != null) price = customPlan.price_pkr;
    }
  } catch (err) {
    console.error(err);
  }
  if (months != null) el('setCustomMonths').value = months;
  if (price != null) el('setCustomPrice').value = price;

  // Support contact
  el('setSupportContact').value =
    (settings.support_contact && (settings.support_contact.value || settings.support_contact.whatsapp || settings.support_contact.contact || settings.support_contact.text)) || '';

  // Free-plan safety filter (default ON when the row is missing).
  el('setSafetyFilter').checked =
    !settings.safety_filter || settings.safety_filter.enabled !== false;

  // Site display name.
  el('setSiteName').value =
    (settings.site_name && (settings.site_name.name || settings.site_name.value)) || 'BADSHAH AI';

  // Plans editor (name / months / price / token limit for every plan).
  await loadPlansEditor();

  settingsLoaded = true;
}

// Plans editor: one editable row per plan (name, months, price, token limit).
async function loadPlansEditor() {
  const plans = await loadPlans();
  const list = el('plansEditorList');
  list.innerHTML = plans.map(function (p) {
    return '<div class="plan-editor-row" data-plan="' + escapeHtml(p.id) + '">' +
      '<input class="pe-name" type="text" value="' + escapeHtml(p.name || '') + '" aria-label="Plan name">' +
      '<input class="pe-months" type="number" min="0" step="1" value="' + (p.months == null ? '' : p.months) + '" aria-label="Months">' +
      '<input class="pe-price" type="number" min="0" step="1" value="' + (p.price_pkr == null ? '' : p.price_pkr) + '" aria-label="Price in Rs">' +
      '<input class="pe-tokens" type="number" min="0" step="1" value="' + (p.token_limit == null ? '' : p.token_limit) + '" aria-label="Token limit">' +
    '</div>';
  }).join('');
}

async function savePlans() {
  const rows = document.querySelectorAll('#plansEditorList .plan-editor-row');
  if (!rows.length) { setStatus('plansStatus', 'No plans to save.', false); return; }
  const updates = [];
  for (const row of rows) {
    const id = row.dataset.plan;
    const name = row.querySelector('.pe-name').value.trim();
    const months = parseInt(row.querySelector('.pe-months').value, 10);
    const price = parseInt(row.querySelector('.pe-price').value, 10);
    const tokens = parseInt(row.querySelector('.pe-tokens').value, 10);
    if (!name) { setStatus('plansStatus', 'Every plan needs a name.', false); return; }
    if (!Number.isFinite(months) || months < 0) { setStatus('plansStatus', 'Months must be 0 or more for "' + name + '".', false); return; }
    if (!Number.isFinite(price) || price < 0) { setStatus('plansStatus', 'Price must be 0 or more for "' + name + '".', false); return; }
    if (!Number.isFinite(tokens) || tokens < 0) { setStatus('plansStatus', 'Token limit must be 0 or more for "' + name + '".', false); return; }
    updates.push({ id: id, name: name, months: months, price_pkr: price, token_limit: tokens });
  }
  try {
    for (const u of updates) {
      const { error } = await supabaseClient
        .from('plans')
        .update({ name: u.name, months: u.months, price_pkr: u.price_pkr, token_limit: u.token_limit })
        .eq('id', u.id);
      if (error) throw error;
    }
    // Keep the custom-plan setting in sync when the custom row changed.
    const custom = updates.find(function (u) { return u.id === 'plan-custom'; });
    if (custom) {
      await upsertSetting('custom_plan', { months: custom.months, price_pkr: custom.price_pkr });
    }
    plansCache = []; // plan names/prices changed; refetch next time
    await loadPlansEditor();
    setStatus('plansStatus', 'Plans saved (' + updates.length + ' plan(s)).', true);
    toast('Plans saved.');
  } catch (err) {
    setStatus('plansStatus', err.message, false);
  }
}

async function saveSafety() {
  try {
    await upsertSetting('safety_filter', { enabled: el('setSafetyFilter').checked });
    setStatus('safetyStatus', 'Safety filter saved.', true);
    toast('Safety filter saved.');
  } catch (err) {
    setStatus('safetyStatus', err.message, false);
  }
}

async function saveSiteName() {
  try {
    const name = el('setSiteName').value.trim();
    if (!name) { setStatus('siteNameStatus', 'Enter a site name.', false); return; }
    await upsertSetting('site_name', { name: name });
    setStatus('siteNameStatus', 'Site name saved ("' + name + '").', true);
    toast('Site name saved.');
  } catch (err) {
    setStatus('siteNameStatus', err.message, false);
  }
}

function renderModelToggles(disabledIds) {
  const container = el('modelsList');
  container.innerHTML = MODELS.map(function (model) {
    const disabled = disabledIds.indexOf(model.id) !== -1;
    return '<label class="model-toggle' + (disabled ? ' disabled-model' : '') + '">' +
      '<input type="checkbox" data-model="' + escapeHtml(model.id) + '"' +
      (disabled ? '' : ' checked') + '> ' +
      '<span>' + escapeHtml(model.id) + '</span> ' +
      '<span class="kind">' + escapeHtml(model.kind) + '</span>' +
    '</label>';
  }).join('');
}

async function saveMaintenance() {
  try {
    await upsertSetting('maintenance', { on: el('setMaintenance').checked });
    setStatus('maintenanceStatus', 'Maintenance setting saved.', true);
    toast('Maintenance setting saved.');
  } catch (err) {
    setStatus('maintenanceStatus', err.message, false);
  }
}

async function saveModels() {
  try {
    const disabled = [];
    document.querySelectorAll('#modelsList input[data-model]').forEach(function (box) {
      if (!box.checked) disabled.push(box.dataset.model);
    });
    await upsertSetting('models', { disabled: disabled });
    renderModelToggles(disabled);
    setStatus('modelsStatus', 'Model settings saved. ' + disabled.length + ' model(s) disabled.', true);
    toast('Model settings saved.');
  } catch (err) {
    setStatus('modelsStatus', err.message, false);
  }
}

async function saveApk() {
  try {
    const url = el('setApkUrl').value.trim();
    await upsertSetting('apk_url', { url: url });
    setStatus('apkStatus', 'APK URL saved.', true);
    toast('APK URL saved.');
  } catch (err) {
    setStatus('apkStatus', err.message, false);
  }
}

async function savePayments() {
  try {
    const value = {
      easypaisa: el('setEasypaisa').value.trim(),
      jazzcash: el('setJazzcash').value.trim(),
      nayapay: el('setNayapay').value.trim(),
      bank_name: el('setBankName').value.trim(),
      iban: el('setIban').value.trim()
    };
    await upsertSetting('payment_accounts', value);
    setStatus('paymentsStatus', 'Payment accounts saved.', true);
    toast('Payment accounts saved.');
  } catch (err) {
    setStatus('paymentsStatus', err.message, false);
  }
}

async function saveCustomPlan() {
  const months = parseInt(el('setCustomMonths').value, 10);
  const price = parseInt(el('setCustomPrice').value, 10);
  if (!Number.isFinite(months) || months < 1) {
    setStatus('customPlanStatus', 'Enter a valid number of months (1 or more).', false);
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    setStatus('customPlanStatus', 'Enter a valid price in Rs (0 or more).', false);
    return;
  }
  try {
    // Update BOTH the admin_settings custom_plan row AND the plans row.
    await upsertSetting('custom_plan', { months: months, price_pkr: price });
    const { error } = await supabaseClient
      .from('plans')
      .update({ months: months, price_pkr: price })
      .eq('id', 'plan-custom');
    if (error) throw error;
    plansCache = []; // plan names/prices may have changed; refetch next time
    setStatus('customPlanStatus', 'Custom plan saved (' + months + ' month(s), ' + formatRs(price) + ').', true);
    toast('Custom plan saved.');
  } catch (err) {
    setStatus('customPlanStatus', err.message, false);
  }
}

async function saveSupport() {
  try {
    await upsertSetting('support_contact', { value: el('setSupportContact').value.trim() });
    setStatus('supportStatus', 'Support contact saved.', true);
    toast('Support contact saved.');
  } catch (err) {
    setStatus('supportStatus', err.message, false);
  }
}

// ---------------------------------------------------------------------------
// Logout + wiring
// ---------------------------------------------------------------------------

async function logout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  window.location.href = 'index.html';
}

function wireEvents() {
  // Tabs
  document.querySelectorAll('nav.tab-bar button').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
  });

  // Dashboard refresh
  el('refreshDashboardBtn').addEventListener('click', function () {
    loadDashboard()
      .then(function () { toast('Dashboard refreshed.'); })
      .catch(handleLoadError);
  });

  // Users: live search filter + delegated row actions
  el('userSearch').addEventListener('input', renderUsers);
  el('usersTableBody').addEventListener('click', function (event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    handleUserAction(button.dataset.action, button.dataset.id, button)
      .catch(handleLoadError);
  });

  // Orders: filters + delegated approve/reject
  el('orderFilters').addEventListener('click', function (event) {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    ordersFilter = button.dataset.filter;
    document.querySelectorAll('#orderFilters button').forEach(function (b) {
      b.classList.toggle('active', b === button);
    });
    renderOrders();
  });
  el('ordersList').addEventListener('click', function (event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    handleOrderAction(button.dataset.action, button.dataset.id, button)
      .catch(handleLoadError);
  });

  // Help: delegated reply buttons
  el('helpList').addEventListener('click', function (event) {
    const button = event.target.closest('button[data-action="reply-help"]');
    if (!button) return;
    handleHelpReply(button.dataset.id, button).catch(handleLoadError);
  });

  // Settings save buttons
  el('saveMaintenanceBtn').addEventListener('click', saveMaintenance);
  el('saveModelsBtn').addEventListener('click', saveModels);
  el('saveApkBtn').addEventListener('click', saveApk);
  el('savePaymentsBtn').addEventListener('click', savePayments);
  el('saveCustomPlanBtn').addEventListener('click', saveCustomPlan);
  el('saveSupportBtn').addEventListener('click', saveSupport);
  el('savePlansBtn').addEventListener('click', function () {
    savePlans().catch(handleLoadError);
  });
  el('saveSafetyBtn').addEventListener('click', saveSafety);
  el('saveSiteNameBtn').addEventListener('click', saveSiteName);

  // Grant Pro modal
  el('grantProClose').addEventListener('click', closeGrantProModal);
  el('grantProCancel').addEventListener('click', closeGrantProModal);
  el('grantProConfirm').addEventListener('click', function () {
    confirmGrantPro().catch(handleLoadError);
  });
  el('grantProClear').addEventListener('click', function () {
    clearProFromModal().catch(handleLoadError);
  });
  el('grantProModal').addEventListener('click', function (event) {
    if (event.target === el('grantProModal')) closeGrantProModal();
  });
  document.querySelectorAll('input[name="grantMode"]').forEach(function (radio) {
    radio.addEventListener('change', syncGrantModeVisibility);
  });
  ['grantPlanSelect', 'grantCustomAmount', 'grantCustomUnit', 'grantEndDate', 'grantExtend'].forEach(function (id) {
    const node = el(id);
    if (node) node.addEventListener('change', updateGrantPreview);
  });
  const customAmount = el('grantCustomAmount');
  if (customAmount) customAmount.addEventListener('input', updateGrantPreview);

  // Logout
  el('adminLogoutBtn').addEventListener('click', logout);
}

// Script is loaded at the end of <body>, so the DOM is ready.
wireEvents();
initAdmin().catch(function (err) {
  console.error(err);
  showGuard('Something went wrong while checking your login. Please login from the main app as an admin.');
});
