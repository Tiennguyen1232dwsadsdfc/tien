/* ============================================================
   Quản Lý Chi Phí Marketing — app.js
   Demo chạy hoàn toàn trên trình duyệt, dữ liệu lưu localStorage.
   ============================================================ */
'use strict';

/* ---------------- Helpers ---------------- */
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const VND = n => (Math.round(n) || 0).toLocaleString('vi-VN') + ' ₫';
const vndShort = n => {
  n = Math.round(n) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tỷ';
  if (abs >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr';
  if (abs >= 1e3) return (n / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' k';
  return String(n);
};
const pctStr = (num, den) => den > 0 ? (num / den * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%' : '—';

const pad2 = n => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const curMonth = () => todayISO().slice(0, 7);
const fmtDate = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const monthLabel = m => { const [y, mm] = m.split('-'); return `tháng ${Number(mm)}/${y}`; };
const prevMonth = m => {
  let [y, mm] = m.split('-').map(Number);
  mm -= 1; if (mm === 0) { mm = 12; y -= 1; }
  return `${y}-${pad2(mm)}`;
};
const uid = () => 'id' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* PRNG có seed để dữ liệu mẫu luôn giống nhau */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- Dữ liệu ---------------- */
const LS_KEY = 'mkt_cost_app_v1';
const CHANNELS = ['Facebook Ads', 'Google Ads', 'TikTok Ads', 'Zalo Ads', 'KOL/Booking', 'Khác'];
let state = null;

function seedState() {
  const users = [
    { id: 'u-admin', name: 'Quản lý', role: 'admin', pass: '123456' },
    { id: 'u-tien',  name: 'Tiến',    role: 'staff', pass: '123456' },
    { id: 'u-ha',    name: 'Hà',      role: 'staff', pass: '123456' },
    { id: 'u-minh',  name: 'Minh',    role: 'staff', pass: '123456' },
  ];
  const accounts = [
    { id: 'a1', userId: 'u-tien', name: 'FB – Tiến 01',   channel: 'Facebook Ads' },
    { id: 'a2', userId: 'u-tien', name: 'FB – Tiến 02',   channel: 'Facebook Ads' },
    { id: 'a3', userId: 'u-tien', name: 'TikTok – Tiến',  channel: 'TikTok Ads' },
    { id: 'a4', userId: 'u-ha',   name: 'FB – Hà 01',     channel: 'Facebook Ads' },
    { id: 'a5', userId: 'u-ha',   name: 'GG – Hà',        channel: 'Google Ads' },
    { id: 'a6', userId: 'u-ha',   name: 'TikTok – Hà',    channel: 'TikTok Ads' },
    { id: 'a7', userId: 'u-minh', name: 'FB – Minh 01',   channel: 'Facebook Ads' },
    { id: 'a8', userId: 'u-minh', name: 'GG – Minh',      channel: 'Google Ads' },
  ];

  const rnd = mulberry32(20260714);
  const reports = [];
  const base = { a1: 3200, a2: 1800, a3: 1400, a4: 2600, a5: 2100, a6: 1100, a7: 1900, a8: 1500 }; // nghìn đồng/ngày
  const months = [['2026-06', 30], ['2026-07', 13]];
  for (const [month, days] of months) {
    for (const acc of accounts) {
      for (let d = 1; d <= days; d++) {
        if (rnd() < 0.18) continue; // ngày nghỉ chạy
        const spend = Math.round(base[acc.id] * (0.55 + rnd() * 0.9)) * 1000;
        const roas = 2.2 + rnd() * 2.6;
        const revenue = Math.round(spend * roas / 1000) * 1000;
        const orders = Math.max(1, Math.round(revenue / (280000 + rnd() * 160000)));
        reports.push({
          id: uid(), date: `${month}-${pad2(d)}`, userId: acc.userId,
          accountId: acc.id, spend, revenue, orders,
          note: rnd() < 0.12 ? 'Test camp mới' : '',
        });
      }
    }
  }

  const advances = [
    { id: uid(), date: '2026-06-02', userId: 'u-tien', amount: 60000000, reason: 'Ứng chạy Facebook đợt 1 tháng 6', status: 'approved' },
    { id: uid(), date: '2026-06-05', userId: 'u-ha',   amount: 45000000, reason: 'Ứng ngân sách Google + TikTok',    status: 'approved' },
    { id: uid(), date: '2026-06-10', userId: 'u-minh', amount: 30000000, reason: 'Ứng chạy ads tháng 6',             status: 'approved' },
    { id: uid(), date: '2026-06-18', userId: 'u-tien', amount: 25000000, reason: 'Ứng bổ sung camp sale hè',          status: 'approved' },
    { id: uid(), date: '2026-07-01', userId: 'u-tien', amount: 50000000, reason: 'Ứng ngân sách tháng 7 đợt 1',       status: 'approved' },
    { id: uid(), date: '2026-07-02', userId: 'u-ha',   amount: 40000000, reason: 'Ứng ngân sách tháng 7',             status: 'approved' },
    { id: uid(), date: '2026-07-08', userId: 'u-minh', amount: 28000000, reason: 'Ứng chạy ads tháng 7',              status: 'approved' },
    { id: uid(), date: '2026-07-12', userId: 'u-tien', amount: 20000000, reason: 'Ứng bổ sung TikTok',                status: 'pending' },
    { id: uid(), date: '2026-07-13', userId: 'u-ha',   amount: 15000000, reason: 'Ứng test kênh Zalo',                status: 'pending' },
  ];

  const kpis = {
    '2026-06': { 'u-tien': 130000000, 'u-ha': 110000000, 'u-minh': 75000000 },
    '2026-07': { 'u-tien': 150000000, 'u-ha': 120000000, 'u-minh': 80000000 },
  };

  return { users, accounts, reports, advances, kpis, api: defaultApi(), session: null, ui: { month: curMonth() } };
}

/* Cấu hình kết nối API Sandbox (tab "Kết nối API") */
function defaultApi() {
  return {
    base: 'https://api.sandbox.com.vn',
    token: '',
    idChiNhanh: '',
    contactPath: '/partner/api/Contact/GetContactByConditions',
    orderPath: '/partner/api/ThuKhoTacNghiep/GetOrderLogisticByConditions',
    contactKieuNgay: 'NgayTao',
    orderKieuNgay: 'DonHangNgayChot',
    userMap: {}, // userNameMarketing (API) -> userId (app)
  };
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      state = JSON.parse(raw);
      if (!state.api) { state.api = defaultApi(); save(); } // dữ liệu cũ chưa có cấu hình API
      if (state.api.orderPath === '/partner/api/ThuKhoTacNghiep/GetDonHangByConditions') {
        state.api.orderPath = defaultApi().orderPath; save(); // sửa đường dẫn đoán sai ở bản trước
      }
      return;
    }
  } catch (e) { /* localStorage bị chặn hoặc dữ liệu hỏng thì seed lại */ }
  state = seedState();
  save();
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch (e) { /* localStorage bị chặn: dữ liệu chỉ sống trong phiên hiện tại */ }
}

/* ---------------- Truy vấn dữ liệu ---------------- */
const me = () => state.users.find(u => u.id === state.session) || null;
const isAdmin = () => me()?.role === 'admin';
const userById = id => state.users.find(u => u.id === id);
const accById = id => state.accounts.find(a => a.id === id);
const userAccounts = userId => state.accounts.filter(a => a.userId === userId);

const inMonth = (iso, month) => iso.startsWith(month);
const monthReports = (month, userId = null) =>
  state.reports.filter(r => inMonth(r.date, month) && (!userId || r.userId === userId));
const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);
const budgetOf = (month, userId) => (state.kpis[month] || {})[userId] || 0;
const totalBudget = month => Object.values(state.kpis[month] || {}).reduce((a, b) => a + b, 0);
const pendingAdvances = () => state.advances.filter(a => a.status === 'pending');

/* ---------------- Toast / Modal ---------------- */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
}

