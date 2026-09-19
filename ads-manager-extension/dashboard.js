const $ = id => document.getElementById(id);
let DATA = null, BM = null, PAGES = null;
let SUB = 'ca-nhan';
let NOTES = {};
let RANGE = null, SPEND = {};
let SORT = { key: null, dir: 1 };
let PSORT = { key: null, dir: 1 };
let HIDDEN = new Set();       // key các cột đang ẩn
let WIDTHS = {};             // độ rộng cột do người dùng chỉnh
let RESIZING = null;         // trạng thái đang kéo giãn cột
let JUST_RESIZED_AT = 0;     // mốc thời gian vừa kéo xong (bỏ qua click sắp xếp)
let TARGET = '';              // tiền tệ quy đổi ('' = tiền gốc)
let RATES = null;            // tỉ giá đơn vị / 1 USD

const fmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const money = v => (v === null || v === undefined) ? '' : fmt.format(v);
const ZERO_DEC = new Set(['VND', 'JPY', 'KRW', 'TWD', 'CLP', 'HUF', 'IDR', 'PYG']);
const STATIC_RATES = { USD: 1, VND: 25400, EUR: 0.92, GBP: 0.78, THB: 36, SGD: 1.35, JPY: 150, CNY: 7.2, KRW: 1350, AUD: 1.5 };
function rateOf(cur) { return (RATES && RATES[cur]) || STATIC_RATES[cur]; }
function convVal(v, src) {
  if (v === null || v === undefined) return null;
  if (!TARGET || TARGET === src) return v;
  const rs = rateOf(src), rt = rateOf(TARGET);
  if (!rs || !rt) return v;
  return v / rs * rt;
}
function fmtCur(v, cur) {
  if (v === null || v === undefined) return '';
  const d = ZERO_DEC.has(cur) ? 0 : 2;
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(v);
}
// Hiển thị một số tiền của tài khoản a, tự quy đổi nếu đang chọn tiền tệ đích.
const mval = (a, v) => fmtCur(convVal(v, a.currency), TARGET || a.currency);
const curOf = a => TARGET || a.currency;
const shortDate = s => s ? new Date(s).toLocaleDateString('vi-VN') : '';
const adsManagerUrl = accId => `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accId}`;
const billingUrl = accId => `https://business.facebook.com/latest/billing_hub/accounts/details/?asset_id=${accId}&placement=campaign_manager`;
const settingsUrl = (accId, bizId) => `https://adsmanager.facebook.com/adsmanager/manage/ad_account_settings/ad_account_setup?act=${accId}${bizId ? `&business_id=${bizId}` : ''}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csv = s => `"${String(s).replace(/"/g, '""')}"`;

