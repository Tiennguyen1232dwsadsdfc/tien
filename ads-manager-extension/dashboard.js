const $ = id => document.getElementById(id);
let DATA = null;        // TK cá nhân
let BM = null;          // TK trong Business Manager
let PAGES = null;       // Fanpage
let SUB = 'ca-nhan';    // sub-tab đang xem
let NOTES = {};
let RANGE = null;       // {since, until, label}
let SPEND = {};         // spent theo ngày lọc: id -> số (null=lỗi, undefined=đang tải)
let SORT = { key: null, dir: 1 };
let PSORT = { key: null, dir: 1 };

const fmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const money = v => (v === null || v === undefined) ? '' : fmt.format(v);
const shortDate = s => s ? new Date(s).toLocaleDateString('vi-VN') : '';

init();

async function init() {
  const stored = await chrome.storage.local.get(['lastData', 'notes', 'alertsEnabled']);
  NOTES = stored.notes || {};
  $('alerts').checked = !!stored.alertsEnabled;
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
    showNotice($('alerts').checked ? 'Đã bật cảnh báo — sẽ kiểm tra mỗi 30 phút và báo khi TK bị vô hiệu hóa hoặc sắp chạm ngưỡng.' : 'Đã tắt cảnh báo.');
    setTimeout(hideNotice, 4000);
  });

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    $('panel-fb').hidden = t.dataset.tab !== 'fb';
    $('panel-gg').hidden = t.dataset.tab !== 'gg';
  }));

  document.querySelectorAll('.subtab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.subtab').forEach(x => x.classList.toggle('active', x === t));
    SUB = t.dataset.sub;
    $('wrap-acc').hidden = SUB === 'page';
    $('wrap-page').hidden = SUB !== 'page';
    if (SUB === 'bm' && !BM) loadBM();
    if (SUB === 'page' && !PAGES) loadPages();
    render();
  }));

  document.querySelectorAll('#tbl th.sortable').forEach(th => th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (SORT.key === key) SORT.dir = -SORT.dir;
    else { SORT.key = key; SORT.dir = (key === 'name' || key === 'statusLabel' || key === 'disableReason' || key === 'payment') ? 1 : -1; }
    render();
  }));
  document.querySelectorAll('#tbl-page th.sortable').forEach(th => th.addEventListener('click', () => {
    const key = th.dataset.pkey;
    if (PSORT.key === key) PSORT.dir = -PSORT.dir;
    else { PSORT.key = key; PSORT.dir = key === 'fans' ? -1 : 1; }
    render();
  }));
}

