// Chạy trên trang Cài đặt doanh nghiệp (business.facebook.com/latest/settings/...).
// Đọc thẳng số "Giới hạn tạo tài khoản quảng cáo" từ giao diện (theo NHÃN, không dựa vào
// class vì Facebook đổi class liên tục) rồi báo về service worker. Đây là phương án dự phòng
// khi không bóc được số từ GraphQL (hook.js).
(function () {
  if (!/settings/.test(location.pathname)) return;
  var LABEL = /giới hạn tạo tài khoản quảng cáo|ad account creation limit|ad accounts? limit/i;
  var bid = null;
  try { bid = new URLSearchParams(location.search).get('business_id'); } catch (e) {}
  if (!bid) return;
  var sent = false, tries = 0;

  function numberNear(el) {
    // Lên tối đa 4 cấp cha: bỏ phần nhãn, phần còn lại có số nguyên thì lấy số đó
    var node = el;
    for (var i = 0; i < 4 && node; i++, node = node.parentElement) {
      var t = (node.textContent || '').replace(LABEL, ' ');
      var m = t.match(/(?:^|[^\d.,])(\d{1,6})(?![\d.,])/);
      if (m && t.replace(/\s+/g, '').length < 120) return Number(m[1]);
    }
    return null;
  }
  function report(n) {
    sent = true;
    try { chrome.runtime.sendMessage({ type: 'bmProbe', probe: { bid: bid, friendly: 'dom', page: location.pathname, keys: [['dom_ad_account_creation_limit', String(n)]] } }); } catch (e) {}
  }
  function find() {
    tries++;
    // 1) Khối Facebook đặt tên rõ: data-surface="...bizkit_settings_business_info_ad_account"
    var box = document.querySelector('[data-surface*="business_info_ad_account"]');
    if (box) {
      var heading = box.querySelector('[role="heading"]');
      var rest = (box.textContent || '').replace(heading ? heading.textContent : LABEL, ' ');
      var mm = rest.match(/(?:^|[^\d.,])(\d{1,6})(?![\d.,])/);
      if (mm) { report(Number(mm[1])); return; }
    }
    // 2) Dự phòng: tìm theo nhãn
    var all = document.querySelectorAll('span,div,dt,label,h1,h2,h3,h4,p');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length > 1) continue;
      var txt = (el.textContent || '').trim();
      if (txt.length > 80 || !LABEL.test(txt)) continue;
      var n = numberNear(el);
      if (n != null) { report(n); return; }
    }
    if (!sent && tries < 25) setTimeout(find, 1000); // trang React dựng dần, thử lại tới ~25s
  }
  setTimeout(find, 800);
})();
