// Chạy trên trang billing hub của Facebook. Chỉ tự động khi URL có cờ g7auto=1
// (do extension mở). Tự bấm "Tải xuống" -> "Tải báo cáo xuống (PDF)" (báo cáo theo
// ngày), KHÔNG bấm "Tải tất cả giao dịch (PDF)". Đặt tên file do background xử lý.
(function () {
  if (!/billing_hub/.test(location.pathname) || !/[?&]g7auto=1/.test(location.search)) return;

  var OPEN_EXCL = ['tất cả', 'báo cáo', 'csv', '(pdf)', 'giao dịch'];
  var REPORT = ['tải báo cáo xuống (pdf)', 'tải báo cáo (pdf)', 'download report (pdf)', 'download summary (pdf)'];
  var REPORT_EXCL = ['csv', 'tất cả giao dịch', 'all transactions', 'each transaction', 'mỗi giao dịch'];

  function norm(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  function visible(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var s;
    try { s = getComputedStyle(el); } catch (e) { return true; }
    return !(s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0');
  }

  function clickable(el) {
    var n = el;
    for (var d = 0; d < 6 && n; d++) {
      var role = n.getAttribute && n.getAttribute('role');
      if (n.tagName === 'BUTTON' || n.tagName === 'A' || role === 'button' || role === 'menuitem' || role === 'menuitemradio' || role === 'option') return n;
      n = n.parentElement;
    }
    return el;
  }

  function fireClick(el) {
    var opts = { bubbles: true, cancelable: true, view: window };
    try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
    ['pointerover', 'pointerenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
      var Ev = type.indexOf('pointer') === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
      try { el.dispatchEvent(new Ev(type, opts)); } catch (e) { try { el.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), opts)); } catch (e2) {} }
    });
  }

  // Tìm đúng nút "Tải xuống" đang hiển thị (ưu tiên nhãn khớp chính xác).
  function findOpen() {
    var nodes = document.querySelectorAll('div[role="button"],button,a[role="button"],[role="button"]');
    var contains = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el)) continue;
      var t = norm(el);
      if (!t || t.length > 40) continue;
      if (OPEN_EXCL.some(function (x) { return t.indexOf(x) !== -1; })) continue;
      if (t === 'tải xuống' || t === 'download') return el;
      if (!contains && (t.indexOf('tải xuống') !== -1 || t.indexOf('download') !== -1)) contains = el;
    }
    return contains;
  }

  // Tìm mục "Tải báo cáo xuống (PDF)" đang hiển thị (phần tử nhỏ nhất khớp).
  function findReport() {
    var all = document.querySelectorAll('div,span,a,button,[role]');
    var best = null, bestLen = 1e9;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!visible(el)) continue;
      var t = norm(el);
      if (!t || t.length > 200) continue;
      if (REPORT_EXCL.some(function (x) { return t.indexOf(x) !== -1; })) continue;
      if (REPORT.some(function (p) { return t.indexOf(p) !== -1; }) && t.length < bestLen) { best = el; bestLen = t.length; }
    }
    return best ? clickable(best) : null;
  }

  var stage = 0, tries = 0, sinceOpen = 0;
  var timer = setInterval(function () {
    tries++;
    if (tries > 90) { clearInterval(timer); return; } // ~45s

    if (stage === 0) {
      var b = findOpen();
      if (b) { fireClick(b); stage = 1; sinceOpen = 0; }
    } else if (stage === 1) {
      sinceOpen++;
      var p = findReport();
      if (p) {
        fireClick(p);
        stage = 2; clearInterval(timer);
        try { chrome.runtime.sendMessage({ type: 'invoiceDone' }); } catch (e) {}
        return;
      }
      if (sinceOpen % 4 === 0) { // menu chưa mở/đóng lại -> mở lại
        var again = findOpen();
        if (again) fireClick(again);
      }
    }
  }, 500);
})();
