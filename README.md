# 📊 Quản Lý Chi Phí Marketing

Demo web app quản lý chi phí marketing cho team: **báo cáo ngày · ứng tiền · KPI · dashboard**.
Toàn bộ dữ liệu lưu trong `localStorage` của trình duyệt (bản demo, không cần database).

## Tính năng

- **Đăng nhập theo người dùng** — mật khẩu mặc định `123456`, tự đổi được sau khi đăng nhập.
- **Tổng quan (Dashboard)** — tổng chi phí, doanh thu, % CP/DT, số đơn, CPA; so sánh với tháng trước; biểu đồ chi phí & doanh thu theo ngày; chi phí theo kênh / nhân viên; tiến độ dùng ngân sách.
- **Chi phí cá nhân** — chi phí theo từng tài khoản quảng cáo của mỗi nhân viên, KPI ngân sách còn lại.
- **Dữ liệu chi tiết** — thêm / sửa / xóa báo cáo ngày (tài khoản, chi phí, doanh thu, số đơn, ghi chú), lọc theo nhân viên & kênh.
- **Ứng tiền** — nhân viên gửi đề nghị, quản lý duyệt / từ chối (badge đếm số chờ duyệt), bảng đối soát đã ứng vs đã chi.
- **Nhân sự (quản lý)** — thêm / xóa nhân sự, reset mật khẩu, quản lý tài khoản quảng cáo, đặt KPI ngân sách theo tháng.
- **Kết nối API Sandbox (quản lý)** — đồng bộ **data về** (`Contact/GetContactByConditions`) và **đơn hàng logistic** (`ThuKhoTacNghiep/GetOrderLogisticByConditions`) từ API đối tác `api.sandbox.com.vn` theo tháng; đơn chốt (`donHangTrangThaiChotDon`), doanh thu thu khách (`donHangTienThuKhach`), tỷ lệ chốt; biểu đồ data về & đơn chốt theo ngày; đối chiếu với chi phí trong app: **chi phí/data**, **chi phí/đơn**, **% CP/DT** theo từng user marketing (ghép với nhân sự trong app); thống kê data theo nguồn, đơn theo trạng thái giao hàng. Nếu API đơn hàng lỗi vẫn suy ra đơn từ các trường `lgt*` của contact. Server có sẵn endpoint `/api/proxy` chuyển tiếp request (tránh CORS) — chỉ nhận đường dẫn `/partner/api/...`.
- Lọc mọi trang theo **tháng**; giao diện sáng / tối tự theo hệ điều hành.

## Tài khoản demo

| Người dùng | Vai trò | Mật khẩu |
|---|---|---|
| Quản lý | admin | `123456` |
| Tiến, Hà, Minh | nhân viên | `123456` |

Dữ liệu mẫu có sẵn cho tháng 6 và tháng 7/2026.

## Chạy local

```bash
node server.js
# mở http://localhost:3000
```

Không cần `npm install` — server không dùng dependency nào.

## Deploy lên Render

1. Tạo **Web Service** mới, trỏ vào repo này.
2. Build Command: *(để trống)* — Start Command: `node server.js`.
3. Xong. (Hoặc dùng **Static Site** với thư mục publish là `public/`.)

## Cấu trúc

```
public/
  index.html   — khung giao diện
  style.css    — theme sáng/tối, token màu
  app.js       — toàn bộ logic + dữ liệu mẫu (localStorage)
server.js      — static server thuần Node + proxy /api/proxy tới API Sandbox
```

## Cấu hình kết nối API (tab "Kết nối API")

Đăng nhập bằng tài khoản quản lý → tab **Kết nối API**:

1. Dán **Bearer token** và **idChiNhanh** (lấy từ API `LayListChiNhanh`).
2. Kiểm tra 2 đường dẫn API (contact & đơn hàng) khớp với tài liệu — sửa được ngay trên form.
3. Chọn **kiểu ngày lọc** (`NgayTao`, `DonHangNgayChot`, `GiaoHangNgayGiaoHang`…) rồi bấm **Đồng bộ**.

App tự lặp qua các trang (100 bản ghi/trang) cho cả tháng đang chọn. Cấu hình lưu trong
localStorage của trình duyệt; token không gửi đi đâu ngoài API đối tác qua `/api/proxy`.

> Lưu ý: đây là bản demo — mật khẩu lưu dạng thường trong localStorage, không dùng cho dữ liệu thật.