// ==== Định nghĩa cột (bảng tài khoản) ====
// fixed: luôn hiện, không cho ẩn. num: canh phải. sumKey: cột có cộng tổng.
const COLUMNS = [
  { key: 'status', label: 'TT', cls: 'col-tt', fixed: true, sort: 'statusLabel', w: 130, noresize: true,
    cell: a => `<span class="status ${a.statusKind}"><span class="dot"></span>${a.statusLabel}</span>` },
  { key: 'account', label: 'Tài khoản', cls: 'col-acc', fixed: true, sort: 'name', w: 260,
    cell: a => `<div class="acc-head"><a class="acc-name lnk" href="${adsManagerUrl(esc(a.accountId))}" target="_blank" rel="noopener" title="${esc(a.name)}">${esc(a.name)}</a><button class="dots" data-id="${esc(a.id)}" title="Tùy chọn">⋯</button></div><div class="acc-id trunc">${esc(a.accountId)}${a.business ? ' · ' + esc(a.business) : ''}</div>`,
    foot: rows => `${rows.length} tài khoản quảng cáo` },
  { key: 'rootId', label: 'ID gốc', sort: 'rootId', w: 185,
    cell: a => a.rootId ? `${esc(a.rootId)} <span class="muted">${esc(a.rootType)}</span>` : '' },
  { key: 'balance', label: 'Số dư', num: true, sort: 'balance', sumKey: 'balance', w: 120,
    cell: a => a.balance === null ? '' : `<a class="lnk" href="${billingUrl(esc(a.accountId))}" target="_blank" rel="noopener" title="Mở trang thanh toán / hóa đơn của TK">${mval(a, a.balance)}</a>` },
  { key: 'threshold', label: 'Ngưỡng', num: true, sort: 'threshold', sumKey: 'threshold', w: 120,
    cell: a => a.threshold === null ? '' : `<a class="lnk" href="${settingsUrl(esc(a.accountId), a.businessId)}" target="_blank" rel="noopener" title="Mở Thiết lập tài khoản quảng cáo">${mval(a, a.threshold)}</a>` },
  { key: 'thresholdLeft', label: 'Ngưỡng còn lại', num: true, sort: 'thresholdLeft', sumKey: 'thresholdLeft', w: 130,
    cell: a => { const low = a.thresholdLeft !== null && a.threshold !== null && a.thresholdLeft <= a.threshold * 0.2; return `<span class="${low ? 'low' : ''}">${mval(a, a.thresholdLeft)}</span>`; } },
  { key: 'spendCap', label: 'Limit', num: true, sort: 'spendCap', sumKey: 'spendCap', w: 115,
    cell: a => a.spendCap === null ? '<span class="muted">No limit</span>' : mval(a, a.spendCap) },
  { key: 'spent', label: 'Tổng tiêu', num: true, sort: 'spent', dyn: true, sumSpent: true, w: 120,
    cell: a => { const sp = spent(a); return sp === undefined ? '<span class="muted">…</span>' : (sp === null ? '<span class="muted">lỗi</span>' : mval(a, sp)); } },
  { key: 'accountType', label: 'Loại tài khoản', sort: 'accountType', w: 115, cell: a => esc(a.accountType || '') },
  { key: 'payment', label: 'Thẻ thanh toán', sort: 'payment', w: 140, cell: a => esc(a.payment || '') },
  { key: 'nextBill', label: 'Ngày lập hóa đơn', sort: 'nextBill', w: 130, cell: a => a.nextBill ? shortDate(a.nextBill) : '' },
  { key: 'hiddenAdmins', label: 'Quản trị viên ẩn', num: true, sort: 'hiddenAdmins', w: 120, cell: a => a.hiddenAdmins == null ? '' : a.hiddenAdmins },
  { key: 'timezone', label: 'Múi giờ', sort: 'timezone', w: 140, cell: a => esc(a.timezone || '') },
  { key: 'disableReason', label: 'Lý do VHH', sort: 'disableReason', w: 170, cell: a => esc(a.disableReason || '') },
  { key: 'createdTime', label: 'Ngày tạo', sort: 'createdTime', w: 105, cell: a => shortDate(a.createdTime) },
  { key: 'note', label: 'Ghi chú', sort: 'note', w: 160, cell: a => `<input class="note-input" data-id="${esc(a.id)}" value="${esc(NOTES[a.id] || '')}" placeholder="…">` },
  { key: 'currency', label: 'Tiền tệ', sort: 'currency', w: 90, cell: a => esc(curOf(a)) },
  { key: 'role', label: 'Quyền', sort: 'role', w: 115, cell: a => esc(a.role) }
];
// Ẩn mặc định vài cột ít dùng để bảng gọn khi mở lần đầu
const DEFAULT_HIDDEN = ['nextBill', 'hiddenAdmins', 'timezone'];

init();

