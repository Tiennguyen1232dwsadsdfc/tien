// Chạy trên trang billing hub của Facebook. Chỉ tự động khi URL có cờ g7auto=1
// (do extension mở). Tự bấm "Tải xuống" -> "Tải báo cáo xuống (PDF)" (báo cáo theo
// ngày), KHÔNG bấm "Tải tất cả giao dịch (PDF)". Đặt tên file do background xử lý.
(function () {
  if (!/billing_hub/.test(location.pathname) || !/[?&]g7auto=1/.test(location.search)) return;

  var OPEN = ['tải xuống', 'download'];
  var OPEN_EXCL = ['tất cả', 'báo cáo', 'csv', '(pdf)', 'giao dịch'];
  // Mục cần bấm: "Tải báo cáo xuống (PDF)" — báo cáo tổng hợp theo ngày.
  var REPORT = ['tải báo cáo xuống (pdf)', 'tải báo cáo (pdf)', 'download report (pdf)', 'download summary (pdf)'];
  var REPORT_EXCL = ['csv', 'tất cả giao dịch', 'all transactions', 'each transaction', 'mỗi giao dịch'];

  function norm(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  function clickable(el) {
    var n = el;
    for (var d = 0; d < 6 && n; d++) {
      var role = n.getAttribute && n.getAttribute('role');
      if (n.tagName === 'BUTTON' || n.tagName === 'A' || role === 'button' || role === 'menuitem' || role === 'menuitemradio' || role === 'option') return n;
      n = n.parentElement;
    }
    return el;
  }

  // Tìm phần tử NHỎ NHẤT có nhãn chứa cụm cần tìm (để trúng đúng dòng, không trúng cả menu),
  // loại các cụm không mong muốn, rồi trả về phần tử bấm được gần nhất.
  function findByPhrase(phrases, exclude) {
    var all = document.querySelectorAll('div,span,a,button,[role]');
    var best = null, bestLen = 1e9;
    for (var i = 0; i < all.length; i++) {
      var t = norm(all[i]);
      if (!t || t.length > 200) continue;
      if (exclude && exclude.some(function (x) { return t.indexOf(x) !== -1; })) continue;
      var hit = phrases.some(function (p) { return t.indexOf(p) !== -1; });
      if (hit && t.length < bestLen) { best = all[i]; bestLen = t.length; }
    }
    return best ? clickable(best) : null;
  }

  function fireClick(el) {
    var opts = { bubbles: true, cancelable: true, view: window };
    try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
    ['pointerover', 'pointerenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
      var Ev = type.indexOf('pointer') === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
      try { el.dispatchEvent(new Ev(type, opts)); } catch (e) { try { el.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), opts)); } catch (e2) {} }
    });
  }

  var stage = 0, tries = 0, sinceOpen = 0;
  var timer = setInterval(function () {
    tries++;
    if (tries > 90) { clearInterval(timer); return; } // ~45s

    if (stage === 0) {
      var b = findByPhrase(OPEN, OPEN_EXCL);
      if (b) { fireClick(b); stage = 1; sinceOpen = 0; }
    } else if (stage === 1) {
      sinceOpen++;
      var p = findByPhrase(REPORT, REPORT_EXCL);
      if (p) {
        fireClick(p);
        stage = 2; clearInterval(timer);
        try { chrome.runtime.sendMessage({ type: 'invoiceDone' }); } catch (e) {}
        return;
      }
      if (sinceOpen % 5 === 0) { // menu chưa mở/đóng lại -> mở lại
        var again = findByPhrase(OPEN, OPEN_EXCL);
        if (again) fireClick(again);
      }
    }
  }, 500);
})();
