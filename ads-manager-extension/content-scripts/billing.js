// Chạy trên trang Thanh toán của 1 TKQC (business.facebook.com/latest/billing_hub/accounts/details/?asset_id=...).
// Đọc mục "Phương thức thanh toán" đúng như người dùng nhìn thấy (thẻ mặc định, thẻ phụ, PayPal…)
// theo NHÃN chữ — không dựa vào class vì Facebook đổi class liên tục — rồi báo về service worker.
(function () {
  if (!/billing_hub/.test(location.pathname)) return;
  var accountId = null;
  try { accountId = new URLSearchParams(location.search).get('asset_id'); } catch (e) {}
  if (!accountId) return;

  var HEAD = /^(Phương thức thanh toán|Payment methods?)$/i;
  var NEXT_HEAD = /^(Giới hạn chi tiêu cho tài khoản|Thông tin doanh nghiệp|Account spending limit|Business info|Cách thanh toán|How you pay)/i;
  var BRAND = /^(Visa|Mastercard|Master ?Card|JCB|American Express|Amex|Discover|UnionPay|Diners(?: Club)?|Maestro|Elo|Hipercard)\b/i;
  var LAST4 = /(\d{4})\s*$/;
  var DEFAULT = /^(Mặc định|Default)$/i;
  var EXP = /(?:Hết hạn vào|Hết hạn|Expires(?: on)?|Exp\.?)\s*:?\s*(\d{1,2}\/\d{2,4})/i;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var sent = false, tries = 0;

  // Danh sách chữ "lá" theo thứ tự xuất hiện trên trang
  function leaves() {
    var out = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      var t = (n.nodeValue || '').normalize('NFC').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      var el = n.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
      out.push(t);
    }
    return out;
  }
  function parse(tokens) {
    var methods = [], cur = null;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (NEXT_HEAD.test(t)) break;
      if (BRAND.test(t) && LAST4.test(t)) {
        cur = { kind: 'card', label: t.replace(/\s*[·•*x]+\s*/i, ' ···· ').replace(/\s+/g, ' '), sub: '', isDefault: false };
        methods.push(cur); continue;
      }
      if (/^PayPal$/i.test(t)) { cur = { kind: 'paypal', label: 'PayPal', sub: '', isDefault: false }; methods.push(cur); continue; }
      if (!cur) continue;
      if (DEFAULT.test(t)) { cur.isDefault = true; continue; }
      var m = t.match(EXP);
      if (m) { cur.sub = [cur.sub, 'HH ' + m[1]].filter(Boolean).join(' · '); continue; }
      if (cur.kind === 'paypal' && EMAIL.test(t)) { cur.label = 'PayPal ' + t; continue; }
      if (/chưa xác minh|unverified|not verified/i.test(t)) { cur.sub = [cur.sub, 'chưa xác minh'].filter(Boolean).join(' · '); continue; }
    }
    return methods;
  }
  function find() {
    tries++;
    var tokens = leaves();
    var best = null, headFound = false;
    for (var i = 0; i < tokens.length; i++) {
      if (!HEAD.test(tokens[i])) continue;
      headFound = true;
      var ms = parse(tokens.slice(i + 1, i + 80));
      if (ms.length && (!best || ms.length > best.length)) best = ms;
    }
    if (best) { report(best, true); return; }
    // Có tiêu đề nhưng không có thẻ nào -> TK chưa thêm thẻ (chờ thêm vài giây cho chắc)
    if (headFound && tries >= 8) { report([], true); return; }
    if (tries < 30) setTimeout(find, 1000);
  }
  function report(methods, found) {
    if (sent) return; sent = true;
    try { chrome.runtime.sendMessage({ type: 'pmProbe', accountId: accountId, methods: methods, found: found }); } catch (e) {}
  }
  setTimeout(find, 1200);
})();
