const $ = id => document.getElementById(id);
let DATA = null;      // dữ liệu từ background
let NOTES = {};       // ghi chú theo account id, lưu chrome.storage.local

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
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    $('panel-fb').hidden = t.dataset.tab !== 'fb';
    $('panel-gg').hidden = t.dataset.tab !== 'gg';
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
  });
}

function showNotice(msg, isError) {
  const n = $('notice');
  n.textContent = msg;
  n.classList.toggle('error', !!isError);
  n.hidden = false;
}
function hideNotice() { $('notice').hidden = true; }

function visibleAccounts() {
  if (!DATA) return [];
  const q = $('search').value.trim().toLowerCase();
  const st = $('statusFilter').value;
  return DATA.accounts.filter(a => {
    if (st && a.statusKind !== st) return false;
    if (!q) return true;
    return (a.name || '').toLowerCase().includes(q)
      || String(a.accountId || '').includes(q)
      || (NOTES[a.id] || '').toLowerCase().includes(q);
  });
}

function render() {
  if (!DATA) return;
  const rows = visibleAccounts();
  $('who').textContent = DATA.user
    ? `Đăng nhập: ${DATA.user.name} · ${DATA.accounts.length} TKQC`
    : `${DATA.accounts.length} TKQC`;

  $('rows').innerHTML = rows.map(a => {
    const lowLeft = a.thresholdLeft !== null && a.threshold !== null && a.thresholdLeft <= a.threshold * 0.2;
    return `<tr>
      <td><span class="status ${a.statusKind}"><span class="dot"></span>${a.statusLabel}</span></td>
      <td><div class="acc-name">${esc(a.name)}</div><div class="acc-id">${esc(a.accountId)}</div></td>
      <td class="num">${money(a.balance)}</td>
      <td class="num">${money(a.threshold)}</td>
      <td class="num ${lowLeft ? 'low' : ''}">${money(a.thresholdLeft)}</td>
      <td class="num">${a.spendCap === null ? '<span class="muted">No limit</span>' : money(a.spendCap)}</td>
      <td class="num">${money(a.amountSpent)}</td>
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

  // Tổng cộng — cộng theo từng loại tiền tệ để không cộng lẫn
  const sum = key => {
    const byCur = {};
    rows.forEach(a => { if (a[key] !== null) byCur[a.currency] = (byCur[a.currency] || 0) + a[key]; });
    return Object.entries(byCur).map(([c, v]) => `${fmt.format(v)}${Object.keys(byCur).length > 1 ? ' ' + c : ''}`).join(' + ');
  };
  $('t-count').textContent = `${rows.length} tài khoản quảng cáo`;
  $('t-balance').textContent = sum('balance');
  $('t-threshold').textContent = sum('threshold');
  $('t-left').textContent = sum('thresholdLeft');
  $('t-cap').textContent = sum('spendCap');
  $('t-spent').textContent = sum('amountSpent');
  $('t-when').textContent = 'Cập nhật: ' + new Date(DATA.fetchedAt).toLocaleString('vi-VN');
}

function exportCsv() {
  const rows = visibleAccounts();
  const head = ['Trạng thái', 'Tên tài khoản', 'ID', 'Số dư', 'Ngưỡng', 'Ngưỡng còn lại', 'Limit', 'Tổng tiêu', 'Tiền tệ', 'Quyền', 'Ghi chú'];
  const lines = [head.join(',')].concat(rows.map(a => [
    a.statusLabel, csv(a.name), `="${a.accountId}"`,
    a.balance ?? '', a.threshold ?? '', a.thresholdLeft ?? '',
    a.spendCap ?? '', a.amountSpent ?? '', a.currency, a.role, csv(NOTES[a.id] || '')
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
