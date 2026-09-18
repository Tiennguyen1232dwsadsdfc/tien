// Chạy trong context JS của chính trang Facebook (world: MAIN).
// Bọc fetch + XMLHttpRequest để bắt access token thật mà Facebook dùng,
// rồi gửi ra ngoài qua postMessage cho relay.js. Không đọc/sửa nội dung gì khác.
(function () {
  var RE = /access_token=(EAA[A-Za-z0-9]+)/;
  var lastSent = null;

  function scan(s) {
    if (typeof s !== 'string' || s.indexOf('EAA') === -1) return;
    var m = s.match(RE);
    if (m && m[1] && m[1] !== lastSent) {
      lastSent = m[1];
      try { window.postMessage({ __adsmgr_token: m[1] }, '*'); } catch (e) {}
    }
  }

  try {
    var of = window.fetch;
    if (of) {
      window.fetch = function () {
        try {
          var u = arguments[0];
          scan(String(u && u.url ? u.url : u));
          if (arguments[1] && arguments[1].body) scan(String(arguments[1].body));
        } catch (e) {}
        return of.apply(this, arguments);
      };
    }
  } catch (e) {}

  try {
    var oo = XMLHttpRequest.prototype.open;
    var os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, url) {
      try { scan(String(url)); } catch (e) {}
      return oo.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      try { if (body) scan(String(body)); } catch (e) {}
      return os.apply(this, arguments);
    };
  } catch (e) {}
})();
