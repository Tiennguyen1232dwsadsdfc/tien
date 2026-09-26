# autostory — bộ tool auto làm video kể truyện

Kịch bản → giọng đọc → ảnh minh hoạ → **draft CapCut đã dựng sẵn, khớp từng lời thoại**.

Mở draft trong CapCut là thấy timeline hoàn chỉnh: giọng đọc đến câu nào thì ảnh của câu đó
đang hiện, mỗi ảnh đã có hiệu ứng zoom vào / zoom ra / trôi trái / trôi phải.

```
kịch bản .txt
   │
   ├─ 1. tts      → audio/L0001.mp3 …   (ElevenLabs hoặc Minimax)
   ├─ 2. prompts  → prompt ảnh cho từng câu (Claude, giữ nhân vật nhất quán)
   ├─ 3. images   → images/L0001.png …  (Whisk hoặc Gemini/Imagen)
   └─ 4. capcut   → draft CapCut + subtitles.srt
```

## Cài đặt

```bash
cd tools/autostory
npm install
cp .env.example .env      # rồi điền API key
```

Cần Node 18+. Không cần ffmpeg — độ dài audio được đọc trực tiếp từ file.

Nếu dùng provider ảnh `whisk`:

```bash
npm install playwright && npx playwright install chromium
node bin/autostory.js whisk-login     # đăng nhập Google một lần, phiên được lưu lại
```

## Chạy nhanh

```bash
# thử toàn bộ pipeline không tốn tiền (giọng giả lập + ảnh gradient)
node bin/autostory.js run --script examples/kich-ban-mau.txt --name thu-nghiem \
  --tts-provider mock --image-provider placeholder

# chạy thật
node bin/autostory.js run --script kich-ban.txt --name dem-trang --subtitles
```

Chạy từng bước cũng được, và **chạy lại là an toàn** — mỗi bước bỏ qua phần đã xong,
chỉ làm phần còn thiếu (thêm `--force` nếu muốn làm lại):

```bash
node bin/autostory.js init    --script kich-ban.txt --name dem-trang
node bin/autostory.js tts     --name dem-trang --provider elevenlabs --voice <voice_id>
node bin/autostory.js prompts --name dem-trang
node bin/autostory.js images  --name dem-trang --provider whisk
node bin/autostory.js capcut  --name dem-trang --subtitles --music nhac-nen.mp3
node bin/autostory.js check   --name dem-trang      # kiểm tra draft trước khi mở CapCut
```

## Viết kịch bản

Mỗi dòng là một câu thoại — cũng là một mốc thay ảnh. Câu quá dài tự được tách thành
nhiều câu ngắn (`--max-chars`, mặc định 220).

```
# dòng bắt đầu bằng # là ghi chú
@title: Chuyện Chiếc Đèn Lồng Cuối Phố
@style: tranh kỹ thuật số điện ảnh, ánh đèn lồng vàng ấm, tông nâu trầm
@voice: <voice id, để trống thì lấy từ .env>

== Cảnh 1: Con phố cũ ==
Cuối con phố Hàng Mã có một tiệm đèn lồng nhỏ. || tiệm đèn lồng cuối phố cổ, đèn vàng hắt xuống mặt đường ướt
Ông Bảy ngồi đó bốn mươi năm, tay chưa từng rời khung tre.
```

- `@title` `@style` `@voice` — thông tin chung.
- `== Tên cảnh ==` — mốc chia cảnh (dùng `## Tên cảnh` cũng được).
- `|| ...` — gợi ý ảnh cho riêng câu đó; không có thì tool tự nghĩ từ nội dung câu.

Xem file mẫu: `examples/kich-ban-mau.txt`.

## Giọng đọc

```bash
node bin/autostory.js voices --provider elevenlabs      # liệt kê giọng có sẵn
node bin/autostory.js voices --provider minimax
node bin/autostory.js clone --provider elevenlabs --name "Giong cua toi" --samples mau1.mp3,mau2.mp3
```

- **ElevenLabs** — mặc định dùng endpoint `with-timestamps`, nên độ dài mỗi câu là số liệu
  chính xác từ chính model, không phải suy ra từ header mp3. Timeline nhờ đó khớp tuyệt đối.
