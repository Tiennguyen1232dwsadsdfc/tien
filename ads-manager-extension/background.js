// Service worker: lấy access token từ phiên Facebook đang đăng nhập,
// gọi Graph API lấy danh sách tài khoản quảng cáo, trả về cho dashboard.

const GRAPH = 'https://graph.facebook.com/v19.0';

const TOKEN_SOURCES = [
  'https://adsmanager.facebook.com/adsmanager/manage/campaigns',
  'https://business.facebook.com/adsmanager/manage/campaigns',
  'https://www.facebook.com/adsmanager/manage/campaigns'
];

const FIELDS = [
  'name', 'account_id', 'account_status', 'disable_reason',
  'balance', 'amount_spent', 'spend_cap', 'currency',
  'adspaymentcycle{threshold_amount}', 'adtrust_dsl', 'tasks', 'created_time'
].join(',');

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'loadAccounts') {
    loadAccounts(!!msg.forceToken)
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // giữ kênh mở cho phản hồi bất đồng bộ
  }
  if (msg.type === 'loadSpend') {
    loadSpend(msg.since, msg.until)
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

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
      if (m) {
        await chrome.storage.local.set({ fbToken: m[0] });
        return m[0];
      }
    } catch (_) { /* thử nguồn tiếp theo */ }
  }
  throw new Error('Không lấy được access token. Hãy mở facebook.com, đăng nhập tài khoản có TKQC rồi bấm "Tải lại dữ liệu".');
}

async function graphGet(path, token) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}/${path}${sep}access_token=${token}`);
  const json = await res.json();
  if (json.error) {
    const e = new Error(json.error.message || 'Lỗi Graph API');
    e.code = json.error.code;
    throw e;
  }
  return json;
}

async function fetchAllAccounts(token) {
  const accounts = [];
  let url = `me/adaccounts?fields=${FIELDS}&limit=100`;
  for (let page = 0; page < 20 && url; page++) {
    const json = await graphGet(url, token);
    accounts.push(...(json.data || []));
    // phân trang: dùng cursor after thay vì URL tuyệt đối
    const after = json.paging && json.paging.cursors && json.paging.cursors.after;
    url = json.paging && json.paging.next
      ? `me/adaccounts?fields=${FIELDS}&limit=100&after=${after}`
      : null;
  }
  return accounts;
}

// Chi tiêu theo khoảng ngày: gọi Insights API cho từng tài khoản.
// Insights trả spend theo ĐƠN VỊ TIỀN TỆ của tài khoản (không phải cents).
async function loadSpend(since, until) {
  let token = await getToken(false);
  try {
    await graphGet('me?fields=id', token);
  } catch (e) {
    if (e.code === 190) token = await getToken(true);
    else throw e;
  }
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
      } catch (_) {
        out[id] = null; // tài khoản không đọc được insights
      }
    }));
  }
  return out;
}

async function loadAccounts(forceToken) {
  let token = await getToken(forceToken);
  let raw;
  try {
    raw = await fetchAllAccounts(token);
  } catch (e) {
    // token hết hạn (code 190) → lấy token mới rồi thử lại một lần
    if (e.code === 190 && !forceToken) {
      token = await getToken(true);
      raw = await fetchAllAccounts(token);
    } else {
      throw e;
    }
  }
  const me = await graphGet('me?fields=name,id', token).catch(() => null);
  const data = {
    fetchedAt: Date.now(),
    user: me,
    accounts: raw.map(normalize)
  };
  await chrome.storage.local.set({ lastData: data });
  return data;
}

// Tiền trong Graph API tính theo đơn vị nhỏ nhất (cents) trừ các tiền tệ không có
// phần thập phân — với chúng giá trị đã là đơn vị nguyên.
const ZERO_DECIMAL = new Set(['VND', 'JPY', 'KRW', 'TWD', 'CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'PYG']);
function money(v, currency) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
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

function normalize(a) {
  const cur = a.currency || 'VND';
  const threshold = a.adspaymentcycle && a.adspaymentcycle.data && a.adspaymentcycle.data[0]
    ? money(a.adspaymentcycle.data[0].threshold_amount, cur) : null;
  const balance = money(a.balance, cur);
  const spendCap = money(a.spend_cap, cur);
  const status = STATUS[a.account_status] || { label: 'Không rõ (' + a.account_status + ')', kind: 'warn' };
  const tasks = a.tasks || [];
  return {
    id: a.id,
    accountId: a.account_id,
    name: a.name,
    statusCode: a.account_status,
    statusLabel: status.label,
    statusKind: status.kind,
    balance,
    threshold,
    thresholdLeft: threshold !== null && balance !== null ? Math.max(threshold - balance, 0) : null,
    spendCap: spendCap && spendCap > 0 ? spendCap : null,
    amountSpent: money(a.amount_spent, cur),
    currency: cur,
    role: tasks.includes('MANAGE') ? 'Quản trị viên' : (tasks.length ? 'Nhà quảng cáo' : '—'),
    adtrustDsl: a.adtrust_dsl ?? null,
    createdTime: a.created_time || null
  };
}