// ==== Tải dữ liệu ====
function load(forceToken) {
  const btn = $('reload'); btn.disabled = true; btn.textContent = 'Đang tải…';
  chrome.runtime.sendMessage({ type: 'loadAccounts', forceToken }, res => {
    btn.disabled = false; btn.textContent = 'Tải lại dữ liệu';
    if (chrome.runtime.lastError) { showNotice(chrome.runtime.lastError.message, true); return; }
    if (!res.ok) { showNotice(res.error, true); return; }
    hideNotice(); DATA = res.data; render();
    if (RANGE) loadSpend();
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
function setRange(range) {
  RANGE = range; SPEND = {};
  $('th-spent').childNodes[0].textContent = range ? 'Tiêu theo ngày lọc' : 'Tổng tiêu';
  render(); if (range) loadSpend();
}
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

// ==== Hiển thị ====
function showNotice(msg, isError) { const n = $('notice'); n.textContent = msg; n.classList.toggle('error', !!isError); n.hidden = false; }
function hideNotice() { $('notice').hidden = true; }

function currentAccounts() {
  if (SUB === 'bm') return (BM && BM.accounts) || [];
  return (DATA && DATA.accounts) || [];
}

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
  if (SORT.key) {
    rows = rows.slice().sort((x, y) => {
      const vx = sortValue(x, SORT.key), vy = sortValue(y, SORT.key);
      const nx = vx === null || vx === undefined, ny = vy === null || vy === undefined;
      if (nx && ny) return 0; if (nx) return 1; if (ny) return -1;
      const cmp = typeof vx === 'number' && typeof vy === 'number' ? vx - vy : String(vx).localeCompare(String(vy), 'vi');
      return cmp * SORT.dir;
    });
  }
  return rows;
}

function render() {
  if (SUB === 'page') return renderPages();
  renderIndicators('#tbl', SORT);
  const rows = visibleAccounts();
  const src = SUB === 'bm' ? BM : DATA;
  $('who').textContent = DATA && DATA.user
    ? `Đăng nhập: ${DATA.user.name}` + (SUB === 'bm' && BM ? ` · ${BM.businesses} BM` : ` · ${DATA.accounts.length} TKQC`)
    : (src ? `${currentAccounts().length} TKQC` : 'Chưa tải dữ liệu');

  $('rows').innerHTML = rows.map(a => {
    const lowLeft = a.thresholdLeft !== null && a.threshold !== null && a.thresholdLeft <= a.threshold * 0.2;
    const sp = spent(a);
    const spCell = sp === undefined ? '<span class="muted">…</span>' : (sp === null ? '<span class="muted">lỗi</span>' : money(sp));
    return `<tr>
      <td><span class="status ${a.statusKind}"><span class="dot"></span>${a.statusLabel}</span></td>
      <td><div class="acc-name">${esc(a.name)}</div><div class="acc-id">${esc(a.accountId)}</div>${a.business ? `<span class="acc-bm">${esc(a.business)}</span>` : ''}</td>
      <td class="num">${money(a.balance)}</td>
      <td class="num">${money(a.threshold)}</td>
      <td class="num ${lowLeft ? 'low' : ''}">${money(a.thresholdLeft)}</td>
      <td class="num">${a.spendCap === null ? '<span class="muted">No limit</span>' : money(a.spendCap)}</td>
      <td class="num">${spCell}</td>
      <td>${a.disableReason ? esc(a.disableReason) : ''}</td>
      <td>${esc(a.payment)}</td>
      <td>${shortDate(a.createdTime)}</td>
      <td><input class="note-input" data-id="${esc(a.id)}" value="${esc(NOTES[a.id] || '')}" placeholder="…"></td>
      <td>${esc(a.currency)}</td>
      <td>${esc(a.role)}</td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.note-input').forEach(inp => inp.addEventListener('change', async () => {
    NOTES[inp.dataset.id] = inp.value; await chrome.storage.local.set({ notes: NOTES });
  }));

  const sum = get => {
    const byCur = {};
    rows.forEach(a => { const v = get(a); if (typeof v === 'number') byCur[a.currency] = (byCur[a.currency] || 0) + v; });
    const curs = Object.keys(byCur);
    return curs.map(c => `${fmt.format(byCur[c])}${curs.length > 1 ? ' ' + c : ''}`).join(' + ');
  };
  $('t-count').textContent = `${rows.length} tài khoản quảng cáo`;
  $('t-balance').textContent = sum(a => a.balance);
  $('t-threshold').textContent = sum(a => a.threshold);
  $('t-left').textContent = sum(a => a.thresholdLeft);
  $('t-cap').textContent = sum(a => a.spendCap);
  $('t-spent').textContent = sum(a => spent(a));
  $('t-when').textContent = (RANGE ? `Chi tiêu: ${RANGE.label} · ` : '') + (src && src.fetchedAt ? 'Cập nhật: ' + new Date(src.fetchedAt).toLocaleString('vi-VN') : '');
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

function renderIndicators(sel, sort, attr = 'key') {
  document.querySelectorAll(`${sel} th.sortable`).forEach(th => {
    let ind = th.querySelector('.sort-ind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'sort-ind'; th.appendChild(ind); }
    ind.textContent = sort.key === th.dataset[attr] ? (sort.dir === 1 ? '▲' : '▼') : '';
  });
}

function exportCsv() {
  if (SUB === 'page') {
    const rows = ((PAGES && PAGES.pages) || []);
    const head = ['Tên Page', 'Danh mục', 'Người theo dõi', 'Xác minh', 'Quyền', 'Liên kết'];
    download(head, rows.map(p => [csv(p.name), csv(p.category), p.fans ?? '', p.verified ? 'Có' : '', p.role, p.link || '']), 'pages');
    return;
  }
  const rows = visibleAccounts();
  const spentHead = RANGE ? `Tiêu ${RANGE.label}` : 'Tổng tiêu';
  const head = ['Trạng thái', 'Tên tài khoản', 'ID', 'BM', 'Số dư', 'Ngưỡng', 'Ngưỡng còn lại', 'Limit', spentHead, 'Lý do VHH', 'Thanh toán', 'Ngày tạo', 'Tiền tệ', 'Quyền', 'Ghi chú'];
  download(head, rows.map(a => [
    a.statusLabel, csv(a.name), `="${a.accountId}"`, csv(a.business || ''),
    a.balance ?? '', a.threshold ?? '', a.thresholdLeft ?? '', a.spendCap ?? '', spent(a) ?? '',
    csv(a.disableReason), csv(a.payment), shortDate(a.createdTime), a.currency, a.role, csv(NOTES[a.id] || '')
  ]), SUB === 'bm' ? 'tkqc-bm' : 'tkqc');
}
function download(head, rows, name) {
  const lines = [head.join(',')].concat(rows.map(r => r.join(',')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(a.href);
}

const csv = s => `"${String(s).replace(/"/g, '""')}"`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