- **Minimax** — lấy độ dài từ `extra_info.audio_length`. Nhớ điền cả `MINIMAX_GROUP_ID`,
  và chọn đúng `MINIMAX_BASE_URL` (bản quốc tế `api.minimaxi.chat`, bản TQ `api.minimax.chat`).

Clone giọng: chỉ clone giọng bạn có quyền dùng — giọng của chính bạn, hoặc người nói đã đồng ý.
ElevenLabs bắt xác nhận điều này và tài khoản bạn chịu trách nhiệm.

## Sinh ảnh

| Provider | Cách hoạt động | Nên dùng khi |
|---|---|---|
| `gemini` | API chính thức của Google AI Studio (`gemini-*-image` hoặc `imagen-*`) | Cần ổn định, chạy hàng loạt, chạy headless trên server |
| `whisk` | Điều khiển trình duyệt thật với phiên Google của bạn | Muốn đúng chất ảnh của Whisk |
| `placeholder` | Vẽ ảnh gradient offline | Thử phần dựng phim mà không tốn tiền |

Về `whisk`: Whisk **không có API công khai**, nên cách duy nhất để tự động hoá là điều khiển
trình duyệt. Hai hệ quả thật cần biết trước:

1. Google đổi giao diện là script hỏng. Mọi selector nằm trong `src/images/whisk.js` và ghi đè
   được bằng file JSON qua `WHISK_SELECTORS_FILE`, không phải sửa code:
   ```json
   { "promptInput": ["textarea[placeholder*='Mô tả']"], "submitButton": ["button.generate"] }
   ```
2. Tự động hoá một dịch vụ web có thể vi phạm điều khoản sử dụng của Google. Bạn tự chịu
   trách nhiệm phần này. Cần chạy hàng loạt lâu dài thì `gemini` là đường an toàn hơn.

Prompt ảnh được sinh qua hai bước để nhân vật không đổi mặt đổi áo giữa các ảnh: đọc toàn bộ
kịch bản chốt "story bible" (nhân vật, bối cảnh, bảng màu) trước, rồi mỗi câu mới sinh prompt
có nhắc lại nguyên mô tả ngoại hình. Không có `ANTHROPIC_API_KEY` thì tool vẫn chạy, nhưng
ghép prompt thẳng từ kịch bản — ảnh sẽ kém nhất quán hơn nhiều.

## Hiệu ứng Ken Burns

Làm bằng **keyframe** `scale` + `position` ghi thẳng vào draft, không gọi animation có sẵn của
CapCut — animation của CapCut phụ thuộc resource id tải từ server họ, còn keyframe thì mở máy
nào cũng chạy.

Có sẵn: `zoom-in`, `zoom-out`, `pan-left`, `pan-right`, `pan-up`, `pan-down`,
`zoom-in-pan-left`, `zoom-in-pan-right`, `zoom-out-pan-left`, `zoom-out-pan-right`, `none`.
Hai ảnh liền nhau không bao giờ dùng cùng một hiệu ứng, và cùng một kịch bản chạy lại
sẽ ra cùng một chuỗi hiệu ứng (`KENBURNS_SEED`).

Mức di chuyển luôn bị kẹp theo mức zoom tại từng thời điểm (`|position| ≤ 0.85 × (scale − 1)`)
nên ảnh không bao giờ trôi ra ngoài khung để lộ viền đen. Tắt bằng `--no-kenburns`.

## Timeline khớp lời thoại thế nào

Audio là "sự thật", ảnh chạy theo audio:

- Câu *i* chiếm đúng khoảng `[start, start + độ dài file giọng đọc]`.
- Sau mỗi câu có khoảng nghỉ `LINE_GAP_SECONDS` (mặc định 0.25s); ảnh của câu đó phủ luôn
  khoảng nghỉ này nên không có khung đen giữa hai câu.
- Câu dài hơn `MAX_IMAGE_SECONDS` (mặc định 8s) được chia thành nhiều ảnh chia đều trong đúng
  khoảng của câu; không chia nếu làm ảnh ngắn hơn `MIN_IMAGE_SECONDS` (2.5s).
