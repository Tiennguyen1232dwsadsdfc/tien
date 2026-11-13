// Chạy trong context extension (world: ISOLATED). Nhận token / dữ liệu dò được do hook.js
// bắt từ trang Facebook rồi chuyển về service worker để lưu và dùng gọi Graph API.
window.addEventListener('message', function (e) {
  if (e.source !== window) return;
  var d = e.data;
  if (!d) return;
  try {
    if (d.__adsmgr_token) chrome.runtime.sendMessage({ type: 'capturedToken', token: d.__adsmgr_token });
    else if (d.__adsmgr_bmprobe) chrome.runtime.sendMessage({ type: 'bmProbe', probe: d.__adsmgr_bmprobe });
  } catch (err) { /* service worker chưa sẵn sàng — bỏ qua */ }
});

// Service worker nhờ tab Facebook này gửi lại một request GraphQL nội bộ (đã học được khi
// mở trang Cài đặt doanh nghiệp) cho BM khác: gửi từ trong tab nên cùng origin + cookie,
// giống hệt trang web tự gửi. Trả về nội dung phản hồi để service worker bóc giá trị.
chrome.runtime.onMessage.addListener(function (msg, _s, sendResponse) {
  if (!msg || msg.type !== 'bmFetch') return;
  var url = msg.url || (location.origin + '/api/graphql/');
  var headers = { 'content-type': 'application/x-www-form-urlencoded' };
  try {
    var p = new URLSearchParams(msg.body);
    if (p.get('lsd')) headers['x-fb-lsd'] = p.get('lsd');
    if (p.get('fb_api_req_friendly_name')) headers['x-fb-friendly-name'] = p.get('fb_api_req_friendly_name');
  } catch (e) {}
  fetch(url, { method: 'POST', credentials: 'include', headers: headers, body: msg.body })
    .then(function (r) { return r.text(); })
    .then(function (t) { sendResponse({ ok: true, text: t.slice(0, 3000000) }); })
    .catch(function (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); });
  return true;
});
