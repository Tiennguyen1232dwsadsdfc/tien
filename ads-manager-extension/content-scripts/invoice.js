// Chạy trên trang billing hub của Facebook. Chỉ tự động khi URL có cờ g7auto=1
// (do extension mở). Tự bấm "Tải xuống" -> "Tải báo cáo xuống (PDF)" để tải hóa
// đơn; phần đặt tên file do background xử lý qua onDeterminingFilename.
(function () {
  if (!/billing_hub/.test(location.pathname) || !/[?&]g7auto=1/.test(location.search)) return;

  var OPEN = ['tải xuống', 'download'];
  // Ưu tiên "báo cáo (PDF)"; nếu không có thì lấy mục PDF bất kỳ.
  var PDF_PREFER = ['tải báo cáo xuống (pdf)', 'tải báo cáo (pdf)', 'download report (pdf)'];
  var PDF_ANY = ['(pdf)'];

  function norm(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  // Bắn đủ chuỗi sự kiện chuột để React của Facebook nhận đúng.
  function fireClick(el) {
    var opts = { bubbles: true, cancelable: true, view: window };
    try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
    ['pointerover', 'pointerenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
      var Ev = type.indexOf('pointer') === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
      try { el.dispatchEvent(new Ev(type, opts)); } catch (e) { try { el.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), opts)); } catch (e2) {} }
    });
  }

  // Tìm phần tử bấm được có nhãn khớp (ưu tiên khớp CHÍNH XÁC, rồi mới chứa).
  function findClickable(exactList, containList) {
    var sel = 'div[role="menuitem"],[role="menuitem"],[role="menuitemcheckbox"],[role="option"],div[role="button"],button,a[role="button"],a[role="menuitem"]';
    var nodes = document.querySelectorAll(sel);
    var i, t, j;
    for (i = 0; i < nodes.length; i++) { t = norm(nodes[i]); if (!t || t.length > 80) continue; for (j = 0; j < exactList.length; j++) { if (t === exactList[j]) return nodes[i]; } }
    for (i = 0; i < nodes.length; i++) { t = norm(nodes[i]); if (!t || t.length > 80) continue; for (j = 0; j < exactList.length; j++) { if (t.indexOf(exactList[j]) !== -1) return nodes[i]; } }
    if (containList) for (i = 0; i < nodes.length; i++) { t = norm(nodes[i]); if (!t || t.length > 80) continue; for (j = 0; j < containList.length; j++) { if (t.indexOf(containList[j]) !== -1) return nodes[i]; } }
    return null;
  }

  var stage = 0, tries = 0, sinceOpen = 0;
  var timer = setInterval(function () {
    tries++;
    if (tries > 90) { clearInterval(timer); return; } // ~45s thì bỏ để người dùng tự bấm

    if (stage === 0) {
      var b = findClickable(OPEN, null);
      if (b) { fireClick(b); stage = 1; sinceOpen = 0; }
    } else if (stage === 1) {
      sinceOpen++;
      var p = findClickable(PDF_PREFER, PDF_ANY);
      if (p) {
        fireClick(p);
        stage = 2; clearInterval(timer);
        try { chrome.runtime.sendMessage({ type: 'invoiceDone' }); } catch (e) {}
        return;
      }
      // Menu chưa mở hoặc đã đóng -> mở lại nút "Tải xuống" sau mỗi ~2,5s
      if (sinceOpen % 5 === 0) {
        var again = findClickable(OPEN, null);
        if (again) fireClick(again);
      }
    }
  }, 500);
})();
