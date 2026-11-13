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
