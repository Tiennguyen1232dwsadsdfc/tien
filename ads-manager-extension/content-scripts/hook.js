// Chạy trong context JS của chính trang Facebook (world: MAIN).
// 1) Bọc fetch + XMLHttpRequest để bắt access token thật mà Facebook dùng.
// 2) Trên trang Cài đặt doanh nghiệp (business.facebook.com/...settings...?business_id=...):
//    đọc nội dung các phản hồi GraphQL và nhặt ra các khóa kiểu "*limit*" / "*restrict*"
//    (vd. giới hạn tạo tài khoản quảng cáo của BM) — API công khai không có các trường này.
// Mọi thứ gửi ra ngoài qua postMessage cho relay.js. Không sửa nội dung trang.
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

  // ---- Dò trường ẩn của BM trên trang Cài đặt doanh nghiệp ----
  var ON_BIZ = /business\.facebook\.com$/.test(location.hostname) && /settings|business_info|business_overview/.test(location.pathname + location.search);
  var KEY_RE = /"([A-Za-z_]*(?:limit|restrict|integrity|is_disabled)[A-Za-z_]*)"\s*:\s*(-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.){0,80}"|true|false|null)/g;
  var sentKeys = {};
  function bizId() {
    try { return new URLSearchParams(location.search).get('business_id') || null; } catch (e) { return null; }
  }
  function reqMeta(body) {
    var meta = { friendly: null, docId: null, vbid: null, raw: null };
    try {
      var s = typeof body === 'string' ? body : (body && typeof body.toString === 'function' && !(body instanceof FormData) ? String(body) : '');
      if (typeof body === 'string') meta.raw = body;
      if (body instanceof FormData) {
        meta.friendly = body.get('fb_api_req_friendly_name'); meta.docId = body.get('doc_id');
        var v = body.get('variables'); if (v) s = 'variables=' + encodeURIComponent(v);
      } else if (s) {
        var p = new URLSearchParams(s);
        meta.friendly = p.get('fb_api_req_friendly_name'); meta.docId = p.get('doc_id');
      }
      var m = s.match(/variables=([^&]+)/);
      if (m) { var vars = JSON.parse(decodeURIComponent(m[1])); meta.vbid = vars.businessID || vars.business_id || vars.businessId || vars.id || null; }
    } catch (e) {}
    return meta;
  }
  var LIMIT_KEY = /(ad_?account|adaccount).*limit|limit.*(ad_?account|adaccount)|creation_limit/i;
  var reqSent = false;
  function scanResp(text, meta) {
    if (typeof text !== 'string' || text.length > 4000000) return;
    if (!/limit|restrict|integrity|is_disabled/.test(text)) return;
    var keys = [], seen = {}, m, n = 0;
    KEY_RE.lastIndex = 0;
    while ((m = KEY_RE.exec(text)) && n < 400) {
      n++;
      var k = m[1], v = m[2];
      if (v.charAt(0) === '"') v = v.slice(1, -1);
      var sig = k + '=' + v;
      if (seen[sig] || sentKeys[sig]) continue;
      seen[sig] = 1; sentKeys[sig] = 1;
      keys.push([k, v]);
      if (keys.length >= 80) break;
    }
    if (!keys.length) return;
    var msg = { bid: bizId(), vbid: meta.vbid, friendly: meta.friendly, docId: meta.docId, keys: keys, page: location.pathname };
    // Request nào trả về giới hạn tạo TKQC thì gửi kèm nguyên văn (url + body) để service worker
    // hỏi lại cho các BM khác mà không phải mở trang — chỉ gửi 1 lần mỗi trang.
    if (!reqSent && meta.raw && meta.raw.length < 60000 && keys.some(function (kv) { return LIMIT_KEY.test(kv[0]); })) {
      reqSent = true; msg.req = { url: meta.url || null, body: meta.raw };
    }
    try { window.postMessage({ __adsmgr_bmprobe: msg }, '*'); } catch (e) {}
  }
  function isGraph(u) { return /\/api\/graphql|\/graphql\//.test(String(u || '')); }

  try {
    var of = window.fetch;
    if (of) {
      window.fetch = function () {
        var u, body;
        try {
          u = arguments[0]; body = arguments[1] && arguments[1].body;
          scan(String(u && u.url ? u.url : u));
          if (body) scan(String(body));
        } catch (e) {}
        var p = of.apply(this, arguments);
        if (ON_BIZ) {
          try {
            var meta = reqMeta(body); meta.url = String(u && u.url ? u.url : u);
            p.then(function (r) {
              try { if (r && isGraph(r.url || u)) r.clone().text().then(function (t) { scanResp(t, meta); }).catch(function () {}); } catch (e) {}
            }, function () {});
          } catch (e) {}
        }
        return p;
      };
    }
  } catch (e) {}

  try {
    var oo = XMLHttpRequest.prototype.open;
    var os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, url) {
      try { scan(String(url)); this.__adsmgr_url = String(url); } catch (e) {}
      return oo.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      try { if (body) scan(String(body)); } catch (e) {}
      if (ON_BIZ) {
        try {
          var meta = reqMeta(body), x = this; meta.url = x.__adsmgr_url || null;
          if (isGraph(x.__adsmgr_url)) x.addEventListener('loadend', function () {
            try { if (!x.responseType || x.responseType === 'text') scanResp(x.responseText, meta); } catch (e) {}
          });
        } catch (e) {}
      }
      return os.apply(this, arguments);
    };
  } catch (e) {}
})();
