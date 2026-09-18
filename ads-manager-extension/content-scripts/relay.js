// Chạy trong context extension (world: ISOLATED). Nhận token do hook.js bắt được
// từ trang Facebook rồi chuyển về service worker để lưu và dùng gọi Graph API.
window.addEventListener('message', function (e) {
  if (e.source !== window) return;
  var d = e.data;
  if (d && d.__adsmgr_token) {
    try {
      chrome.runtime.sendMessage({ type: 'capturedToken', token: d.__adsmgr_token });
    } catch (err) { /* service worker chưa sẵn sàng — bỏ qua */ }
  }
});