- Mốc thời gian quy đổi sang micro-giây ở **biên** clip rồi lấy hiệu, nên các clip khít nhau
  tuyệt đối, không để lại khe hở 1 micro-giây gây nháy hình.

Xem bảng timeline: `node bin/autostory.js timeline --name <ten>`.

## Đưa draft vào CapCut

Đặt `CAPCUT_DRAFT_DIR` trong `.env` trỏ tới thư mục draft của CapCut trên máy bạn:

- Windows: `C:/Users/<tên>/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft`
- macOS: `/Users/<tên>/Movies/CapCut/User Data/Projects/com.lveditor.draft`

Không đặt thì draft nằm trong `autostory-projects/<tên>/capcut-draft/` — copy thư mục đó vào
đường dẫn trên rồi mở lại CapCut.

**Định dạng draft thay đổi theo phiên bản CapCut.** Nếu bản CapCut của bạn không mở được
draft, hãy để tool học định dạng từ một project thật của chính bạn:

```bash
node bin/autostory.js capcut-template --name dem-trang \
  --from "<thư mục draft CapCut>/<project cua ban>/draft_content.json"
node bin/autostory.js capcut --name dem-trang
```

Lệnh này chỉ đọc các trường phụ thuộc phiên bản (`app_version`, `version`, `platform`…) và
dùng lại cho draft sinh ra.

File `subtitles.srt` luôn được xuất kèm. Nếu track phụ đề trong draft không hiện đúng trên
bản CapCut của bạn, bỏ `--subtitles` và import file `.srt` này vào CapCut — cách đó không phụ
thuộc định dạng draft.

## Cấu trúc project

```
autostory-projects/<tên>/
  project.json      trạng thái: kịch bản, prompt, audio, ảnh (nguồn để chạy tiếp)
  script.txt        bản copy kịch bản gốc
  audio/            giọng đọc từng câu
  images/           ảnh minh hoạ
  subtitles.srt     phụ đề
  timeline.txt      bảng timeline để đối chiếu
  capcut-draft/     draft (khi chưa đặt CAPCUT_DRAFT_DIR)
```

## Cấu hình

Xem toàn bộ biến trong `.env.example`. Những cái hay dùng:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `TTS_PROVIDER` | `elevenlabs` | `elevenlabs` · `minimax` · `mock` |
| `IMAGE_PROVIDER` | `gemini` | `gemini` · `whisk` · `placeholder` |
| `MAX_IMAGE_SECONDS` | `8` | Một ảnh hiện tối đa bao lâu |
| `MIN_IMAGE_SECONDS` | `2.5` | Không chia ảnh ngắn hơn mức này |
| `LINE_GAP_SECONDS` | `0.25` | Khoảng nghỉ giữa hai câu |
| `KENBURNS_ZOOM_MAX` | `1.22` | Mức zoom tối đa |
| `TTS_CONCURRENCY` | `2` | Số câu đọc song song |
| `IMAGE_CONCURRENCY` | `2` | Số ảnh sinh song song (`whisk` luôn chạy tuần tự) |
| `VIDEO_WIDTH` / `VIDEO_HEIGHT` | `1920` / `1080` | Khung hình (đặt 1080/1920 cho video dọc) |

## Kiểm thử

```bash
npm test      # 34 test: parser, timeline, Ken Burns, draft CapCut, đọc độ dài audio
```

Test không gọi API nào, dùng provider `mock` và `placeholder`.

## Giới hạn cần biết

- **Draft CapCut** được ghi theo cấu trúc quan sát từ các draft thật; CapCut không công bố
  định dạng này. Bản CapCut mới có thể cần `capcut-template` như mô tả ở trên. Luôn chạy
  `autostory check` trước khi mở CapCut.
- **Whisk** phụ thuộc giao diện web, sẽ hỏng khi Google đổi UI — xem phần selector ở trên.
- Tool **không tự render video**; nó dựng sẵn timeline để bạn xem lại, sửa và export trong
  CapCut. Đây là cố ý: bước cuối nên do người quyết định.