async function init() {
  const stored = await chrome.storage.local.get(['lastData', 'notes', 'alertsEnabled', 'hiddenCols', 'colWidths']);
  NOTES = stored.notes || {};
  $('alerts').checked = !!stored.alertsEnabled;
  HIDDEN = new Set(stored.hiddenCols || DEFAULT_HIDDEN);
  WIDTHS = stored.colWidths || {};
  buildColPanel();
  setupResize();
  if (stored.lastData) { DATA = stored.lastData; render(); }
  load(false);

  $('reload').addEventListener('click', () => { load(true); if (SUB === 'bm') loadBM(); if (SUB === 'page') loadPages(); });
  $('search').addEventListener('input', render);
  $('statusFilter').addEventListener('change', render);
  $('exportCsv').addEventListener('click', exportCsv);
  $('datePreset').addEventListener('change', onPresetChange);
  $('applyDate').addEventListener('click', applyCustomRange);
  $('alerts').addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'setAlerts', enabled: $('alerts').checked });
    showNotice($('alerts').checked ? 'Đã bật cảnh báo — kiểm tra mỗi 30 phút và báo khi TK bị vô hiệu hóa hoặc sắp chạm ngưỡng.' : 'Đã tắt cảnh báo.');
    setTimeout(hideNotice, 4000);
  });

  $('colBtn').addEventListener('click', e => { e.stopPropagation(); $('colPanel').hidden = !$('colPanel').hidden; });
  document.addEventListener('click', e => { if (!$('colPanel').hidden && !$('colPanel').contains(e.target) && e.target !== $('colBtn')) $('colPanel').hidden = true; });

  $('currency').addEventListener('change', () => { TARGET = $('currency').value; render(); });
  chrome.runtime.sendMessage({ type: 'getRates' }, res => { if (res && res.ok) { RATES = res.data; if (TARGET) render(); } });
  setupRenameMenu();

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    $('panel-fb').hidden = t.dataset.tab !== 'fb';
    $('panel-gg').hidden = t.dataset.tab !== 'gg';
  }));
  document.querySelectorAll('.subtab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.subtab').forEach(x => x.classList.toggle('active', x === t));
    SUB = t.dataset.sub;
    $('wrap-acc').hidden = SUB === 'page'; $('foot-note').hidden = SUB === 'page'; $('wrap-page').hidden = SUB !== 'page';
    $('colBtn').style.display = SUB === 'page' ? 'none' : '';
    if (SUB === 'bm' && !BM) loadBM();
    if (SUB === 'page' && !PAGES) loadPages();
    render();
  }));
  document.querySelectorAll('#tbl-page th.sortable').forEach(th => th.addEventListener('click', () => {
    const key = th.dataset.pkey;
    if (PSORT.key === key) PSORT.dir = -PSORT.dir; else { PSORT.key = key; PSORT.dir = key === 'fans' ? -1 : 1; }
    render();
  }));
}

// ==== Kéo giãn độ rộng cột ====
function startResize(e) {
  e.preventDefault(); e.stopPropagation();
  const key = e.target.dataset.key;
  const col = COLUMNS.find(c => c.key === key);
  RESIZING = { key, startX: e.clientX, startW: WIDTHS[key] || (col && col.w) || 120 };
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}
function setupResize() {
  document.addEventListener('mousemove', e => {
    if (!RESIZING) return;
    const w = Math.max(60, RESIZING.startW + (e.clientX - RESIZING.startX));
    WIDTHS[RESIZING.key] = w;
    const colEl = $('colgroup').querySelector(`col[data-key="${RESIZING.key}"]`);
    if (colEl) colEl.style.width = w + 'px';
    const cols = visibleColumns();
    $('tbl').style.width = cols.reduce((s, c) => s + (WIDTHS[c.key] || c.w || 120), 0) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!RESIZING) return;
    RESIZING = null;
    JUST_RESIZED_AT = Date.now();
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    chrome.storage.local.set({ colWidths: WIDTHS });
  });
}

