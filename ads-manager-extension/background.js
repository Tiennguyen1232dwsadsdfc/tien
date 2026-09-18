// Service worker: quản lý token (ưu tiên token bắt từ hook), gọi Graph API
// cho TK cá nhân / BM / Page, chi tiêu theo ngày, và cảnh báo tự động.

const GRAPH = 'https://graph.facebook.com/v19.0';

const TOKEN_SOURCES = [
  'https://adsmanager.facebook.com/adsmanager/manage/campaigns',
  'https://business.facebook.com/adsmanager/manage/campaigns',
  'https://www.facebook.com/adsmanager/manage/campaigns'
];

const ACC_FIELDS_BASE = [
  'name', 'account_id', 'account_status', 'disable_reason',
  'balance', 'amount_spent', 'spend_cap', 'currency',
  'adspaymentcycle{threshold_amount}', 'min_daily_budget',
  'funding_source_details', 'timezone_name', 'adtrust_dsl', 'tasks', 'created_time'
];
// Trường có thể không tồn tại tùy version/tài khoản — dò trước khi dùng để không vỡ cả request.
const ACC_FIELDS_RISKY = ['is_prepay_account', 'users.summary(true)'];

async function supportedFields(token) {
  const { fieldSupport } = await chrome.storage.local.get('fieldSupport');
  if (fieldSupport) return fieldSupport;
  const ok = [];
  for (const f of ACC_FIELDS_RISKY) {
    try { await graphGet(`me/adaccounts?fields=${encodeURIComponent(f)}&limit=1`, token); ok.push(f); } catch (_) {}
  }
  await chrome.storage.local.set({ fieldSupport: ok });
  return ok;
}

chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'capturedToken':
      if (msg.token) chrome.storage.local.set({ fbToken: msg.token, fbTokenAt: Date.now() });
      return;
    case 'loadAccounts':
      loadAccounts(!!msg.forceToken).then(d => sendResponse({ ok: true, data: d })).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;
    case 'loadBM':
      loadBM().then(d => sendResponse({ ok: true, data: d })).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;
    case 'loadPages':
      loadPages().then(d => sendResponse({ ok: true, data: d })).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;
    case 'loadSpend':
      loadSpend(msg.since, msg.until).then(d => sendResponse({ ok: true, data: d })).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;
    case 'setAlerts':
      chrome.storage.local.set({ alertsEnabled: !!msg.enabled });
      setupAlarm();
      return;
  }
});

// ==== Token ====
async function getToken(force) {
  if (!force) {
    const { fbToken } = await chrome.storage.local.get('fbToken');
    if (fbToken) return fbToken;
  }
  for (const url of TOKEN_SOURCES) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      const html = await res.text();
      const m = html.match(/EAA[A-Za-z0-9]{60,}/);
      if (m) { await chrome.storage.local.set({ fbToken: m[0], fbTokenAt: Date.now() }); return m[0]; }
    } catch (_) { /* thử nguồn kế tiếp */ }
  }
  throw new Error('Không lấy được access token. Hãy mở & đăng nhập facebook.com (có TKQC), lướt qua Trình quản lý quảng cáo một lần, rồi bấm "Tải lại dữ liệu".');
}

