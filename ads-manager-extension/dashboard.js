const $ = id => document.getElementById(id);
let DATA = null;       // dữ liệu tài khoản từ background
let NOTES = {};        // ghi chú theo account id
let RANGE = null;      // {since, until, label} — khoảng ngày đang lọc chi tiêu
let SPEND = {};        // chi tiêu theo khoảng ngày: account id -> số tiền (null = lỗi)
let SORT = { key: null, dir: 1 };

const fmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const money = v => (v === null || v === undefined) ? '' : fmt.format(v);

init();

async function init() {
  const stored = await chrome.storage.local.get(['lastData', 'notes']);
  NOTES = stored.notes || {};
  if (stored.lastData) { DATA = stored.lastData; render(); }
  load(false); // luôn làm mới khi mở trang

  $('reload').addEventListener('click', () => load(true));
  $('search').addEventListener('input', render);
  $('statusFilter').addEventListener('change', render);
  $('exportCsv').addEventListener('click', exportCsv);
  $('datePreset').addEventListener('change', onPresetChange);
  $('applyDate').addEventListener('click', applyCustomRange);

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    $('panel-fb').hidden = t.dataset.tab !== 'fb';
    $('panel-gg').hidden = t.dataset.tab !== 'gg';
  }));

  document.querySelectorAll('th.sortable').forEach(th => th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (SORT.key === key) SORT.dir = -SORT.dir;
    else { SORT.key = key; SORT.dir = key === 'name' || key === 'statusLabel' ? 1 : -1; }
    render();
  }));
}

function load(forceToken) {
  const btn = $('reload');
  btn.disabled = true; btn.textContent = 'Đang tải…';
  chrome.runtime.sendMessage({ type: 'loadAccounts', forceToken }, res => {
    btn.disabled = false; btn.textContent = 'Tải lại dữ liệu';
    if (chrome.runtime.lastError) { showNotice(chrome.runtime.lastError.message, true); return; }
    if (!res.ok) { showNotice(res.error, true); return; }
    hideNotice();
    DATA = res.data;
    render();
    if (RANGE) loadSpend(); // giữ khoảng ngày đang chọn khi tải lại
  });
}

// ==== Lọc chi tiêu theo ngày ====
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dmy(s) { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }

function onPresetChange() {
  const v = $('datePreset').value;
  $('customRange').hidden = v !== 'custom';
  if (v === 'custom') return; // chờ bấm Áp dụng
  const today = new Date();
  const day = n => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
  let since, until = ymd(today), label;
  if (v === 'all') { setRange(null); return; }
  if (v === 'today') { since = ymd(today); label = 'hôm nay'; }
  if (v === 'yesterday') { since = until = ymd(day(-1)); label = 'hôm qua'; }
  if (v === '7d') { since = ymd(day(-6)); label = '7 ngày qua'; }
  if (v === '30d') { since = ymd(day(-29)); label = '30 ngày qua'; }
  if (v === 'thismonth') { since = ymd(new Date(today.getFullYear(), today.getMonth(), 1)); label = 'tháng này'; }
  if (v === 'lastmonth') {
    since = ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    until = ymd(new Date(today.getFullYear(), today.getMonth(), 0));
    label = 'tháng trước';
  }
  setRange({ since, until, label: label + ` (${dmy(since)}–${dmy(until)})` });
}

function applyCustomRange() {
  const since = $('dateFrom').value, until = $('dateTo').value;
  if (!since || !until) { showNotice('Chọn đủ ngày bắt đầu và ngày kết thúc rồi bấm Áp dụng.'); return; }
  if (since > until) { showNotice('Ngày bắt đầu phải trước ngày kết thúc.'); return; }
  hideNotice();
  setRange({ since, until, label: `${dmy(since)}–${dmy(until)}` });
}

function setRange(range) {
  RANGE = range; SPEND = {};
  $('th-spent').childNodes[0].textContent = range ? 'Tiêu theo ngày lọc' : 'Tổng tiêu';
  render();
  if (range) loadSpend();
}

function loadSpend() {
  showNotice(`Đang tải chi tiêu ${RANGE.label}…`);
  const asked = RANGE;
  chrome.runtime.sendMessage({ type: 'loadSpend', since: RANGE.since, until: RANGE.until }, res => {
    if (RANGE !== asked) return; // người dùng đã đổi khoảng khác
    if (chrome.runtime.lastError || !res.ok) { showNotice((res && res.error) || chrome.runtime.lastError.message, true); return; }
    hideNotice();
    SPEND = res.data;
    render();
  });
}

// giá trị cột "Tổng tiêu" hiện hành của một tài khoản
function spent(a) {
  if (!RANGE) return a.amountSpent;
  return a.id in SPEND ? SPEND[a.id] : undefined; // undefined = đang tải
}

// ==== Hiển thị ====
function showNotice(msg, isError) {
  const n = $('notice');
  n.textContent = msg;
  n.classList.toggle('error', !!isError);
  n.hidden = false;
}
function hideNotice() { $('notice').hidden = true; }

function sortValue(a, key) {
  if (key === 'spent') return spent(a);
  if (key === 'note') return NOTES[a.id] || '';
  return a[key];
}

