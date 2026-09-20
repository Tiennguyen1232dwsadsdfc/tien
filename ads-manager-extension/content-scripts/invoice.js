// Chạy trên trang billing hub của Facebook. Chỉ tự động khi URL có cờ g7auto=1
// (do extension mở). Tự bấm "Tải xuống" -> "Tải báo cáo xuống (PDF)" để tải hóa
// đơn; phần đặt tên file do background xử lý qua onDeterminingFilename.
(function () {
  if (!/billing_hub/.test(location.pathname) || !/[?&]g7auto=1/.test(location.search)) return;

  var OPEN = ['tải xuống', 'download'];
  var PDF = ['tải báo cáo xuống (pdf)', 'tải báo cáo (pdf)', 'tải tất cả giao dịch xuống (pdf)', 'download report (pdf)', 'download all transactions (pdf)', 'report (pdf)'];

  function txt(el) { return (el.textContent || '').trim().toLowerCase(); }
  function find(list) {
    var nodes = document.querySelectorAll('div[role="button"],button,[role="menuitem"],a[role="button"],a[role="menuitem"],span[role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      var t = txt(nodes[i]);
      if (!t || t.length > 70) continue;
      for (var j = 0; j < list.length; j++) {
        if (t === list[j] || t.indexOf(list[j]) !== -1) return nodes[i];
      }
    }
    return null;
  }

  var stage = 0, tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (tries > 70) { clearInterval(timer); return; } // ~35s thì bỏ, để người dùng tự bấm
    if (stage === 0) {
      var b = find(OPEN);
      if (b) { b.click(); stage = 1; tries = 0; }
    } else if (stage === 1) {
      var p = find(PDF);
      if (p) {
        p.click(); stage = 2; clearInterval(timer);
        try { chrome.runtime.sendMessage({ type: 'invoiceDone' }); } catch (e) {}
      }
    }
  }, 500);
})();