// ==== Menu ⋯ đổi tên tài khoản ====
function setupRenameMenu() {
  const menu = document.createElement('div');
  menu.className = 'rowmenu'; menu.hidden = true;
  menu.innerHTML = '<button class="rowmenu-item" data-act="rename">✎ Đổi tên TKQC</button>';
  document.body.appendChild(menu);

  $('rows').addEventListener('click', e => {
    const dots = e.target.closest('.dots');
    if (!dots) return;
    e.preventDefault(); e.stopPropagation();
    menu.dataset.id = dots.dataset.id;
    const r = dots.getBoundingClientRect();
    menu.hidden = false;
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = Math.min(r.left, window.innerWidth - 180) + 'px';
  });
  document.addEventListener('click', e => { if (!menu.contains(e.target) && !e.target.closest('.dots')) menu.hidden = true; });

  menu.querySelector('[data-act="rename"]').addEventListener('click', () => {
    const id = menu.dataset.id;
    menu.hidden = true;
    const acc = currentAccounts().find(a => a.id === id);
    if (!acc) return;
    const name = prompt('Đổi tên tài khoản quảng cáo:', acc.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === acc.name) return;
    showNotice('Đang đổi tên…');
    chrome.runtime.sendMessage({ type: 'renameAccount', id, name: trimmed }, res => {
      if (!res || !res.ok) { showNotice((res && res.error) || 'Đổi tên thất bại', true); return; }
      acc.name = trimmed;
      hideNotice(); render();
    });
  });
}

function buildColPanel() {
  const p = $('colPanel');
  p.innerHTML = '<div class="colpanel-title">Chọn cột hiển thị</div>' +
    COLUMNS.filter(c => !c.fixed).map(c =>
      `<label><input type="checkbox" data-col="${c.key}" ${HIDDEN.has(c.key) ? '' : 'checked'}> ${c.label}</label>`).join('') +
    '<div class="colpanel-actions"><button id="colAll" class="btn">Hiện tất cả</button></div>';
  p.querySelectorAll('input[data-col]').forEach(cb => cb.addEventListener('change', async () => {
    if (cb.checked) HIDDEN.delete(cb.dataset.col); else HIDDEN.add(cb.dataset.col);
    await chrome.storage.local.set({ hiddenCols: [...HIDDEN] });
    render();
  }));
  p.querySelector('#colAll').addEventListener('click', async () => {
    HIDDEN.clear(); await chrome.storage.local.set({ hiddenCols: [] });
    buildColPanel(); $('colPanel').hidden = false; render();
  });
}

function visibleColumns() { return COLUMNS.filter(c => c.fixed || !HIDDEN.has(c.key)); }

// ==== Tải dữ liệu ====
function load(forceToken) {
  const btn = $('reload'); btn.disabled = true; btn.textContent = 'Đang tải…';
  chrome.runtime.sendMessage({ type: 'loadAccounts', forceToken }, res => {
    btn.disabled = false; btn.textContent = 'Tải lại dữ liệu';
    if (chrome.runtime.lastError) { showNotice(chrome.runtime.lastError.message, true); return; }
    if (!res.ok) { showNotice(res.error, true); return; }
    hideNotice(); DATA = res.data; render(); if (RANGE) loadSpend();
  });
}
function loadBM() {
  showNotice('Đang tải tài khoản trong Business Manager…');
  chrome.runtime.sendMessage({ type: 'loadBM' }, res => {
    if (!res || !res.ok) { showNotice((res && res.error) || 'Lỗi tải BM', true); return; }
    hideNotice(); BM = res.data; if (SUB === 'bm') render();
  });
}
function loadPages() {
  showNotice('Đang tải danh sách Page…');
  chrome.runtime.sendMessage({ type: 'loadPages' }, res => {
    if (!res || !res.ok) { showNotice((res && res.error) || 'Lỗi tải Page', true); return; }
    hideNotice(); PAGES = res.data; if (SUB === 'page') render();
  });
}