async function graphGet(path, token) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}/${path}${sep}access_token=${token}`);
  const json = await res.json();
  if (json.error) { const e = new Error(json.error.message || 'Lỗi Graph API'); e.code = json.error.code; throw e; }
  return json;
}

// Tự lấy token mới nếu hết hạn (code 190) rồi thử lại một lần.
async function withToken(fn, force) {
  let token = await getToken(force);
  try { return await fn(token); }
  catch (e) {
    if (e.code === 190 && !force) { token = await getToken(true); return await fn(token); }
    throw e;
  }
}

// ==== Lấy tài khoản ====
async function fetchPaged(node, token, tag, fields) {
  const out = [];
  let after = null;
  for (let page = 0; page < 25; page++) {
    const q = `${node}?fields=${fields}&limit=100${after ? '&after=' + after : ''}`;
    const json = await graphGet(q, token);
    (json.data || []).forEach(a => out.push(tag ? Object.assign({ __bm: tag }, a) : a));
    after = json.paging && json.paging.next && json.paging.cursors ? json.paging.cursors.after : null;
    if (!after) break;
  }
  return out;
}

async function accFields(token) {
  const extra = await supportedFields(token);
  return ACC_FIELDS_BASE.concat(extra).join(',');
}

async function loadAccounts(forceToken) {
  const data = await withToken(async token => {
    const fields = await accFields(token);
    const raw = await fetchPaged('me/adaccounts', token, null, fields);
    const me = await graphGet('me?fields=name,id', token).catch(() => null);
    return { fetchedAt: Date.now(), user: me, accounts: raw.map(normalize) };
  }, forceToken);
  await chrome.storage.local.set({ lastData: data });
  return data;
}

async function loadBM() {
  return withToken(async token => {
    const fields = await accFields(token);
    const biz = await graphGet('me/businesses?fields=id,name&limit=100', token);
    const businesses = biz.data || [];
    const accounts = [];
    for (const b of businesses) {
      for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
        try {
          const list = await fetchPaged(`${b.id}/${edge}`, token, b.name, fields);
          list.forEach(a => accounts.push(normalize(a)));
        } catch (_) { /* BM không có quyền edge này */ }
      }
    }
    const seen = {}, uniq = [];
    accounts.forEach(a => { if (!seen[a.id]) { seen[a.id] = 1; uniq.push(a); } });
    return { fetchedAt: Date.now(), businesses: businesses.length, accounts: uniq };
  });
}

async function loadPages() {
  return withToken(async token => {
    const out = [];
    let after = null;
    for (let page = 0; page < 15; page++) {
      const q = `me/accounts?fields=id,name,category,fan_count,followers_count,link,verification_status,tasks&limit=100${after ? '&after=' + after : ''}`;
      const json = await graphGet(q, token);
      (json.data || []).forEach(p => out.push({
        id: p.id, name: p.name, category: p.category || '—',
        fans: p.fan_count ?? p.followers_count ?? null,
        link: p.link || null,
        verified: p.verification_status === 'blue_verified' || p.verification_status === 'gray_verified',
        role: (p.tasks || []).includes('MANAGE') ? 'Quản trị viên' : 'Thành viên'
      }));
      after = json.paging && json.paging.next && json.paging.cursors ? json.paging.cursors.after : null;
      if (!after) break;
    }
    return { fetchedAt: Date.now(), pages: out };
  });
}

// ==== Chi tiêu theo ngày (Insights: trả theo đơn vị tiền tệ tài khoản) ====
async function loadSpend(since, until) {
  return withToken(async token => {
    const { lastData } = await chrome.storage.local.get('lastData');
    const ids = ((lastData && lastData.accounts) || []).map(a => a.id);
    const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
    const out = {};
    const CHUNK = 8;
    for (let i = 0; i < ids.length; i += CHUNK) {
      await Promise.all(ids.slice(i, i + CHUNK).map(async id => {
        try {
          const j = await graphGet(`${id}/insights?fields=spend&time_range=${timeRange}`, token);
          out[id] = j.data && j.data[0] && j.data[0].spend !== undefined ? Number(j.data[0].spend) : 0;
        } catch (_) { out[id] = null; }
      }));
    }
    return out;
  });
}

// ==== Chuẩn hóa ====
const ZERO_DECIMAL = new Set(['VND', 'JPY', 'KRW', 'TWD', 'CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'PYG']);
function money(v, currency) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v); if (Number.isNaN(n)) return null;
  return ZERO_DECIMAL.has(currency) ? n : n / 100;
}

const STATUS = {
  1: { label: 'Hoạt động', kind: 'active' },
  2: { label: 'Vô hiệu hóa', kind: 'disabled' },
  3: { label: 'Chưa thanh toán', kind: 'warn' },
  7: { label: 'Chờ xét duyệt rủi ro', kind: 'warn' },
  8: { label: 'Chờ thanh toán', kind: 'warn' },
  9: { label: 'Trong hạn gia hạn', kind: 'warn' },
  100: { label: 'Chờ đóng', kind: 'disabled' },
  101: { label: 'Đã đóng', kind: 'disabled' }
};

const DISABLE_REASON = {
  0: '', 1: 'Vi phạm chính sách quảng cáo', 2: 'Đang xem xét IP', 3: 'Rủi ro thanh toán',
  4: 'Tài khoản xám bị đóng', 5: 'Đang xem xét AFC', 6: 'Toàn vẹn doanh nghiệp',
  7: 'Đóng vĩnh viễn', 8: 'TK đại lý không dùng', 9: 'Tài khoản không hoạt động'
};

function normalize(a) {
  const cur = a.currency || 'VND';
  const threshold = a.adspaymentcycle && a.adspaymentcycle.data && a.adspaymentcycle.data[0]
    ? money(a.adspaymentcycle.data[0].threshold_amount, cur) : null;
  const balance = money(a.balance, cur);
  const spendCap = money(a.spend_cap, cur);
  const status = STATUS[a.account_status] || { label: 'Không rõ (' + a.account_status + ')', kind: 'warn' };
  const tasks = a.tasks || [];
  const funding = a.funding_source_details;
  return {
    id: a.id,
    accountId: a.account_id,
    name: a.name,
    business: a.__bm || null,
    statusCode: a.account_status,
    statusLabel: status.label,
    statusKind: status.kind,
    disableReason: DISABLE_REASON[a.disable_reason] || '',
    balance,
    threshold,
    thresholdLeft: threshold !== null && balance !== null ? Math.max(threshold - balance, 0) : null,
    spendCap: spendCap && spendCap > 0 ? spendCap : null,
    amountSpent: money(a.amount_spent, cur),
    minDaily: money(a.min_daily_budget, cur),
    payment: funding && funding.display_string ? funding.display_string : '',
    accountType: a.is_prepay_account === undefined ? '' : (a.is_prepay_account ? 'Trả trước' : 'Trả sau'),
    hiddenAdmins: a.users && a.users.summary ? a.users.summary.total_count : null,
    nextBill: null,
    timezone: a.timezone_name || '',
    currency: cur,
    role: tasks.includes('MANAGE') ? 'Quản trị viên' : (tasks.length ? 'Nhà quảng cáo' : '—'),
    createdTime: a.created_time || null
  };
}

// ==== Cảnh báo tự động ====
async function setupAlarm() {
  const { alertsEnabled } = await chrome.storage.local.get('alertsEnabled');
  await chrome.alarms.clear('adsCheck');
  if (alertsEnabled) chrome.alarms.create('adsCheck', { periodInMinutes: 30 });
}

chrome.alarms.onAlarm.addListener(a => { if (a.name === 'adsCheck') runAlertCheck(); });

async function runAlertCheck() {
  const { alertsEnabled, alertSnapshot } = await chrome.storage.local.get(['alertsEnabled', 'alertSnapshot']);
  if (!alertsEnabled) return;
  let data;
  try { data = await loadAccounts(false); } catch (_) { return; }
  const prev = alertSnapshot || {};
  const snap = {};
  const alerts = [];
  for (const a of data.accounts) {
    snap[a.id] = a.statusCode;
    // vừa chuyển sang vô hiệu hóa
    if (a.statusKind === 'disabled' && prev[a.id] !== undefined && prev[a.id] !== a.statusCode && STATUS[prev[a.id]] && STATUS[prev[a.id]].kind !== 'disabled') {
      alerts.push(`⛔ ${a.name} vừa bị ${a.statusLabel}${a.disableReason ? ' — ' + a.disableReason : ''}`);
    }
    // ngưỡng còn lại thấp (sắp bị charge)
    if (a.statusKind === 'active' && a.thresholdLeft !== null && a.threshold && a.thresholdLeft <= a.threshold * 0.15) {
      alerts.push(`⚠️ ${a.name} sắp chạm ngưỡng (còn ${new Intl.NumberFormat('vi-VN').format(a.thresholdLeft)} ${a.currency})`);
    }
  }
  await chrome.storage.local.set({ alertSnapshot: snap });
  if (alerts.length) {
    chrome.notifications.create('adsmgr-' + Date.now(), {
      type: 'list',
      iconUrl: 'icons/icon128.png',
      title: `Cảnh báo TKQC (${alerts.length})`,
      message: alerts.slice(0, 5).join('\n'),
      items: alerts.slice(0, 8).map(a => ({ title: '', message: a })),
      priority: 2
    });
  }
}