function openModal(html) {
  $('#modal-box').innerHTML = html;
  $('#modal-backdrop').classList.remove('hidden');
}
function closeModal() {
  $('#modal-backdrop').classList.add('hidden');
  $('#modal-box').innerHTML = '';
}
$('#modal-backdrop').addEventListener('click', e => {
  if (e.target === $('#modal-backdrop')) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function confirmModal(title, message, onOk) {
  openModal(`
    <h2>${esc(title)}</h2>
    <p style="margin:0;color:var(--ink-2)">${esc(message)}</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-act="cancel">Hủy</button>
      <button class="btn btn-primary" data-act="ok">Xác nhận</button>
    </div>`);
  $('#modal-box [data-act=cancel]').onclick = closeModal;
  $('#modal-box [data-act=ok]').onclick = () => { closeModal(); onOk(); };
}

/* ---------------- Biểu đồ SVG ---------------- */
const chartTT = $('#chart-tooltip');
function showTT(html, x, y) {
  chartTT.innerHTML = html;
  chartTT.classList.remove('hidden');
  const w = chartTT.offsetWidth, h = chartTT.offsetHeight;
  let left = x + 14, top = y - h - 10;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  if (top < 8) top = y + 14;
  chartTT.style.left = left + 'px';
  chartTT.style.top = top + 'px';
}
function hideTT() { chartTT.classList.add('hidden'); }

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/* Biểu đồ đường: series = [{name, color, values:[...]}], labels = ['01','02',...]
   opts.fmt / opts.fmtShort: định dạng giá trị (mặc định tiền VND) */
function lineChart(container, labels, series, opts = {}) {
  const fmt = opts.fmt || VND;
  const fmtShort = opts.fmtShort || vndShort;
  const W = Math.max(320, container.clientWidth || 640), H = 240;
  const padL = 52, padR = 14, padT = 12, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxV = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
  const x = i => padL + (labels.length > 1 ? i / (labels.length - 1) * iw : iw / 2);
  const y = v => padT + ih - (v / maxV) * ih;
  const grid = cssVar('--line'), mutedInk = cssVar('--muted');

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">`;
  for (let g = 0; g <= 4; g++) {
    const gy = padT + ih * g / 4;
    svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${grid}" stroke-width="1"/>`;
    svg += `<text x="${padL - 8}" y="${gy + 4}" text-anchor="end" font-size="10.5" fill="${mutedInk}" style="font-variant-numeric:tabular-nums">${esc(fmtShort(maxV * (4 - g) / 4))}</text>`;
  }
  const step = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((lb, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="${mutedInk}">${esc(lb)}</text>`;
  });
  for (const s of series) {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const li = s.values.length - 1;
    if (li >= 0) svg += `<circle cx="${x(li)}" cy="${y(s.values[li])}" r="3.5" fill="${s.color}" stroke="${cssVar('--card')}" stroke-width="2"/>`;
  }
  svg += `<line id="xh" x1="0" y1="${padT}" x2="0" y2="${padT + ih}" stroke="${mutedInk}" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>`;
  svg += `<rect x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="transparent"/>`;
  svg += `</svg>`;

  container.innerHTML =
    `<div class="legend">${series.map(s =>
      `<span class="legend-item"><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')}</div>
     <div class="chart-box">${svg}</div>`;

  const svgEl = $('svg', container);
  const hair = $('#xh', svgEl);
  svgEl.addEventListener('mousemove', e => {
    const rect = svgEl.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (W / rect.width);
    let i = Math.round((sx - padL) / (labels.length > 1 ? iw / (labels.length - 1) : 1));
    i = Math.max(0, Math.min(labels.length - 1, i));
    hair.setAttribute('x1', x(i)); hair.setAttribute('x2', x(i));
    hair.setAttribute('visibility', 'visible');
    showTT(
      `<div class="tt-title">Ngày ${esc(labels[i])}</div>` +
      series.map(s => `<div class="tt-row"><span><span class="swatch" style="background:${s.color}"></span> ${esc(s.name)}</span><span class="num">${esc(fmt(s.values[i]))}</span></div>`).join(''),
      e.clientX, e.clientY);
  });
  svgEl.addEventListener('mouseleave', () => { hair.setAttribute('visibility', 'hidden'); hideTT(); });
}

/* Biểu đồ cột ngang: items = [{label, value, color?}] — nhãn giá trị trực tiếp */
function hbarChart(container, items, { color = null } = {}) {
  const W = Math.max(320, container.clientWidth || 640);
  const rowH = 30, padT = 4;
  const H = padT + items.length * rowH + 6;
  const labelW = Math.min(170, Math.max(90, W * 0.26)), valueW = 76;
  const iw = W - labelW - valueW - 12;
  const maxV = Math.max(1, ...items.map(i => i.value));
  const ink = cssVar('--ink'), ink2 = cssVar('--ink-2');
  const barColor = color || cssVar('--accent');

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">`;
  items.forEach((it, i) => {
    const y0 = padT + i * rowH;
    const bw = Math.max(2, it.value / maxV * iw);
    svg += `<text x="${labelW - 8}" y="${y0 + rowH / 2 + 4}" text-anchor="end" font-size="12" fill="${ink2}">${esc(it.label.length > 22 ? it.label.slice(0, 21) + '…' : it.label)}</text>`;
    svg += `<rect data-i="${i}" x="${labelW}" y="${y0 + 6}" width="${bw.toFixed(1)}" height="${rowH - 12}" rx="4" fill="${it.color || barColor}"/>`;
    svg += `<text x="${labelW + bw + 8}" y="${y0 + rowH / 2 + 4}" font-size="11.5" fill="${ink}" style="font-variant-numeric:tabular-nums">${esc(vndShort(it.value))}</text>`;
  });
  svg += `</svg>`;
  container.innerHTML = `<div class="chart-box">${svg}</div>`;

  const svgEl = $('svg', container);
  svgEl.addEventListener('mousemove', e => {
    const t = e.target.closest('rect[data-i]');
    if (!t) { hideTT(); return; }
    const it = items[Number(t.dataset.i)];
    showTT(`<div class="tt-title">${esc(it.label)}</div><div class="tt-row"><span>Chi phí</span><span class="num">${esc(VND(it.value))}</span></div>`, e.clientX, e.clientY);
  });
  svgEl.addEventListener('mouseleave', hideTT);
}

/* ---------------- Đăng nhập ---------------- */
function renderLoginSelect() {
  $('#login-user').innerHTML = state.users.map(u =>
    `<option value="${u.id}">${esc(u.name)}${u.role === 'admin' ? ' (Quản lý)' : ''}</option>`).join('');
}
function doLogin() {
  const userId = $('#login-user').value;
  const pass = $('#login-pass').value;
  const u = userById(userId);
  if (!u || u.pass !== pass) {
    $('#login-error').textContent = 'Sai mật khẩu. Mặc định là 123456.';
    return;
  }
  state.session = u.id;
  save();
  $('#login-pass').value = ''; $('#login-error').textContent = '';
  enterApp();
}
function doLogout() {
  state.session = null;
  save();
  $('#app').classList.add('hidden');
  renderLoginSelect();
  $('#login-screen').classList.remove('hidden');
}

/* ---------------- Khung app ---------------- */
let currentPage = 'dashboard';

function enterApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  const u = me();
  $('#me-name').textContent = `${u.name} · ${u.role === 'admin' ? 'Quản lý' : 'Nhân viên'}`;
  $('#tab-users').classList.toggle('hidden', !isAdmin());
  $('#tab-sync').classList.toggle('hidden', !isAdmin());
  $('#month-picker').value = state.ui.month;
  currentPage = 'dashboard';
  setActiveTab();
  updateBadge();
  renderPage();
}

function setActiveTab() {
  $$('#main-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.page === currentPage));
}

function updateBadge() {
  const b = $('#adv-badge');
  const n = isAdmin() ? pendingAdvances().length
                      : pendingAdvances().filter(a => a.userId === state.session).length;
  b.textContent = n;
  b.classList.toggle('hidden', n === 0);
}

function renderPage() {
  updateBadge();
  const el = $('#page-content');
  hideTT();
  switch (currentPage) {
    case 'dashboard': renderDashboard(el); break;
    case 'personal':  renderPersonal(el);  break;
    case 'reports':   renderReports(el);   break;
    case 'advances':  renderAdvances(el);  break;
    case 'users':     renderUsers(el);     break;
    case 'sync':      renderSync(el);      break;
  }
}

/* ---------------- Trang: Tổng quan ---------------- */
function tileHTML(label, value, delta) {
  let deltaHTML = '';
  if (delta) deltaHTML = `<div class="tile-delta ${delta.cls || ''}">${delta.text}</div>`;
  return `<div class="tile"><div class="tile-label">${esc(label)}</div><div class="tile-value num">${value}</div>${deltaHTML}</div>`;
}
function deltaVsPrev(cur, prev, goodWhenDown = false) {
  if (!prev) return { text: 'so với tháng trước: —', cls: '' };
  const ch = (cur - prev) / prev * 100;
  const up = ch >= 0;
  const good = goodWhenDown ? !up : up;
  return {
    text: `${up ? '▲' : '▼'} ${Math.abs(ch).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% so với tháng trước`,
    cls: good ? 'up' : 'down',
  };
}

function renderDashboard(el) {
  const month = state.ui.month;
  const scopeUser = isAdmin() ? null : state.session;
  const rows = monthReports(month, scopeUser);
  const prevRows = monthReports(prevMonth(month), scopeUser);

  const spend = sum(rows, r => r.spend), revenue = sum(rows, r => r.revenue), orders = sum(rows, r => r.orders);
  const pSpend = sum(prevRows, r => r.spend), pRevenue = sum(prevRows, r => r.revenue);
  const budget = scopeUser ? budgetOf(month, scopeUser) : totalBudget(month);

  el.innerHTML = `
    <h1 class="page-title">Tổng quan ${esc(monthLabel(month))}<small>${isAdmin() ? 'toàn team' : 'dữ liệu của bạn'}</small></h1>
    <div class="tiles">
      ${tileHTML('Tổng chi phí', VND(spend), deltaVsPrev(spend, pSpend, true))}
      ${tileHTML('Doanh thu', VND(revenue), deltaVsPrev(revenue, pRevenue))}
      ${tileHTML('% CP / DT', pctStr(spend, revenue), null)}
      ${tileHTML('Số đơn', orders.toLocaleString('vi-VN'), null)}
      ${tileHTML('CPA trung bình', orders ? VND(spend / orders) : '—', null)}
    </div>
    <div class="card">
      <div class="progress-row"><span>Ngân sách ${esc(monthLabel(month))}: <b class="num">${esc(VND(budget))}</b></span><span>Đã dùng <b class="num">${esc(pctStr(spend, budget))}</b></span></div>
      <div class="progress"><div class="progress-bar ${budget && spend > budget ? 'over' : ''}" style="width:${budget ? Math.min(100, spend / budget * 100) : 0}%"></div></div>
    </div>
    <div class="card">
      <p class="card-title">Chi phí & doanh thu theo ngày</p>
      <div id="chart-daily"></div>
    </div>
    <div class="grid-2">
      <div class="card"><p class="card-title">Chi phí theo kênh</p><div id="chart-channel"></div></div>
      ${isAdmin()
        ? '<div class="card"><p class="card-title">Chi phí theo nhân viên</p><div id="chart-staff"></div></div>'
        : '<div class="card"><p class="card-title">Chi phí theo tài khoản</p><div id="chart-acc"></div></div>'}
    </div>
    ${isAdmin() ? '<div class="card"><p class="card-title">Hiệu quả theo nhân viên</p><div class="table-wrap" id="staff-table"></div></div>' : ''}
  `;

  // Biểu đồ theo ngày — tháng hiện tại chỉ vẽ đến hôm nay, không kéo 0 về tương lai
  const [y, m] = month.split('-').map(Number);
  let days = new Date(y, m, 0).getDate();
  if (month === curMonth()) days = Math.min(days, Number(todayISO().slice(8)));
  const labels = [], spendD = new Array(days).fill(0), revD = new Array(days).fill(0);
  for (let d = 1; d <= days; d++) labels.push(pad2(d));
  rows.forEach(r => {
    const d = Number(r.date.slice(8)) - 1;
    spendD[d] += r.spend; revD[d] += r.revenue;
  });
  lineChart($('#chart-daily'), labels, [
    { name: 'Chi phí', color: cssVar('--s1'), values: spendD },
    { name: 'Doanh thu', color: cssVar('--s2'), values: revD },
  ]);

  // Theo kênh
  const byChannel = new Map();
  rows.forEach(r => {
    const ch = accById(r.accountId)?.channel || 'Khác';
    byChannel.set(ch, (byChannel.get(ch) || 0) + r.spend);
  });
  const chItems = [...byChannel.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  if (chItems.length) hbarChart($('#chart-channel'), chItems);
  else $('#chart-channel').innerHTML = '<div class="empty">Chưa có dữ liệu trong tháng này.</div>';

  if (isAdmin()) {
    const staff = state.users.filter(u => u.role === 'staff');
    const items = staff.map(u => ({ label: u.name, value: sum(rows.filter(r => r.userId === u.id), r => r.spend) }))
      .sort((a, b) => b.value - a.value);
    if (items.some(i => i.value > 0)) hbarChart($('#chart-staff'), items);
    else $('#chart-staff').innerHTML = '<div class="empty">Chưa có dữ liệu trong tháng này.</div>';

    $('#staff-table').innerHTML = `
      <table class="tbl">
        <thead><tr><th>Nhân viên</th><th class="r">Chi phí</th><th class="r">Doanh thu</th><th class="r">% CP/DT</th><th class="r">Đơn</th><th class="r">Ngân sách</th><th class="r">% dùng NS</th></tr></thead>
        <tbody>${staff.map(u => {
          const rr = rows.filter(r => r.userId === u.id);
          const sp = sum(rr, r => r.spend), rv = sum(rr, r => r.revenue), od = sum(rr, r => r.orders);
          const bg = budgetOf(month, u.id);
          return `<tr><td>${esc(u.name)}</td><td class="r">${esc(VND(sp))}</td><td class="r">${esc(VND(rv))}</td>
            <td class="r">${esc(pctStr(sp, rv))}</td><td class="r">${od.toLocaleString('vi-VN')}</td>
            <td class="r">${esc(VND(bg))}</td><td class="r" ${bg && sp > bg ? 'style="color:var(--bad);font-weight:700"' : ''}>${esc(pctStr(sp, bg))}</td></tr>`;
        }).join('')}</tbody>
      </table>`;
  } else {
    const byAcc = new Map();
    rows.forEach(r => {
      const name = accById(r.accountId)?.name || '—';
      byAcc.set(name, (byAcc.get(name) || 0) + r.spend);
    });
    const items = [...byAcc.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
    if (items.length) hbarChart($('#chart-acc'), items);
    else $('#chart-acc').innerHTML = '<div class="empty">Chưa có dữ liệu trong tháng này.</div>';
  }
}

/* ---------------- Trang: Chi phí cá nhân ---------------- */
function renderPersonal(el) {
  const month = state.ui.month;
  const staff = state.users.filter(u => u.role === 'staff');
  let viewId = isAdmin() ? (state.ui.personalUser || staff[0]?.id) : state.session;
  if (isAdmin() && !staff.some(s => s.id === viewId)) viewId = staff[0]?.id;

  const picker = isAdmin() ? `
    <div class="toolbar">
      <label class="muted">Xem nhân viên:</label>
      <select id="personal-user">${staff.map(u => `<option value="${u.id}" ${u.id === viewId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
    </div>` : '';

  if (!viewId) { el.innerHTML = '<div class="empty">Chưa có nhân viên nào.</div>'; return; }

  const u = userById(viewId);
  const rows = monthReports(month, viewId);
  const spend = sum(rows, r => r.spend), revenue = sum(rows, r => r.revenue), orders = sum(rows, r => r.orders);
  const budget = budgetOf(month, viewId);
  const accs = userAccounts(viewId);

  el.innerHTML = `
    <h1 class="page-title">Chi phí cá nhân theo tài khoản<small>${esc(u.name)} · ${esc(monthLabel(month))}</small></h1>
    ${picker}
    <div class="tiles">
      ${tileHTML('Chi phí trong tháng', VND(spend), null)}
      ${tileHTML('Doanh thu', VND(revenue), null)}
      ${tileHTML('% CP / DT', pctStr(spend, revenue), null)}
      ${tileHTML('Số đơn', orders.toLocaleString('vi-VN'), null)}
    </div>
    <div class="card">
      <div class="progress-row"><span>KPI ngân sách: <b class="num">${esc(VND(budget))}</b></span><span>Đã dùng <b class="num">${esc(pctStr(spend, budget))}</b> · Còn lại <b class="num">${esc(VND(Math.max(0, budget - spend)))}</b></span></div>
      <div class="progress"><div class="progress-bar ${budget && spend > budget ? 'over' : ''}" style="width:${budget ? Math.min(100, spend / budget * 100) : 0}%"></div></div>
    </div>
    <div class="card"><p class="card-title">Chi phí theo tài khoản</p><div id="p-chart"></div></div>
    <div class="card">
      <p class="card-title">Chi tiết theo tài khoản</p>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Tài khoản</th><th>Kênh</th><th class="r">Ngày chạy</th><th class="r">Chi phí</th><th class="r">Doanh thu</th><th class="r">% CP/DT</th><th class="r">Đơn</th><th class="r">CPA</th></tr></thead>
          <tbody>${accs.map(a => {
            const rr = rows.filter(r => r.accountId === a.id);
            const sp = sum(rr, r => r.spend), rv = sum(rr, r => r.revenue), od = sum(rr, r => r.orders);
            return `<tr><td>${esc(a.name)}</td><td class="muted">${esc(a.channel)}</td><td class="r">${rr.length}</td>
              <td class="r">${esc(VND(sp))}</td><td class="r">${esc(VND(rv))}</td><td class="r">${esc(pctStr(sp, rv))}</td>
              <td class="r">${od.toLocaleString('vi-VN')}</td><td class="r">${od ? esc(VND(sp / od)) : '—'}</td></tr>`;
          }).join('') || '<tr><td colspan="8" class="empty">Chưa có tài khoản quảng cáo.</td></tr>'}</tbody>
          ${accs.length ? `<tfoot><tr><td>Tổng</td><td></td><td class="r">${rows.length}</td><td class="r">${esc(VND(spend))}</td><td class="r">${esc(VND(revenue))}</td><td class="r">${esc(pctStr(spend, revenue))}</td><td class="r">${orders.toLocaleString('vi-VN')}</td><td class="r">${orders ? esc(VND(spend / orders)) : '—'}</td></tr></tfoot>` : ''}
        </table>
      </div>
    </div>`;

  const items = accs.map(a => ({ label: a.name, value: sum(rows.filter(r => r.accountId === a.id), r => r.spend) }))
    .sort((a, b) => b.value - a.value);
  if (items.some(i => i.value > 0)) hbarChart($('#p-chart'), items);
  else $('#p-chart').innerHTML = '<div class="empty">Chưa có dữ liệu trong tháng này.</div>';

  if (isAdmin()) $('#personal-user').onchange = e => { state.ui.personalUser = e.target.value; save(); renderPage(); };
}

/* ---------------- Trang: Dữ liệu chi tiết ---------------- */
function renderReports(el) {
  const month = state.ui.month;
  const f = state.ui.reportFilter || (state.ui.reportFilter = { user: '', channel: '' });
  let rows = monthReports(month, isAdmin() ? null : state.session);
  if (isAdmin() && f.user) rows = rows.filter(r => r.userId === f.user);
  if (f.channel) rows = rows.filter(r => (accById(r.accountId)?.channel) === f.channel);
  rows = rows.slice().sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  const spend = sum(rows, r => r.spend), revenue = sum(rows, r => r.revenue), orders = sum(rows, r => r.orders);
  const staff = state.users.filter(u => u.role === 'staff');

  el.innerHTML = `
    <h1 class="page-title">Dữ liệu chi tiết<small>${esc(monthLabel(month))} · ${rows.length} dòng</small></h1>
    <div class="toolbar">
      ${isAdmin() ? `<select id="f-user"><option value="">Tất cả nhân viên</option>${staff.map(u => `<option value="${u.id}" ${f.user === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>` : ''}
      <select id="f-channel"><option value="">Tất cả kênh</option>${CHANNELS.map(c => `<option ${f.channel === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <span class="spacer"></span>
      <button class="btn btn-primary" id="btn-add-report">+ Thêm báo cáo ngày</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Ngày</th>${isAdmin() ? '<th>Nhân viên</th>' : ''}<th>Tài khoản</th><th>Kênh</th><th class="r">Chi phí</th><th class="r">Doanh thu</th><th class="r">% CP/DT</th><th class="r">Đơn</th><th>Ghi chú</th><th></th></tr></thead>
          <tbody>${rows.map(r => {
            const a = accById(r.accountId);
            const canEdit = isAdmin() || r.userId === state.session;
            return `<tr>
              <td class="num">${esc(fmtDate(r.date))}</td>
              ${isAdmin() ? `<td>${esc(userById(r.userId)?.name || '—')}</td>` : ''}
              <td>${esc(a?.name || '—')}</td><td class="muted">${esc(a?.channel || '—')}</td>
              <td class="r">${esc(VND(r.spend))}</td><td class="r">${esc(VND(r.revenue))}</td>
              <td class="r">${esc(pctStr(r.spend, r.revenue))}</td><td class="r">${r.orders.toLocaleString('vi-VN')}</td>
              <td class="muted">${esc(r.note || '')}</td>
              <td class="row-actions">${canEdit ? `<button class="btn btn-ghost btn-sm" data-edit="${r.id}">Sửa</button><button class="btn btn-danger btn-sm" data-del="${r.id}">Xóa</button>` : ''}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="${isAdmin() ? 10 : 9}" class="empty">Chưa có báo cáo nào trong tháng này.</td></tr>`}</tbody>
          ${rows.length ? `<tfoot><tr><td>Tổng</td>${isAdmin() ? '<td></td>' : ''}<td></td><td></td><td class="r">${esc(VND(spend))}</td><td class="r">${esc(VND(revenue))}</td><td class="r">${esc(pctStr(spend, revenue))}</td><td class="r">${orders.toLocaleString('vi-VN')}</td><td></td><td></td></tr></tfoot>` : ''}
        </table>
      </div>
    </div>`;

  if (isAdmin()) $('#f-user').onchange = e => { f.user = e.target.value; save(); renderPage(); };
  $('#f-channel').onchange = e => { f.channel = e.target.value; save(); renderPage(); };
  $('#btn-add-report').onclick = () => reportForm(null);
  $$('[data-edit]', el).forEach(b => b.onclick = () => reportForm(b.dataset.edit));
  $$('[data-del]', el).forEach(b => b.onclick = () =>
    confirmModal('Xóa báo cáo', 'Xóa dòng báo cáo này? Hành động không hoàn tác được.', () => {
      state.reports = state.reports.filter(r => r.id !== b.dataset.del);
      save(); toast('Đã xóa báo cáo'); renderPage();
    }));
}

function reportForm(id) {
  const editing = id ? state.reports.find(r => r.id === id) : null;
  const ownerId = editing ? editing.userId : (isAdmin() ? (state.users.find(u => u.role === 'staff')?.id) : state.session);
  const staff = state.users.filter(u => u.role === 'staff');

  const accOptions = uId => userAccounts(uId).map(a =>
    `<option value="${a.id}" ${editing?.accountId === a.id ? 'selected' : ''}>${esc(a.name)} (${esc(a.channel)})</option>`).join('');

  openModal(`
    <h2>${editing ? 'Sửa báo cáo ngày' : 'Thêm báo cáo ngày'}</h2>
    <div class="form-grid">
      <div class="field"><label>Ngày</label><input type="date" id="rf-date" value="${editing ? editing.date : todayISO()}"></div>
      ${isAdmin() ? `<div class="field"><label>Nhân viên</label><select id="rf-user">${staff.map(u => `<option value="${u.id}" ${ownerId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>` : ''}
      <div class="field full"><label>Tài khoản quảng cáo</label><select id="rf-account">${accOptions(ownerId)}</select></div>
      <div class="field"><label>Chi phí (₫)</label><input type="number" id="rf-spend" min="0" step="1000" value="${editing ? editing.spend : ''}" placeholder="VD: 2500000"></div>
      <div class="field"><label>Doanh thu (₫)</label><input type="number" id="rf-revenue" min="0" step="1000" value="${editing ? editing.revenue : ''}" placeholder="VD: 8000000"></div>
      <div class="field"><label>Số đơn</label><input type="number" id="rf-orders" min="0" step="1" value="${editing ? editing.orders : ''}" placeholder="VD: 25"></div>
      <div class="field"><label>Ghi chú</label><input type="text" id="rf-note" value="${esc(editing?.note || '')}" placeholder="Không bắt buộc"></div>
    </div>
    <p class="form-error" id="rf-error"></p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="rf-cancel">Hủy</button>
      <button class="btn btn-primary" id="rf-save">${editing ? 'Lưu thay đổi' : 'Thêm báo cáo'}</button>
    </div>`);

  if (isAdmin()) $('#rf-user').onchange = e => { $('#rf-account').innerHTML = accOptions(e.target.value); };
  $('#rf-cancel').onclick = closeModal;
  $('#rf-save').onclick = () => {
    const date = $('#rf-date').value;
    const accountId = $('#rf-account').value;
    const spend = Number($('#rf-spend').value);
    const revenue = Number($('#rf-revenue').value) || 0;
    const orders = Number($('#rf-orders').value) || 0;
    if (!date || !accountId || !(spend >= 0) || $('#rf-spend').value === '') {
      $('#rf-error').textContent = 'Cần nhập đủ ngày, tài khoản và chi phí.';
      return;
    }
    const userId = accById(accountId).userId;
    const rec = { date, userId, accountId, spend, revenue, orders, note: $('#rf-note').value.trim() };
    if (editing) Object.assign(editing, rec);
    else state.reports.push({ id: uid(), ...rec });
    save(); closeModal();
    toast(editing ? 'Đã cập nhật báo cáo' : 'Đã thêm báo cáo');
    if (!date.startsWith(state.ui.month)) { state.ui.month = date.slice(0, 7); $('#month-picker').value = state.ui.month; save(); }
    renderPage();
  };
}

/* ---------------- Trang: Ứng tiền ---------------- */
function renderAdvances(el) {
  const month = state.ui.month;
  const mine = a => a.userId === state.session;
  const listAll = state.advances.slice().sort((a, b) => b.date.localeCompare(a.date));
  const pending = pendingAdvances().filter(a => isAdmin() || mine(a));
  const listMonth = listAll.filter(a => inMonth(a.date, month) && (isAdmin() || mine(a)));

  const pillOf = st => st === 'pending' ? '<span class="pill pill-pending">⏳ Chờ duyệt</span>'
    : st === 'approved' ? '<span class="pill pill-approved">✔ Đã duyệt</span>'
    : '<span class="pill pill-rejected">✖ Từ chối</span>';

  const summaryRows = (isAdmin() ? state.users.filter(u => u.role === 'staff') : [me()]).map(u => {
    const advOk = sum(state.advances.filter(a => a.userId === u.id && a.status === 'approved' && inMonth(a.date, month)), a => a.amount);
    const spent = sum(monthReports(month, u.id), r => r.spend);
    const diff = advOk - spent;
    return `<tr><td>${esc(u.name)}</td><td class="r">${esc(VND(advOk))}</td><td class="r">${esc(VND(spent))}</td>
      <td class="r" style="color:${diff < 0 ? 'var(--bad)' : 'var(--good)'};font-weight:700">${esc(VND(diff))}</td></tr>`;
  }).join('');

  el.innerHTML = `
    <h1 class="page-title">Ứng tiền<small>${esc(monthLabel(month))}</small></h1>
    <div class="toolbar">
      <span class="muted">${isAdmin() ? `${pending.length} đề nghị chờ duyệt` : 'Đề nghị ứng tiền của bạn'}</span>
      <span class="spacer"></span>
      ${isAdmin() ? '' : '<button class="btn btn-primary" id="btn-add-adv">+ Xin ứng tiền</button>'}
    </div>
    ${pending.length ? `
    <div class="card">
      <p class="card-title">Chờ duyệt <span class="muted">(mọi tháng)</span></p>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Ngày</th><th>Nhân viên</th><th class="r">Số tiền</th><th>Lý do</th><th></th></tr></thead>
        <tbody>${pending.map(a => `<tr>
          <td class="num">${esc(fmtDate(a.date))}</td><td>${esc(userById(a.userId)?.name || '—')}</td>
          <td class="r">${esc(VND(a.amount))}</td><td class="muted">${esc(a.reason)}</td>
          <td class="row-actions">${isAdmin()
            ? `<button class="btn btn-primary btn-sm" data-approve="${a.id}">Duyệt</button><button class="btn btn-danger btn-sm" data-reject="${a.id}">Từ chối</button>`
            : `<button class="btn btn-danger btn-sm" data-cancel-adv="${a.id}">Hủy đề nghị</button>`}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}
    <div class="card">
      <p class="card-title">Đối soát: ứng vs đã chi <span class="muted">(${esc(monthLabel(month))})</span></p>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Nhân viên</th><th class="r">Đã ứng (duyệt)</th><th class="r">Đã chi</th><th class="r">Còn lại</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table></div>
    </div>
    <div class="card">
      <p class="card-title">Lịch sử ứng tiền <span class="muted">(${esc(monthLabel(month))})</span></p>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Ngày</th>${isAdmin() ? '<th>Nhân viên</th>' : ''}<th class="r">Số tiền</th><th>Lý do</th><th>Trạng thái</th></tr></thead>
        <tbody>${listMonth.map(a => `<tr>
          <td class="num">${esc(fmtDate(a.date))}</td>
          ${isAdmin() ? `<td>${esc(userById(a.userId)?.name || '—')}</td>` : ''}
          <td class="r">${esc(VND(a.amount))}</td><td class="muted">${esc(a.reason)}</td><td>${pillOf(a.status)}</td>
        </tr>`).join('') || `<tr><td colspan="${isAdmin() ? 5 : 4}" class="empty">Chưa có đề nghị nào trong tháng này.</td></tr>`}</tbody>
      </table></div>
    </div>`;

  const btnAdd = $('#btn-add-adv');
  if (btnAdd) btnAdd.onclick = advanceForm;
  $$('[data-approve]', el).forEach(b => b.onclick = () => {
    const a = state.advances.find(x => x.id === b.dataset.approve);
    a.status = 'approved'; save(); toast('Đã duyệt đề nghị ứng tiền'); renderPage();
  });
  $$('[data-reject]', el).forEach(b => b.onclick = () => {
    const a = state.advances.find(x => x.id === b.dataset.reject);
    a.status = 'rejected'; save(); toast('Đã từ chối đề nghị'); renderPage();
  });
  $$('[data-cancel-adv]', el).forEach(b => b.onclick = () =>
    confirmModal('Hủy đề nghị', 'Hủy đề nghị ứng tiền đang chờ duyệt này?', () => {
      state.advances = state.advances.filter(x => x.id !== b.dataset.cancelAdv);
      save(); toast('Đã hủy đề nghị'); renderPage();
    }));
}

function advanceForm() {
  openModal(`
    <h2>Xin ứng tiền</h2>
    <div class="form-grid">
      <div class="field"><label>Ngày</label><input type="date" id="af-date" value="${todayISO()}"></div>
      <div class="field"><label>Số tiền (₫)</label><input type="number" id="af-amount" min="0" step="100000" placeholder="VD: 20000000"></div>
      <div class="field full"><label>Lý do</label><input type="text" id="af-reason" placeholder="VD: Ứng ngân sách Facebook đợt 2"></div>
    </div>
    <p class="form-error" id="af-error"></p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="af-cancel">Hủy</button>
      <button class="btn btn-primary" id="af-save">Gửi đề nghị</button>
    </div>`);
  $('#af-cancel').onclick = closeModal;
  $('#af-save').onclick = () => {
    const date = $('#af-date').value, amount = Number($('#af-amount').value), reason = $('#af-reason').value.trim();
    if (!date || !(amount > 0) || !reason) { $('#af-error').textContent = 'Cần nhập đủ ngày, số tiền và lý do.'; return; }
    state.advances.push({ id: uid(), date, userId: state.session, amount, reason, status: 'pending' });
    save(); closeModal(); toast('Đã gửi đề nghị ứng tiền'); renderPage();
  };
}

/* ---------------- Trang: Nhân sự (admin) ---------------- */
function renderUsers(el) {
  if (!isAdmin()) { el.innerHTML = '<div class="empty">Chỉ quản lý mới xem được trang này.</div>'; return; }
  const month = state.ui.month;

  el.innerHTML = `
    <h1 class="page-title">Nhân sự & KPI ngân sách<small>${esc(monthLabel(month))}</small></h1>
    <div class="toolbar">
      <span class="muted">Đặt ngân sách theo tháng cho từng nhân viên; quản lý tài khoản quảng cáo.</span>
      <span class="spacer"></span>
      <button class="btn btn-primary" id="btn-add-user">+ Thêm nhân sự</button>
    </div>
    <div class="card">
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Tên</th><th>Vai trò</th><th class="r">TK quảng cáo</th><th class="r">Ngân sách ${esc(monthLabel(month))}</th><th class="r">Đã chi</th><th></th></tr></thead>
        <tbody>${state.users.map(u => {
          const spent = sum(monthReports(month, u.id), r => r.spend);
          const isSelf = u.id === state.session;
          return `<tr>
            <td>${esc(u.name)}${isSelf ? ' <span class="muted">(bạn)</span>' : ''}</td>
            <td><span class="pill pill-role">${u.role === 'admin' ? 'Quản lý' : 'Nhân viên'}</span></td>
            <td class="r">${userAccounts(u.id).length}</td>
            <td class="r">${u.role === 'staff'
              ? `<input type="number" class="num" data-budget="${u.id}" value="${budgetOf(month, u.id) || ''}" min="0" step="1000000" style="width:130px;text-align:right" placeholder="0">`
              : '—'}</td>
            <td class="r">${u.role === 'staff' ? esc(VND(spent)) : '—'}</td>
            <td class="row-actions">
              ${u.role === 'staff' ? `<button class="btn btn-ghost btn-sm" data-accs="${u.id}">Tài khoản</button>` : ''}
              <button class="btn btn-ghost btn-sm" data-resetpass="${u.id}">Reset MK</button>
              ${!isSelf ? `<button class="btn btn-danger btn-sm" data-deluser="${u.id}">Xóa</button>` : ''}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">Sửa ô ngân sách rồi bấm ra ngoài để lưu. Reset MK đưa mật khẩu về 123456.</p>
    </div>`;

  $('#btn-add-user').onclick = userForm;
  $$('[data-budget]', el).forEach(inp => inp.onchange = () => {
    const v = Number(inp.value) || 0;
    if (!state.kpis[month]) state.kpis[month] = {};
    state.kpis[month][inp.dataset.budget] = v;
    save(); toast('Đã lưu ngân sách'); renderPage();
  });
  $$('[data-resetpass]', el).forEach(b => b.onclick = () => {
    userById(b.dataset.resetpass).pass = '123456';
    save(); toast('Đã reset mật khẩu về 123456');
  });
  $$('[data-deluser]', el).forEach(b => b.onclick = () => {
    const u = userById(b.dataset.deluser);
    confirmModal('Xóa nhân sự', `Xóa "${u.name}" cùng toàn bộ báo cáo, tài khoản và đề nghị ứng tiền của họ?`, () => {
      state.users = state.users.filter(x => x.id !== u.id);
      state.accounts = state.accounts.filter(a => a.userId !== u.id);
      state.reports = state.reports.filter(r => r.userId !== u.id);
      state.advances = state.advances.filter(a => a.userId !== u.id);
      for (const m of Object.keys(state.kpis)) delete state.kpis[m][u.id];
      save(); toast('Đã xóa nhân sự'); renderPage();
    });
  });
  $$('[data-accs]', el).forEach(b => b.onclick = () => accountsModal(b.dataset.accs));
}

function userForm() {
  openModal(`
    <h2>Thêm nhân sự</h2>
    <div class="form-grid">
      <div class="field"><label>Tên</label><input type="text" id="uf-name" placeholder="VD: Lan"></div>
      <div class="field"><label>Vai trò</label><select id="uf-role"><option value="staff">Nhân viên</option><option value="admin">Quản lý</option></select></div>
    </div>
    <p class="muted" style="font-size:12.5px">Mật khẩu mặc định: 123456 (người dùng tự đổi sau khi đăng nhập).</p>
    <p class="form-error" id="uf-error"></p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="uf-cancel">Hủy</button>
      <button class="btn btn-primary" id="uf-save">Thêm</button>
    </div>`);
  $('#uf-cancel').onclick = closeModal;
  $('#uf-save').onclick = () => {
    const name = $('#uf-name').value.trim();
    if (!name) { $('#uf-error').textContent = 'Cần nhập tên.'; return; }
    if (state.users.some(u => u.name.toLowerCase() === name.toLowerCase())) {
      $('#uf-error').textContent = 'Tên này đã tồn tại.'; return;
    }
    state.users.push({ id: uid(), name, role: $('#uf-role').value, pass: '123456' });
    save(); closeModal(); toast('Đã thêm nhân sự'); renderPage();
  };
}

function accountsModal(userId) {
  const u = userById(userId);
  const render = () => {
    const accs = userAccounts(userId);
    openModal(`
      <h2>Tài khoản quảng cáo — ${esc(u.name)}</h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Tên tài khoản</th><th>Kênh</th><th></th></tr></thead>
        <tbody>${accs.map(a => `<tr><td>${esc(a.name)}</td><td class="muted">${esc(a.channel)}</td>
          <td class="row-actions"><button class="btn btn-danger btn-sm" data-delacc="${a.id}">Xóa</button></td></tr>`).join('')
          || '<tr><td colspan="3" class="empty">Chưa có tài khoản nào.</td></tr>'}</tbody>
      </table></div>
      <div class="form-grid" style="margin-top:14px">
        <div class="field"><label>Tên tài khoản mới</label><input type="text" id="ac-name" placeholder="VD: FB – ${esc(u.name)} 02"></div>
        <div class="field"><label>Kênh</label><select id="ac-channel">${CHANNELS.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
      </div>
      <p class="form-error" id="ac-error"></p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="ac-close">Đóng</button>
        <button class="btn btn-primary" id="ac-add">+ Thêm tài khoản</button>
      </div>`);
    $('#ac-close').onclick = () => { closeModal(); renderPage(); };
    $('#ac-add').onclick = () => {
      const name = $('#ac-name').value.trim();
      if (!name) { $('#ac-error').textContent = 'Cần nhập tên tài khoản.'; return; }
      state.accounts.push({ id: uid(), userId, name, channel: $('#ac-channel').value });
      save(); render();
    };
    $$('#modal-box [data-delacc]').forEach(b => b.onclick = () => {
      const hasReports = state.reports.some(r => r.accountId === b.dataset.delacc);
      if (hasReports) { $('#ac-error').textContent = 'Tài khoản đã có báo cáo, không xóa được.'; return; }
      state.accounts = state.accounts.filter(a => a.id !== b.dataset.delacc);
      save(); render();
    });
  };
  render();
}

/* ---------------- Trang: Kết nối API Sandbox (admin) ----------------
   Gọi qua /api/proxy của server để tránh CORS. Dùng 2 API trong tài liệu:
   - Contact/GetContactByConditions  → data về trong tháng
   - Danh sách đơn hàng logistic      → đơn hàng trong tháng (userNameMarketing)
   Kết quả chỉ hiển thị/đối chiếu với chi phí, không ghi đè báo cáo. */

const KIEU_NGAY = [
  'NgayTao', 'SaleNgayNhanData', 'SaleTacNghiepNgayCapNhat', 'SaleTacNghiepTiepNgayBatDau',
  'DonHangNgayChot', 'CareDonNgayNhan', 'CareDonNgayTacNghiep', 'NgayDangDon',
  'GiaoHangNgayGiaoHang', 'GiaoHangTrangThaiNgayCapNhat', 'TrangThaiDoiSoatNgay',
];

/* Các đường dẫn cố định theo tài liệu (không cần cấu hình) */
const API_PATHS = {
  chiNhanh: '/partner/api/common/LayListChiNhanh',        // GET
  imei: '/partner/api/SanPhamImei/TimTheoDieuKien',       // POST
  ghiAm: '/partner/api/TongDai/LayFileGhiAm',             // GET + body JSON (đi qua proxy)
};
const TRANG_THAI_IMEI = { 1: 'Đã nhập kho', 2: 'Chưa nhập kho', 3: 'Đã xuất kho', 4: 'Đang chuyển kho' };

let syncCache = { month: null, contacts: null, orders: null, error: null, loading: false, status: '' };

/* Tài liệu Sandbox chỗ ghi "Authorization: Bearer eyJ…", chỗ lại dán JWT thô —
   nên gửi nguyên văn token người dùng dán; nếu bị 401 thì tự thử dạng còn lại
   (thêm/bỏ tiền tố Bearer) và ghi nhớ dạng chạy được. */
async function apiCall(path, data, method = 'POST') {
  const a = state.api;
  const send = async token => {
    const r = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base: a.base, path, token, data, method }),
    });
    return { r, text: await r.text() };
  };
  let { r, text } = await send(a.token);
  if (r.status === 401 && a.token) {
    const toggled = /^Bearer\s+/i.test(a.token)
      ? a.token.replace(/^Bearer\s+/i, '')
      : 'Bearer ' + a.token;
    const retry = await send(toggled);
    if (retry.r.ok) { a.token = toggled; save(); }
    ({ r, text } = retry);
  }
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error('Phản hồi không phải JSON: ' + text.slice(0, 200)); }
  if (!r.ok) throw new Error(json.error || json.message || ('HTTP ' + r.status));
  if (json && json.success === false) throw new Error(json.message || 'API trả về success=false');
  return json;
}

/* API có thể trả mảng trực tiếp hoặc bọc trong data/items — thử lần lượt */
function extractList(res) {
  if (Array.isArray(res)) return res;
  for (const k of ['data', 'items', 'result', 'records', 'listData']) {
    if (Array.isArray(res?.[k])) return res[k];
  }
  if (Array.isArray(res?.data?.items)) return res.data.items;
  if (res?.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
    for (const v of Object.values(res.data)) if (Array.isArray(v)) return v;
  }
  return [];
}

async function fetchAllPages(path, bodyBase, onProgress, maxPages = 30) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    onProgress(`trang ${page}…`);
    const res = await apiCall(path, { ...bodyBase, pageInfo: { page, pageSize: 100 }, sorts: [] });
    const list = extractList(res);
    all.push(...list);
    if (list.length < 100) break;
  }
  return all;
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    tuNgay: `${month}-01T00:00:00+07:00`,
    denNgay: `${month}-${pad2(lastDay)}T23:59:59+07:00`,
  };
}

async function doSync() {
  const a = state.api;
  if (!a.idChiNhanh || !a.token) {
    toast('Cần nhập token và idChiNhanh trước khi đồng bộ');
    return;
  }
  const month = state.ui.month;
  const range = monthRange(month);
  syncCache = { month, contacts: null, orders: null, error: null, loading: true, status: 'Bắt đầu…' };
  renderPage();
  const setStatus = s => {
    syncCache.status = s;
    const el = $('#sync-status');
    if (el) el.textContent = s;
  };
  try {
    setStatus('Đang tải contact (data về)…');
    syncCache.contacts = await fetchAllPages(a.contactPath, {
      idChiNhanh: a.idChiNhanh, keyWord: '', kieuNgay: a.contactKieuNgay, ...range,
    }, s => setStatus('Đang tải contact — ' + s));

    // Đơn hàng lỗi thì vẫn tiếp tục: contact có sẵn các trường lgt* để suy ra đơn
    try {
      setStatus('Đang tải đơn hàng…');
      syncCache.orders = await fetchAllPages(a.orderPath, {
        idChiNhanh: a.idChiNhanh, keyWord: '', kieuNgay: a.orderKieuNgay, ...range,
      }, s => setStatus('Đang tải đơn hàng — ' + s));
      syncCache.ordersError = null;
    } catch (err) {
      syncCache.orders = [];
      syncCache.ordersError = err.message;
    }

    syncCache.loading = false;
    syncCache.status = '';
    toast(`Đã tải ${syncCache.contacts.length} contact, ${syncCache.orders.length} đơn`);
  } catch (err) {
    syncCache.loading = false;
    syncCache.error = err.message;
  }
  renderPage();
}

const groupCount = (list, keyFn) => {
  const m = new Map();
  for (const x of list) {
    const k = keyFn(x) || '—';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

function renderSync(el) {
  if (!isAdmin()) { el.innerHTML = '<div class="empty">Chỉ quản lý mới xem được trang này.</div>'; return; }
  const a = state.api;
  const month = state.ui.month;
  const kieuNgayOpts = sel => KIEU_NGAY.map(k => `<option ${k === sel ? 'selected' : ''}>${k}</option>`).join('');

  const hasData = syncCache.month === month && (syncCache.contacts || syncCache.orders);
  const contacts = hasData ? (syncCache.contacts || []) : [];
  const orders = hasData ? (syncCache.orders || []) : [];
  const monthRows = monthReports(month);
  const totalSpend = sum(monthRows, r => r.spend);

  let resultHTML = '';
  if (syncCache.loading) {
    resultHTML = `<div class="card"><p class="card-title">Đang đồng bộ…</p><p class="muted" id="sync-status">${esc(syncCache.status)}</p></div>`;
  } else if (syncCache.error) {
    resultHTML = `<div class="card"><p class="card-title">Lỗi đồng bộ</p><p class="form-error" style="display:block">${esc(syncCache.error)}</p>
      <p class="muted" style="font-size:12.5px">Kiểm tra lại token, idChiNhanh và đường dẫn API (cột API trong tài liệu Google Sheet).</p></div>`;
  } else if (hasData) {
    /* Chuẩn hoá đơn hàng theo response GetOrderLogisticByConditions:
       tên user marketing nằm trong donHangLogisticInfo, tiền/trạng thái ở cấp ngoài.
       Không có đơn từ API thì suy ra từ các trường lgt* của contact. */
    const ordNorm = o => {
      const i = o.donHangLogisticInfo || {};
      return {
        mktName: i.userDisplayMarketing || i.userNameMarketing || o.userDisplayMarketing || o.userNameMarketing || '—',
        idContact: i.idContact || o.contactId || '',
        chot: o.donHangTrangThaiChotDon === 1,
        thuKhach: Number(o.donHangTienThuKhach) || 0,
        ngayChot: String(o.donHangNgayChot || o.ngayTao || '').slice(0, 10),
        trangThaiGH: o.giaoHangTrangThaiTen || i.giaoHangTenTrangThai || '—',
      };
    };
    let ordersN = orders.map(ordNorm);
    const contactsById = new Map(contacts.map(c => [c.id, c]));
    // Ghép id user marketing (trên contact) với tên (trên đơn) qua idContact
    const mktIdToName = new Map();
    for (const o of ordersN) {
      const c = contactsById.get(o.idContact);
      if (c?.marketingUserId && o.mktName !== '—') mktIdToName.set(c.marketingUserId, o.mktName);
    }
    const nameOfMktId = id => mktIdToName.get(id) || (id ? id.slice(0, 8) + '…' : '—');
    if (!ordersN.length) {
      ordersN = contacts.filter(c => c.lgtIdDonHang).map(c => ({
        mktName: nameOfMktId(c.marketingUserId),
        idContact: c.id,
        chot: c.lgtDonHangTrangThaiChotDon === 1,
        thuKhach: Number(c.lgtDonHangTienThuKhach) || 0,
        ngayChot: String(c.lgtDonHangNgayChot || '').slice(0, 10),
        trangThaiGH: c.lgtGiaoHangTrangThaiTen || '—',
      }));
    }
    const donChot = ordersN.filter(o => o.chot);
    const revenue = sum(donChot, o => o.thuKhach);

    // Gộp theo user marketing: data về (contact) + đơn chốt + doanh thu (đơn)
    const byMkt = new Map();
    const mktOf = name => {
      let g = byMkt.get(name);
      if (!g) { g = { data: 0, don: 0, dt: 0 }; byMkt.set(name, g); }
      return g;
    };
    for (const c of contacts) mktOf(nameOfMktId(c.marketingUserId)).data++;
    for (const o of donChot) { const g = mktOf(o.mktName); g.don++; g.dt += o.thuKhach; }
    const staff = state.users.filter(u => u.role === 'staff');
    const mktRows = [...byMkt.entries()].sort((x, y) => y[1].data - x[1].data).map(([name, g]) => {
      const mappedId = a.userMap[name] || '';
      const spend = mappedId ? sum(monthRows.filter(r => r.userId === mappedId), r => r.spend) : 0;
      return `<tr>
        <td>${esc(name)}</td>
        <td class="r">${g.data.toLocaleString('vi-VN')}</td>
        <td class="r">${g.don.toLocaleString('vi-VN')}</td>
        <td class="r">${esc(pctStr(g.don, g.data))}</td>
        <td class="r">${esc(VND(g.dt))}</td>
        <td><select data-map="${esc(name)}"><option value="">— chưa ghép —</option>${staff.map(u =>
          `<option value="${u.id}" ${mappedId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></td>
        <td class="r">${mappedId ? esc(VND(spend)) : '—'}</td>
        <td class="r">${mappedId && g.data ? esc(VND(spend / g.data)) : '—'}</td>
        <td class="r">${mappedId && g.don ? esc(VND(spend / g.don)) : '—'}</td>
        <td class="r">${mappedId ? esc(pctStr(spend, g.dt)) : '—'}</td>
      </tr>`;
    }).join('');

    const bySource = groupCount(contacts, c => c.nguonDuLieu);
    const byShip = groupCount(ordersN, o => o.trangThaiGH);
    const sample = obj => obj ? `<details class="json-preview"><summary class="muted">Xem bản ghi mẫu (JSON)</summary><pre>${esc(JSON.stringify(obj, null, 2))}</pre></details>` : '';

    resultHTML = `
      ${syncCache.ordersError ? `<div class="card"><p class="muted" style="margin:0">⚠ Không tải được API đơn hàng (${esc(syncCache.ordersError)}) — số đơn/doanh thu bên dưới suy ra từ trường lgt* của contact.</p></div>` : ''}
      <div class="tiles">
        ${tileHTML('Data về (contact)', contacts.length.toLocaleString('vi-VN'), null)}
        ${tileHTML('Đơn chốt', donChot.length.toLocaleString('vi-VN'),
          { text: `tỷ lệ chốt ${pctStr(donChot.length, contacts.length)}`, cls: '' })}
        ${tileHTML('Doanh thu (thu khách)', VND(revenue), null)}
        ${tileHTML('Chi phí tháng (app)', VND(totalSpend), null)}
        ${tileHTML('Chi phí / data', contacts.length ? VND(totalSpend / contacts.length) : '—', null)}
        ${tileHTML('Chi phí / đơn chốt', donChot.length ? VND(totalSpend / donChot.length) : '—', null)}
      </div>
      <div class="card">
        <p class="card-title">Data về & đơn chốt theo ngày</p>
        <div id="sync-daily-chart"></div>
      </div>
      <div class="card">
        <p class="card-title">Theo user marketing <span class="muted">(ghép với nhân sự trong app để đối chiếu chi phí)</span></p>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>User marketing (API)</th><th class="r">Data về</th><th class="r">Đơn chốt</th><th class="r">Tỷ lệ chốt</th><th class="r">Doanh thu</th><th>Ghép nhân sự</th><th class="r">Chi phí</th><th class="r">CP/data</th><th class="r">CP/đơn</th><th class="r">% CP/DT</th></tr></thead>
          <tbody>${mktRows || '<tr><td colspan="10" class="empty">Không có dữ liệu trong tháng này.</td></tr>'}</tbody>
        </table></div>
        ${sample(orders[0])}
      </div>
      <div class="grid-2">
        <div class="card">
          <p class="card-title">Data về theo nguồn</p>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Nguồn dữ liệu</th><th class="r">Số data</th><th class="r">% tổng</th></tr></thead>
            <tbody>${bySource.map(([src, n]) =>
              `<tr><td>${esc(src)}</td><td class="r">${n.toLocaleString('vi-VN')}</td><td class="r">${esc(pctStr(n, contacts.length))}</td></tr>`).join('')
              || '<tr><td colspan="3" class="empty">Không có data nào trong tháng này.</td></tr>'}</tbody>
          </table></div>
          ${sample(contacts[0])}
        </div>
        <div class="card">
          <p class="card-title">Đơn hàng theo trạng thái giao hàng</p>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Trạng thái</th><th class="r">Số đơn</th></tr></thead>
            <tbody>${byShip.map(([st, n]) =>
              `<tr><td>${esc(st)}</td><td class="r">${n.toLocaleString('vi-VN')}</td></tr>`).join('')
              || '<tr><td colspan="2" class="empty">Không có đơn nào trong tháng này.</td></tr>'}</tbody>
          </table></div>
        </div>
      </div>`;

    // Vẽ biểu đồ ngày sau khi el.innerHTML gán xong (dựng chart cần element tồn tại)
    syncCache._drawDaily = () => {
      const box = $('#sync-daily-chart');
      if (!box) return;
      const [yy, mm] = month.split('-').map(Number);
      const days = new Date(yy, mm, 0).getDate();
      const labels = [], dataD = new Array(days).fill(0), donD = new Array(days).fill(0);
      for (let d = 1; d <= days; d++) labels.push(pad2(d));
      for (const c of contacts) {
        const iso = String(c.ngayTao || '').slice(0, 10);
        if (iso.startsWith(month)) dataD[Number(iso.slice(8)) - 1]++;
      }
      for (const o of donChot) {
        if (o.ngayChot.startsWith(month)) donD[Number(o.ngayChot.slice(8)) - 1]++;
      }
      const fmtN = n => (Math.round(n) || 0).toLocaleString('vi-VN');
      lineChart(box, labels, [
        { name: 'Data về', color: cssVar('--s1'), values: dataD },
        { name: 'Đơn chốt', color: cssVar('--s2'), values: donD },
      ], { fmt: fmtN, fmtShort: fmtN });
    };
  } else {
    resultHTML = '<div class="empty">Chưa có dữ liệu — nhập cấu hình rồi bấm "Đồng bộ".</div>';
  }

  el.innerHTML = `
    <h1 class="page-title">Kết nối API Sandbox<small>đối chiếu data về & đơn hàng với chi phí ${esc(monthLabel(month))}</small></h1>
    <div class="card">
      <p class="card-title">Cấu hình kết nối <span class="muted">(lưu trên trình duyệt này)</span></p>
      <div class="form-grid">
        <div class="field"><label>Base URL</label><input type="text" id="api-base" value="${esc(a.base)}"></div>
        <div class="field"><label>Chi nhánh <span class="muted">(idChiNhanh)</span></label>
          <div style="display:flex;gap:6px">
            ${a.branches?.length
              ? `<select id="api-chinhanh-sel" style="flex:1">${
                  (a.branches.some(b => b.id === a.idChiNhanh) || !a.idChiNhanh ? '' :
                    `<option value="${esc(a.idChiNhanh)}" selected>${esc(a.idChiNhanh.slice(0, 12))}… (nhập tay)</option>`) +
                  a.branches.map(b => `<option value="${esc(b.id)}" ${b.id === a.idChiNhanh ? 'selected' : ''}>${esc(b.ten)}</option>`).join('')
                }</select>`
              : `<input type="text" id="api-chinhanh" value="${esc(a.idChiNhanh)}" placeholder="Bấm nút tải, hoặc dán GUID" style="flex:1">`}
            <button class="btn btn-sm" id="btn-load-branches" title="Gọi API LayListChiNhanh">⟳ Tải</button>
          </div>
        </div>
        <div class="field full"><label>Token (Authorization)</label><input type="password" id="api-token" value="${esc(a.token)}" placeholder="Dán token — có hay không có chữ Bearer đều được, app tự thử cả hai"></div>
        <div class="field full"><label>Đường dẫn API contact</label><input type="text" id="api-contactpath" value="${esc(a.contactPath)}"></div>
        <div class="field full"><label>Đường dẫn API đơn hàng</label><input type="text" id="api-orderpath" value="${esc(a.orderPath)}"></div>
        <div class="field"><label>Kiểu ngày lọc contact</label><select id="api-contactkieu">${kieuNgayOpts(a.contactKieuNgay)}</select></div>
        <div class="field"><label>Kiểu ngày lọc đơn hàng</label><select id="api-orderkieu">${kieuNgayOpts(a.orderKieuNgay)}</select></div>
      </div>
    </div>
    <div class="toolbar">
      <span class="muted">Tải tối đa 100 bản ghi/trang, tự lặp qua các trang cho cả tháng.</span>
      <span class="spacer"></span>
      <button class="btn btn-primary" id="btn-sync" ${syncCache.loading ? 'disabled' : ''}>⟳ Đồng bộ ${esc(monthLabel(month))}</button>
    </div>
    ${resultHTML}
    <div class="grid-2">
      <div class="card">
        <p class="card-title">Tra cứu IMEI kho <span class="muted">(SanPhamImei/TimTheoDieuKien)</span></p>
        <div class="toolbar" style="margin-bottom:10px">
          <input type="text" id="imei-kw" placeholder="IMEI / tên / mã sản phẩm" style="flex:1;min-width:140px">
          <select id="imei-tt">
            <option value="">Mọi trạng thái</option>
            ${Object.entries(TRANG_THAI_IMEI).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" id="btn-imei">Tìm</button>
        </div>
        <div id="imei-results"><div class="empty">Nhập từ khóa rồi bấm Tìm.</div></div>
      </div>
      <div class="card">
        <p class="card-title">Ghi âm cuộc gọi <span class="muted">(TongDai/LayFileGhiAm)</span></p>
        <div class="toolbar" style="margin-bottom:10px">
          <input type="tel" id="ga-phone" placeholder="SĐT khách hàng" style="flex:1;min-width:140px">
          <select id="ga-type"><option value="SIM_SO">Tổng đài SIM số</option><option value="IP">Tổng đài IP</option></select>
          <button class="btn btn-primary btn-sm" id="btn-ghiam">Tìm</button>
        </div>
        <div id="ga-results"><div class="empty">Nhập số điện thoại rồi bấm Tìm.</div></div>
      </div>
    </div>`;

  // Lưu cấu hình khi sửa
  const bind = (id, key) => { const el2 = $(id); if (el2) el2.onchange = e => { a[key] = e.target.value.trim(); save(); }; };
  bind('#api-base', 'base');
  bind('#api-chinhanh', 'idChiNhanh');
  bind('#api-chinhanh-sel', 'idChiNhanh');
  bind('#api-token', 'token');
  bind('#api-contactpath', 'contactPath');
  bind('#api-orderpath', 'orderPath');
  bind('#api-contactkieu', 'contactKieuNgay');
  bind('#api-orderkieu', 'orderKieuNgay');

  if (syncCache._drawDaily) { syncCache._drawDaily(); syncCache._drawDaily = null; }

  // Tải danh sách chi nhánh (GET LayListChiNhanh) → dropdown thay vì dán GUID
  $('#btn-load-branches').onclick = async () => {
    if (!a.token) { toast('Cần dán token trước'); return; }
    const btn = $('#btn-load-branches');
    btn.disabled = true; btn.textContent = '…';
    try {
      const res = await apiCall(API_PATHS.chiNhanh, null, 'GET');
      const list = extractList(res).filter(b => b.suDung !== false);
      if (!list.length) throw new Error('API không trả về chi nhánh nào');
      a.branches = list.map(b => ({ id: b.id, ten: b.tenChiNhanh || b.id }));
      if (!a.branches.some(b => b.id === a.idChiNhanh)) a.idChiNhanh = a.branches[0].id;
      save();
      toast(`Đã tải ${a.branches.length} chi nhánh`);
      renderPage();
    } catch (err) {
      btn.disabled = false; btn.textContent = '⟳ Tải';
      toast('Lỗi tải chi nhánh: ' + err.message);
    }
  };

  // Tra cứu IMEI kho
  $('#btn-imei').onclick = async () => {
    const out = $('#imei-results');
    if (!a.token) { toast('Cần dán token trước'); return; }
    out.innerHTML = '<div class="empty">Đang tìm…</div>';
    try {
      const res = await apiCall(API_PATHS.imei, {
        pageInfo: { page: 1, pageSize: 100 }, sorts: [],
        keyword: $('#imei-kw').value.trim() || null,
        maNhaCungCap: null,
        trangThaiImei: Number($('#imei-tt').value) || null,
        idNhomSanPham: null, idSanPhamCha: null, idSanPham: null, idKho: null,
        idChiNhanh: a.idChiNhanh || null,
      });
      const list = extractList(res);
      out.innerHTML = list.length ? `
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Sản phẩm</th><th>IMEI</th><th>NCC</th><th>Trạng thái</th><th class="r">Ngày tạo</th></tr></thead>
          <tbody>${list.map(x => `<tr>
            <td>${esc(x.tenSanPham || '—')}<br><span class="muted" style="font-size:12px">${esc(x.ma || '')}</span></td>
            <td class="num">${esc(x.imei || '—')}</td>
            <td class="muted">${esc(x.maNhaCungCap || '—')}</td>
            <td>${esc(x.trangThaiText || TRANG_THAI_IMEI[x.trangThai] || '—')}</td>
            <td class="r num">${x.ngayTao ? esc(fmtDate(String(x.ngayTao).slice(0, 10))) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table></div>
        <p class="muted" style="font-size:12px;margin:8px 0 0">${list.length} bản ghi (tối đa 100/trang).</p>`
        : '<div class="empty">Không tìm thấy IMEI nào.</div>';
    } catch (err) {
      out.innerHTML = `<p class="form-error" style="display:block;text-align:left">${esc(err.message)}</p>`;
    }
  };
  $('#imei-kw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-imei').click(); });

  // Tra cứu ghi âm cuộc gọi theo SĐT khách
  $('#btn-ghiam').onclick = async () => {
    const out = $('#ga-results');
    const phone = $('#ga-phone').value.trim();
    if (!a.token) { toast('Cần dán token trước'); return; }
    if (!phone) { toast('Cần nhập số điện thoại khách'); return; }
    out.innerHTML = '<div class="empty">Đang tìm…</div>';
    try {
      const res = await apiCall(API_PATHS.ghiAm, {
        contactIds: [], donHangIds: [],
        phoneCustomer: phone,
        typeTongDai: $('#ga-type').value,
        pageIndex: 1, pageSize: 100,
      }, 'GET');
      const list = extractList(res);
      out.innerHTML = list.length ? `
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Loại</th><th>Nhân viên</th><th>Nghe lại</th></tr></thead>
          <tbody>${list.map(x => `<tr>
            <td>${x.type === 'OUTGOING_CALL' ? 'Gọi đi' : x.type === 'INCOMING_CALL' ? 'Gọi đến' : esc(x.type || '—')}</td>
            <td>${esc(x.ten || x.userName || '—')}<br><span class="muted" style="font-size:12px">${esc(x.hotline || '')}</span></td>
            <td>${x.recordFile ? `<audio controls preload="none" src="${esc(x.recordFile)}" style="width:200px;height:32px"></audio>` : '—'}</td>
          </tr>`).join('')}</tbody>
        </table></div>
        <p class="muted" style="font-size:12px;margin:8px 0 0">${list.length} cuộc gọi với số ${esc(phone)}.</p>`
        : '<div class="empty">Không có ghi âm nào với số này.</div>';
    } catch (err) {
      out.innerHTML = `<p class="form-error" style="display:block;text-align:left">${esc(err.message)}</p>`;
    }
  };
  $('#ga-phone').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-ghiam').click(); });

  $('#btn-sync').onclick = doSync;
  $$('[data-map]', el).forEach(sel => sel.onchange = () => {
    if (sel.value) a.userMap[sel.dataset.map] = sel.value;
    else delete a.userMap[sel.dataset.map];
    save(); renderPage();
  });
}

/* ---------------- Đổi mật khẩu ---------------- */
function changePassForm() {
  openModal(`
    <h2>Đổi mật khẩu</h2>
    <div class="form-grid">
      <div class="field full"><label>Mật khẩu hiện tại</label><input type="password" id="cp-old" autocomplete="current-password"></div>
      <div class="field"><label>Mật khẩu mới</label><input type="password" id="cp-new" autocomplete="new-password"></div>
      <div class="field"><label>Nhập lại</label><input type="password" id="cp-new2" autocomplete="new-password"></div>
    </div>
    <p class="form-error" id="cp-error"></p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cp-cancel">Hủy</button>
      <button class="btn btn-primary" id="cp-save">Đổi mật khẩu</button>
    </div>`);
  $('#cp-cancel').onclick = closeModal;
  $('#cp-save').onclick = () => {
    const u = me();
    if ($('#cp-old').value !== u.pass) { $('#cp-error').textContent = 'Mật khẩu hiện tại không đúng.'; return; }
    const nw = $('#cp-new').value;
    if (nw.length < 4) { $('#cp-error').textContent = 'Mật khẩu mới cần ít nhất 4 ký tự.'; return; }
    if (nw !== $('#cp-new2').value) { $('#cp-error').textContent = 'Hai lần nhập không khớp.'; return; }
    u.pass = nw; save(); closeModal(); toast('Đã đổi mật khẩu');
  };
}

/* ---------------- Khởi động ---------------- */
function boot() {
  load();

  $('#login-btn').onclick = doLogin;
  $('#login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#btn-logout').onclick = doLogout;
  $('#btn-changepass').onclick = changePassForm;

  $('#main-tabs').addEventListener('click', e => {
    const t = e.target.closest('.tab');
    if (!t) return;
    currentPage = t.dataset.page;
    setActiveTab();
    renderPage();
  });

  $('#month-picker').addEventListener('change', e => {
    if (!e.target.value) return;
    state.ui.month = e.target.value;
    save();
    renderPage();
  });

  let rzTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => { if (state.session) renderPage(); }, 200);
  });

  if (state.session && me()) enterApp();
  else { renderLoginSelect(); $('#login-screen').classList.remove('hidden'); }
}

boot();