// ==== Lọc theo ngày ====
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dmy(s) { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
function onPresetChange() {
  const v = $('datePreset').value;
  $('customRange').hidden = v !== 'custom';
  if (v === 'custom') return;
  const today = new Date();
  const day = n => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
  let since, until = ymd(today), label;
  if (v === 'all') { setRange(null); return; }
  if (v === 'today') { since = ymd(today); label = 'hôm nay'; }
  if (v === 'yesterday') { since = until = ymd(day(-1)); label = 'hôm qua'; }
  if (v === '7d') { since = ymd(day(-6)); label = '7 ngày qua'; }
  if (v === '30d') { since = ymd(day(-29)); label = '30 ngày qua'; }
  if (v === 'thismonth') { since = ymd(new Date(today.getFullYear(), today.getMonth(), 1)); label = 'tháng này'; }
  if (v === 'lastmonth') { since = ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)); until = ymd(new Date(today.getFullYear(), today.getMonth(), 0)); label = 'tháng trước'; }
  setRange({ since, until, label: label + ` (${dmy(since)}–${dmy(until)})` });
}
function applyCustomRange() {
  const since = $('dateFrom').value, until = $('dateTo').value;
  if (!since || !until) { showNotice('Chọn đủ ngày bắt đầu và kết thúc.'); return; }
  if (since > until) { showNotice('Ngày bắt đầu phải trước ngày kết thúc.'); return; }
  hideNotice(); setRange({ since, until, label: `${dmy(since)}–${dmy(until)}` });
}
function setRange(range) { RANGE = range; SPEND = {}; render(); if (range) loadSpend(); }
function loadSpend() {
  showNotice(`Đang tải chi tiêu ${RANGE.label}…`);
  const asked = RANGE;
  chrome.runtime.sendMessage({ type: 'loadSpend', since: RANGE.since, until: RANGE.until }, res => {
    if (RANGE !== asked) return;
    if (!res || !res.ok) { showNotice((res && res.error) || 'Lỗi tải chi tiêu', true); return; }
    hideNotice(); SPEND = res.data; render();
  });
}
function spent(a) { if (!RANGE) return a.amountSpent; return a.id in SPEND ? SPEND[a.id] : undefined; }

// ==== Tiện ích hiển thị ====
function showNotice(msg, isError) { const n = $('notice'); n.textContent = msg; n.classList.toggle('error', !!isError); n.hidden = false; }
function hideNotice() { $('notice').hidden = true; }
function currentAccounts() { return SUB === 'bm' ? ((BM && BM.accounts) || []) : ((DATA && DATA.accounts) || []); }

function sortValue(a, key) {
  if (key === 'spent') return spent(a);
  if (key === 'note') return NOTES[a.id] || '';
  if (key === 'createdTime') return a.createdTime ? Date.parse(a.createdTime) : null;
  return a[key];
}
function visibleAccounts() {
  const q = $('search').value.trim().toLowerCase();
  const st = $('statusFilter').value;
  let rows = currentAccounts().filter(a => {
    if (st && a.statusKind !== st) return false;
    if (!q) return true;
    return (a.name || '').toLowerCase().includes(q) || String(a.accountId || '').includes(q) || (NOTES[a.id] || '').toLowerCase().includes(q);
  });
  if (SORT.key) rows = rows.slice().sort((x, y) => {
    const vx = sortValue(x, SORT.key), vy = sortValue(y, SORT.key);
    const nx = vx === null || vx === undefined, ny = vy === null || vy === undefined;
    if (nx && ny) return 0; if (nx) return 1; if (ny) return -1;
    const cmp = typeof vx === 'number' && typeof vy === 'number' ? vx - vy : String(vx).localeCompare(String(vy), 'vi');
    return cmp * SORT.dir;
  });
  return rows;
}

