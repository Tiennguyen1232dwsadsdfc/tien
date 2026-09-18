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

- **Bắt token kiểu SMIT:** extension bơm một hook vào trang facebook.com để chặn
  các lời gọi `fetch`/XHR mà Facebook tự thực hiện và lấy access token thật —
  ổn định hơn quét HTML. Nếu chưa có token, tự lấy dự phòng từ trang Ads Manager.
- Dùng token đó gọi Graph API cho **TK cá nhân** (`me/adaccounts`),
  **TK BM** (`me/businesses` → owned/client ad accounts) và **Page** (`me/accounts`).
- **Ngưỡng còn lại** = ngưỡng thanh toán − số dư nợ; còn ≤ 20% sẽ tô đỏ.
- **Cảnh báo tự động:** bật ô "Cảnh báo" → mỗi 30 phút kiểm tra nền, gửi thông báo
  khi TK vừa bị vô hiệu hóa hoặc sắp chạm ngưỡng.
- Mọi thứ (token, dữ liệu, ghi chú) chỉ lưu trong `chrome.storage.local` trên máy bạn.

## Chức năng

- Bảng full màn hình, ghim tiêu đề + hàng tổng, bấm tiêu đề để sắp xếp mọi cột.
- Lọc chi tiêu theo ngày (hôm nay / 7 ngày / tháng này / tùy chọn…) qua Insights API.
- Tìm kiếm, lọc trạng thái, ghi chú riêng từng TK, xuất CSV.
- Cột chi tiết: lý do vô hiệu hóa, phương thức thanh toán, ngày tạo, tên BM.

## Cấu trúc

| File | Vai trò |
| --- | --- |
| `manifest.json` | Khai báo extension (Manifest V3) |
| `content-scripts/hook.js` | Chặn fetch/XHR trong trang FB để bắt token (world MAIN) |
| `content-scripts/relay.js` | Chuyển token về service worker (world ISOLATED) |
| `background.js` | Quản token, gọi Graph API, chi tiêu theo ngày, cảnh báo |
| `dashboard.html/css/js` | Bảng quản lý (TK cá nhân / BM / Page) |

## Google Ads

Google không cho đọc dữ liệu qua phiên đăng nhập như Facebook. Hai hướng:

1. **Google Ads API** (khuyên dùng): cần developer token + OAuth (tài khoản MCC).
2. **Content script đọc trang ads.google.com** đang mở: không cần token nhưng
   dễ vỡ khi Google đổi giao diện.

Tab Google Ads trong dashboard đã để sẵn chỗ nối.