function visibleAccounts() {
  if (!DATA) return [];
  const q = $('search').value.trim().toLowerCase();
  const st = $('statusFilter').value;
  let rows = DATA.accounts.filter(a => {
    if (st && a.statusKind !== st) return false;
    if (!q) return true;
    return (a.name || '').toLowerCase().includes(q)
      || String(a.accountId || '').includes(q)
      || (NOTES[a.id] || '').toLowerCase().includes(q);
  });
  if (SORT.key) {
    rows = rows.slice().sort((x, y) => {
      const vx = sortValue(x, SORT.key), vy = sortValue(y, SORT.key);
      const nx = vx === null || vx === undefined, ny = vy === null || vy === undefined;
      if (nx && ny) return 0;
      if (nx) return 1; // giá trị trống luôn xuống cuối
      if (ny) return -1;
      const cmp = typeof vx === 'number' && typeof vy === 'number'
        ? vx - vy
        : String(vx).localeCompare(String(vy), 'vi');
      return cmp * SORT.dir;
    });
  }
  return rows;
}

function render() {
  if (!DATA) return;
  const rows = visibleAccounts();
  $('who').textContent = DATA.user
    ? `Đăng nhập: ${DATA.user.name} · ${DATA.accounts.length} TKQC`
    : `${DATA.accounts.length} TKQC`;

  // mũi tên sắp xếp trên tiêu đề
  document.querySelectorAll('th.sortable').forEach(th => {
    let ind = th.querySelector('.sort-ind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'sort-ind'; th.appendChild(ind); }
    ind.textContent = SORT.key === th.dataset.key ? (SORT.dir === 1 ? '▲' : '▼') : '';
  });

  $('rows').innerHTML = rows.map(a => {
    const lowLeft = a.thresholdLeft !== null && a.threshold !== null && a.thresholdLeft <= a.threshold * 0.2;
    const sp = spent(a);
    const spCell = sp === undefined ? '<span class="muted">…</span>' : (sp === null ? '<span class="muted">lỗi</span>' : money(sp));
    return `<tr>
      <td><span class="status ${a.statusKind}"><span class="dot"></span>${a.statusLabel}</span></td>
      <td><div class="acc-name">${esc(a.name)}</div><div class="acc-id">${esc(a.accountId)}</div></td>
      <td class="num">${money(a.balance)}</td>
      <td class="num">${money(a.threshold)}</td>
      <td class="num ${lowLeft ? 'low' : ''}">${money(a.thresholdLeft)}</td>
      <td class="num">${a.spendCap === null ? '<span class="muted">No limit</span>' : money(a.spendCap)}</td>
      <td class="num">${spCell}</td>
      <td><input class="note-input" data-id="${esc(a.id)}" value="${esc(NOTES[a.id] || '')}" placeholder="…"></td>
      <td>${esc(a.currency)}</td>
      <td>${esc(a.role)}</td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.note-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      NOTES[inp.dataset.id] = inp.value;
      await chrome.storage.local.set({ notes: NOTES });
    });
  });

  // Tổng cộng — cộng riêng theo từng loại tiền tệ để không cộng lẫn
  const sum = get => {
    const byCur = {};
    rows.forEach(a => {
      const v = get(a);
      if (typeof v === 'number') byCur[a.currency] = (byCur[a.currency] || 0) + v;
    });
    const curs = Object.keys(byCur);
    return curs.map(c => `${fmt.format(byCur[c])}${curs.length > 1 ? ' ' + c : ''}`).join(' + ');
  };
  $('t-count').textContent = `${rows.length} tài khoản quảng cáo`;
  $('t-balance').textContent = sum(a => a.balance);
  $('t-threshold').textContent = sum(a => a.threshold);
  $('t-left').textContent = sum(a => a.thresholdLeft);
  $('t-cap').textContent = sum(a => a.spendCap);
  $('t-spent').textContent = sum(a => spent(a));
  $('t-when').textContent = (RANGE ? `Chi tiêu: ${RANGE.label} · ` : '')
    + 'Cập nhật: ' + new Date(DATA.fetchedAt).toLocaleString('vi-VN');
}

function exportCsv() {
  const rows = visibleAccounts();
  const spentHead = RANGE ? `Tiêu ${RANGE.label}` : 'Tổng tiêu';
  const head = ['Trạng thái', 'Tên tài khoản', 'ID', 'Số dư', 'Ngưỡng', 'Ngưỡng còn lại', 'Limit', spentHead, 'Tiền tệ', 'Quyền', 'Ghi chú'];
  const lines = [head.join(',')].concat(rows.map(a => [
    a.statusLabel, csv(a.name), `="${a.accountId}"`,
    a.balance ?? '', a.threshold ?? '', a.thresholdLeft ?? '',
    a.spendCap ?? '', spent(a) ?? '', a.currency, a.role, csv(NOTES[a.id] || '')
  ].join(',')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const aEl = document.createElement('a');
  aEl.href = URL.createObjectURL(blob);
  aEl.download = `tkqc-${new Date().toISOString().slice(0, 10)}.csv`;
  aEl.click();
  URL.revokeObjectURL(aEl.href);
}

const csv = s => `"${String(s).replace(/"/g, '""')}"`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