function render() {
  if (SUB === 'page') return renderPages();
  const cols = visibleColumns();
  const rows = visibleAccounts();
  const src = SUB === 'bm' ? BM : DATA;
  $('who').textContent = DATA && DATA.user
    ? `Đăng nhập: ${DATA.user.name}` + (SUB === 'bm' && BM ? ` · ${BM.businesses} BM` : ` · ${DATA.accounts.length} TKQC`)
    : (src ? `${currentAccounts().length} TKQC` : 'Chưa tải dữ liệu');

  // tiêu đề + colgroup (độ rộng cột)
  const widthOf = c => WIDTHS[c.key] || c.w || 120;
  $('colgroup').innerHTML = cols.map(c => `<col data-key="${c.key}" style="width:${widthOf(c)}px">`).join('');
  $('tbl').style.width = cols.reduce((s, c) => s + widthOf(c), 0) + 'px';
  $('head-row').innerHTML = cols.map(c => {
    const label = c.dyn ? (RANGE ? 'Tiêu theo ngày lọc' : 'Tổng tiêu') : c.label;
    const ind = SORT.key === c.sort ? `<span class="sort-ind">${SORT.dir === 1 ? '▲' : '▼'}</span>` : '';
    const grip = c.noresize ? '' : `<span class="resizer" data-key="${c.key}"></span>`;
    return `<th class="sortable ${c.cls || ''} ${c.num ? 'num' : ''}" data-sort="${c.sort}" title="${esc(label)}">${esc(label)}${ind}${grip}</th>`;
  }).join('');
  $('head-row').querySelectorAll('th.sortable').forEach(th => th.addEventListener('click', () => {
    if (RESIZING || Date.now() - JUST_RESIZED_AT < 250) return;
    const key = th.dataset.sort;
    if (SORT.key === key) SORT.dir = -SORT.dir;
    else { SORT.key = key; SORT.dir = ['name', 'statusLabel', 'disableReason', 'payment', 'accountType', 'timezone', 'currency', 'role'].includes(key) ? 1 : -1; }
    render();
  }));
  $('head-row').querySelectorAll('.resizer').forEach(rz => rz.addEventListener('mousedown', startResize));

  // thân bảng
  $('rows').innerHTML = rows.map(a =>
    '<tr>' + cols.map(c => `<td class="${c.cls || ''} ${c.num ? 'num' : ''}">${c.cell(a)}</td>`).join('') + '</tr>'
  ).join('');
  $('rows').querySelectorAll('.note-input').forEach(inp => inp.addEventListener('change', async () => {
    NOTES[inp.dataset.id] = inp.value; await chrome.storage.local.set({ notes: NOTES });
  }));

  // tổng cộng — khi quy đổi thì cộng chung 1 tiền tệ, không thì gộp theo tiền gốc
  const sumFor = key => {
    if (TARGET) {
      let s = 0, has = false;
      rows.forEach(a => { const v = key === 'spent' ? spent(a) : a[key]; const c = convVal(v, a.currency); if (typeof c === 'number') { s += c; has = true; } });
      return has ? fmtCur(s, TARGET) : '';
    }
    const byCur = {};
    rows.forEach(a => { const v = key === 'spent' ? spent(a) : a[key]; if (typeof v === 'number') byCur[a.currency] = (byCur[a.currency] || 0) + v; });
    const curs = Object.keys(byCur);
    return curs.map(c => `${fmtCur(byCur[c], c)}${curs.length > 1 ? ' ' + c : ''}`).join(' + ');
  };
  $('foot-row').innerHTML = cols.map(c => {
    let html = '';
    if (c.foot) html = c.foot(rows);
    else if (c.sumSpent) html = sumFor('spent');
    else if (c.sumKey) html = sumFor(c.sumKey);
    return `<td class="${c.cls || ''} ${c.num ? 'num' : ''}">${html}</td>`;
  }).join('');

  $('foot-note').textContent = (RANGE ? `Chi tiêu: ${RANGE.label} · ` : '') + (src && src.fetchedAt ? 'Cập nhật: ' + new Date(src.fetchedAt).toLocaleString('vi-VN') : '');
}

