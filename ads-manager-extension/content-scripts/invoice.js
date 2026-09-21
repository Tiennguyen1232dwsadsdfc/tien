// Chạy trên trang billing hub của Facebook. Chỉ tự động khi URL có cờ g7auto=1
// (do extension mở). Tự bấm "Tải xuống" -> "Tải báo cáo xuống (PDF)" (báo cáo theo
// ngày), KHÔNG bấm "Tải tất cả giao dịch (PDF)". Đặt tên file do background xử lý.
(function () {
  if (!/billing_hub/.test(location.pathname) || !/[?&]g7auto=1/.test(location.search)) return;

  var OPEN_EXCL = ['tất cả', 'báo cáo', 'csv', '(pdf)', '(csv)', 'giao dịch'];
  var REPORT = ['tải báo cáo xuống (pdf)', 'tải báo cáo (pdf)', 'download report (pdf)', 'download summary (pdf)'];
  var REPORT_EXCL = ['csv', 'tất cả giao dịch', 'all transactions', 'each transaction', 'mỗi giao dịch'];

  function norm(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function visible(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var s; try { s = getComputedStyle(el); } catch (e) { return true; }
    return !(s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0');
  }
  function fireClick(el) {
    var opts = { bubbles: true, cancelable: true, view: window };
    try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
    ['pointerover', 'pointerenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
      var Ev = type.indexOf('pointer') === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
      try { el.dispatchEvent(new Ev(type, opts)); } catch (e) { try { el.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), opts)); } catch (e2) {} }
    });
  }

  // Nút "Tải xuống": phần tử có aria-haspopup="menu" và nhãn "Tải xuống".
  function findOpen() {
    var nodes = document.querySelectorAll('[aria-haspopup="menu"]');
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
  function menuOpen(trigger) { return trigger && trigger.getAttribute && trigger.getAttribute('aria-expanded') === 'true'; }

  // Mục "Tải báo cáo xuống (PDF)": phần tử NHỎ NHẤT đang hiển thị có nhãn đúng.
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
    return best;
  }

  var trigger = null, stage = 0, tries = 0, sinceOpen = 0;
  var timer = setInterval(function () {
    tries++;
    if (tries > 100) { clearInterval(timer); return; } // ~50s

    if (stage === 0) {
      trigger = findOpen();
      if (trigger) { fireClick(trigger); stage = 1; sinceOpen = 0; }
    } else if (stage === 1) {
      sinceOpen++;
      var p = findReport();
      if (p) {
        fireClick(p);
        stage = 2; clearInterval(timer);
        try { chrome.runtime.sendMessage({ type: 'invoiceDone' }); } catch (e) {}
        return;
      }
      // Menu chưa mở -> bấm lại nút Tải xuống (mỗi ~1,5s)
      if (!menuOpen(trigger) && sinceOpen % 3 === 0) {
        var t2 = findOpen() || trigger;
        if (t2) { trigger = t2; fireClick(t2); }
      }
    }
  }, 500);
})();
