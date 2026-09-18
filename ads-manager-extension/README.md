# Ads Manager – Quản lý TKQC (Chrome Extension)

Tiện ích trình duyệt quản lý tài khoản quảng cáo Facebook trên một bảng duy nhất:
trạng thái, số dư, ngưỡng thanh toán, ngưỡng còn lại, limit chi tiêu, tổng tiêu,
tiền tệ, quyền — kèm tìm kiếm, lọc trạng thái, ghi chú riêng và xuất CSV.

## Cài đặt (load unpacked)

1. Tải thư mục `ads-manager-extension` về máy (hoặc giải nén file zip).
2. Mở Chrome → `chrome://extensions` → bật **Developer mode** (góc phải trên).
3. Bấm **Load unpacked** → chọn thư mục `ads-manager-extension`.
4. Đăng nhập `facebook.com` bằng tài khoản có TKQC, rồi bấm icon tiện ích trên
   thanh công cụ → bảng quản lý mở ra và tự tải dữ liệu.

## Cách hoạt động

- Tiện ích dùng **chính phiên đăng nhập Facebook của bạn** trên trình duyệt:
  lấy access token từ trang Ads Manager rồi gọi Graph API
  `me/adaccounts` để đọc danh sách TKQC. Không gửi dữ liệu đi đâu khác —
  mọi thứ (token, dữ liệu, ghi chú) chỉ lưu trong `chrome.storage.local`
  trên máy bạn.
- **Ngưỡng còn lại** = ngưỡng thanh toán − số dư nợ hiện tại; khi còn ≤ 20%
  sẽ tô đỏ để biết tài khoản sắp bị charge.
- Token hết hạn sẽ tự lấy lại; nếu báo lỗi, mở facebook.com đăng nhập rồi
  bấm **Tải lại dữ liệu**.

## Cấu trúc

| File | Vai trò |
| --- | --- |
| `manifest.json` | Khai báo extension (Manifest V3) |
| `background.js` | Lấy token, gọi Graph API, chuẩn hóa dữ liệu |
| `dashboard.html/css/js` | Bảng quản lý (tab Facebook Ads / Google Ads) |

## Google Ads

Google không cho đọc dữ liệu qua phiên đăng nhập như Facebook. Hai hướng:

1. **Google Ads API** (khuyên dùng): cần developer token + OAuth (tài khoản MCC).
2. **Content script đọc trang ads.google.com** đang mở: không cần token nhưng
   dễ vỡ khi Google đổi giao diện.

Tab Google Ads trong dashboard đã để sẵn chỗ nối.