function renderPages() {
  renderIndicators('#tbl-page', PSORT, 'pkey');
  const q = $('search').value.trim().toLowerCase();
  let rows = ((PAGES && PAGES.pages) || []).filter(p => !q || (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
  if (PSORT.key) rows = rows.slice().sort((x, y) => {
    const vx = x[PSORT.key], vy = y[PSORT.key];
    const nx = vx === null || vx === undefined, ny = vy === null || vy === undefined;
    if (nx && ny) return 0; if (nx) return 1; if (ny) return -1;
    const cmp = typeof vx === 'number' && typeof vy === 'number' ? vx - vy : String(vx).localeCompare(String(vy), 'vi');
    return cmp * PSORT.dir;
  });
  $('rows-page').innerHTML = rows.map(p => `<tr>
    <td class="acc-name">${esc(p.name)}</td>
    <td>${esc(p.category)}</td>
    <td class="num">${p.fans === null ? '' : fmt.format(p.fans)}</td>
    <td>${p.verified ? '<span class="verified">✓ Đã xác minh</span>' : ''}</td>
    <td>${esc(p.role)}</td>
    <td>${p.link ? `<a class="plink" href="${esc(p.link)}" target="_blank" rel="noopener">Mở</a>` : ''}</td>
  </tr>`).join('');
  $('p-count').textContent = `${rows.length} Page` + (PAGES && PAGES.fetchedAt ? ' · Cập nhật: ' + new Date(PAGES.fetchedAt).toLocaleString('vi-VN') : '');
  $('who').textContent = PAGES ? `${(PAGES.pages || []).length} Page` : 'Đang tải Page…';
}

function renderIndicators(sel, sort, attr) {
  document.querySelectorAll(`${sel} th.sortable`).forEach(th => {
    let ind = th.querySelector('.sort-ind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'sort-ind'; th.appendChild(ind); }
    ind.textContent = sort.key === th.dataset[attr] ? (sort.dir === 1 ? '▲' : '▼') : '';
  });
}

function exportCsv() {
  if (SUB === 'page') {
    const rows = ((PAGES && PAGES.pages) || []);
    download(['Tên Page', 'Danh mục', 'Người theo dõi', 'Xác minh', 'Quyền', 'Liên kết'],
      rows.map(p => [csv(p.name), csv(p.category), p.fans ?? '', p.verified ? 'Có' : '', p.role, p.link || '']), 'pages');
    return;
  }
  const cols = visibleColumns();
  const rows = visibleAccounts();
  const head = cols.map(c => c.dyn ? (RANGE ? `Tiêu ${RANGE.label}` : 'Tổng tiêu') : c.label).concat('ID');
  const body = rows.map(a => cols.map(c => csvCell(c, a)).concat(`="${a.accountId}"`));
  download(head, body, SUB === 'bm' ? 'tkqc-bm' : 'tkqc');
}
function csvCell(c, a) {
  switch (c.key) {
    case 'status': return a.statusLabel;
    case 'account': return csv(a.name);
    case 'rootId': return csv((a.rootId || '') + (a.rootType ? ' ' + a.rootType : ''));
    case 'balance': return a.balance ?? '';
    case 'threshold': return a.threshold ?? '';
    case 'thresholdLeft': return a.thresholdLeft ?? '';
    case 'spendCap': return a.spendCap ?? '';
    case 'spent': return spent(a) ?? '';
    case 'accountType': return csv(a.accountType || '');
    case 'payment': return csv(a.payment || '');
    case 'nextBill': return a.nextBill ? shortDate(a.nextBill) : '';
    case 'hiddenAdmins': return a.hiddenAdmins ?? '';
    case 'timezone': return csv(a.timezone || '');
    case 'disableReason': return csv(a.disableReason || '');
    case 'createdTime': return shortDate(a.createdTime);
    case 'note': return csv(NOTES[a.id] || '');
    case 'currency': return a.currency;
    case 'role': return a.role;
    default: return '';
  }
}
function download(head, rows, name) {
  const lines = [head.join(',')].concat(rows.map(r => r.join(',')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(a.href);
}
