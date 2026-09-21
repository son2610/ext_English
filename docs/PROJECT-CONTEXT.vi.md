# LumaRead — Bản đồ ngữ cảnh dự án

> Cập nhật **21/09/2026**, theo mã nguồn **v0.6.0** (quét ở v0.5.1 commit `1a09d56`; 0.5.2 sửa lỗi ở mục 8; 0.6.0 thêm popup Ôn 30 giây và 2 trò chơi Lab). Tài liệu gom toàn bộ hiểu biết về project để tiếp tục phát triển mà không phải đọc lại từ đầu. Khi code đổi, cập nhật mục liên quan và mục **8. Lỗi đã phát hiện**.
>
> Tài liệu thiết kế gốc theo từng phiên bản vẫn nằm ở `docs/*.vi.md` (ARCHITECTURE 0.1, EXTENSIONS 0.2, LIBRARY 0.3, AI-PROVIDERS 0.4, LAB 0.5, DATA, VALIDATION). File này là bản tổng hợp hiện hành.

---

## 0. Tóm tắt nhanh

- **Là gì:** Chrome Extension Manifest V3 học tiếng Anh *từ ngữ cảnh*. Lưu câu từ trang web/YouTube → AI phân tích thành các **đơn vị kiến thức** (ngữ pháp / cụm từ) → người học duyệt → ôn theo **FSRS** (tự viết, điền khuyết, ngữ cảnh mới, nghe chép) → **Phòng Lab** luyện thêm → **Hồ sơ lỗi**, bài luyện nhắm lỗi, đọc tổng hợp tuần.
- **Tên:** LumaRead, trước đây là **Mạch Đọc** (`mach-doc`). Nhà phát hành: **Blue**. Đối tượng: người Việt (gốc: lập trình viên Việt), UI 100% tiếng Việt.
- **Stack:** TypeScript strict · React 19 · IndexedDB qua `idb` · `ts-fsrs` 5 · `zod` 4 · esbuild · Vitest + fake-indexeddb · Playwright (E2E Chromium).
- **Không có backend.** AI theo mô hình BYOK (người dùng tự nhập khóa): Gemini, DeepSeek, OpenAI, Z.ai (GLM), API tương thích OpenAI. Từ điển: dictionaryapi.dev. Dữ liệu học nằm ở máy.
- **Định danh kỹ thuật PHẢI GIỮ** (đổi là mất dữ liệu người dùng): IndexedDB `mach-doc`, backup `format: 'mach-doc'`, thư mục tải `Downloads/MachDoc`, thuộc tính DOM `data-mach-doc`, namespace postMessage `mach-doc-youtube`, tên lock `mach-doc-*`, highlight `mach-doc-known`.

---

## 1. Lệnh làm việc

| Lệnh | Tác dụng |
| --- | --- |
| `npm ci` | Cài phụ thuộc. Windows lỗi `EPERM`: `node --preserve-symlinks-main 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' ci --cache .npm-cache` |
| `npm run typecheck` | `tsc --noEmit` (gồm `src` và `tests`) |
| `npm test` | Vitest, 13 file, **169 test** (21/09/2026, bản 0.6.0: tất cả pass, tsc sạch) |
| `npm run build` | typecheck + `scripts/build.mjs` → `dist/` |
| `npm run dev` | esbuild watch (không minify). Sửa manifest/HTML phải build lại |
| `npm run test:e2e` | 7 bộ Playwright: `e2e`, `e2e-enrichment`, `e2e-gemini`, `e2e-organization`, `e2e-ai-fallback`, `e2e-lab`, `e2e-popup`. Cần `dist/` đã build. `CHROMIUM_PATH` tùy chọn. Kết quả/ảnh ở `test-results/` |
| `npm run check:text` | Quét UTF-8/mojibake trong `src` + `public`, giới hạn tên ≤75/mô tả ≤132 ký tự của manifest, version manifest = package.json, kích thước PNG icon |
| `node scripts/performance.mjs` | Đo highlight 3.000 unit trên trang dài, CPU throttle |
| `node scripts/schema.mjs` | Sinh `docs/*.schema.json` từ Zod (không sửa tay) |
| `scripts/package.ps1` | Zip `dist/` (bỏ `*.map` để gói Store không chứa mã nguồn gốc) + `artifacts/store/` → `artifacts/lumaread-<ver>.zip`, `lumaread-store-kit-<ver>.zip`, `release-<ver>.json` (SHA-256) |
| `node scripts/store-screenshots.mjs` | Ảnh Store 04 (Lab Ghép cặp) và 05 (popup Ôn 30 giây), 1280 × 800, từ `dist`. Nội dung nộp Store: `artifacts/store/LISTING.vi.md`, các bước: `artifacts/store/SUBMIT.vi.md` |
| `$env:NO_NEW_TAB='1'; npm run build` | Build không override tab mới |

Cài: `chrome://extensions` → Developer mode → **Load unpacked** → `dist/`. Sau mỗi build: Reload extension, tải lại tab app và trang đọc. Node 22+, Chrome ≥ 120.

**build.mjs:** copy `public/` → `dist/`; ghi manifest (xoá `chrome_url_overrides` nếu `NO_NEW_TAB=1`); tạo `THIRD_PARTY_NOTICES.txt`; bundle:
- ESM: `app` (`src/ui/app.tsx`), `popup` (`src/ui/popup.tsx`), `background`, `offscreen`, `video-editor`, `optimizer` (worker).
- IIFE: `content` (`src/content/index.ts`), `video` (`src/video/index.ts`), `video-main` (`src/video/main.ts`).
- target `chrome120`, sourcemap, minify trừ khi `--watch`, `external: ['./fonts/*']`.

---

## 2. Cấu trúc mã nguồn

```text
src/domain/        Schema Zod + logic thuần (không I/O)
  models.ts          Knowledge, Analysis, Grade, Source, Capture, Schedule, Unit, Review, Settings(+defaults),
                     normalize(), canonical(), validateAnalysis() (kiểm tra trích dẫn/cloze có trong nguồn)
  scheduler.ts       Scheduler (adapter ts-fsrs), exercise() xoay dạng bài, dueQueue() lập hàng đợi ôn
  video.ts           VideoSourceSchema (clip ≤ 90 s), TranscriptRepairSchema
  enrichment.ts      Assessment, Usage, Drill/Practice, WeeklyText/Weekly, Dictionary, Optimization
  ai-config.ts       Danh bạ provider, AIConnection/AIConfiguration, effectiveAI() (fallback Gemini cũ)
  organization.ts    6 màu, Organizer, Organization, searchText() (bỏ dấu tiếng Việt)
  lab.ts             LabPreferences, buildLabCards / filterLabCards / sampleLabCards, checkLabAnswer
  lab-timeline.ts    Lịch hiển thị thuần cho Lướt nhanh/Bong bóng, hỗ trợ lặp vô hạn
  lab-games.ts       Ghép cặp (buildMatchRounds) và Trắc nghiệm (buildChoiceQuestion, đáp án nhiễu từ thư viện)
  error-categories.ts 10 nhóm lỗi + nhãn tiếng Việt
src/data/          IndexedDB, transaction, invariant
  db.ts              openDB('mach-doc', 3) + nâng cấp v1→v2→v3
  repository.ts      settings/saveLabPreferences/saveGeneralSettings, allData, capture (chống trùng), enqueue,
                     claimJob/completeJob (lease), findDuplicate, acceptAnalysis (ghép trùng), addManualUnit,
                     recordReview, reviseUnit, encounter
  library.ts         editCapture, editKnowledge, deleteLibraryItem (snapshot + xoá dây chuyền)
  organization.ts    CRUD nhóm/nhãn, organizeCaptures (hàng loạt)
  enrichment.ts      assessments, quota (reserveUsage/finishUsage), practices, weekly, localDay, BudgetError
  backup.ts          BackupSchema v1–v3, exportData, parseBackup, importData (ghép bảo toàn), snapshot
src/ai/            Lớp AI độc lập nhà cung cấp
  factory.ts         getProvider(), hasConfiguredProvider()
  provider.ts        AIProvider + LearningProvider: analyze / grade / explain / targeted / weekly (prompt ở đây)
  structured-client.ts Router: thứ tự, dự phòng, cache, cooldown, deadline, quota, retry schema; tutorSystem prompt
  transports.ts      generate(): envelope Gemini vs Chat Completions, strict schema OpenAI, lỗi HTTP
  gemini-schema.ts   Zod → JSON Schema rút gọn gửi đi
  gemini-errors.ts   AIError, nhãn giai đoạn, redact() ẩn khóa, geminiHttpError
  configuration.ts   Kho khóa (chrome.storage.local), loadRoutes, keyStatus, saveAIConfiguration
  dictionary.ts      Tra dictionaryapi.dev, cache 30 ngày
src/background/    MV3 service worker
  index.ts           pump() hàng đợi AI, badge, sao lưu định kỳ, alarm, action, commands, router message
  video.ts           Tải timedtext (whitelist), note theo video, xả lô phân tích, relay editor, mở clip
  offscreen.ts       Tạo Blob URL cho file sao lưu
src/content/       Chạy trên mọi trang http(s)
  index.ts           Nút "+", hộp lưu, lưu nhanh, relay từ iframe, bật/tắt highlight
  selection.ts       selectedSource(): exact, context ±1500 ký tự, prefix/suffix, heading, rect
  matcher.ts         Aho-Corasick (dựng theo idle chunk)
  highlights.ts      CSS Custom Highlight + IntersectionObserver/MutationObserver, tooltip, encounter
src/video/         Chạy trên YouTube
  main.ts            MAIN world: đọc player response → danh sách caption track
  index.ts           Panel LumaRead cạnh video, nạp phụ đề, lưu câu, note/marker, luyện lại, phát clip
  sources.ts         playerTracks (postMessage), nativeCaptions, transcriptDom, fetchTrack
  captions.ts        youtubeId, cleanCaption, groupSentences, recentSentences, parseJson3, CaptionHistory
  editor.ts          Hộp chọn/sửa câu (ESM web-accessible, tải khi cần)
  rewatch.ts         RewatchController (lặp đoạn, tốc độ, ẩn CC lần đầu)
src/learning/      Học tập offline + tác vụ nền trong trang app
  errors.ts          classifyError (heuristic), alignDictation, gradeDictation, errorProfile
  frequency.ts       Tần suất 50k từ → CEFR ước lượng, learningPriority
  inflections.ts     Bảng họ từ bất quy tắc, expandInflections
  taxonomy.ts        17 chủ đề ngữ pháp (regex)
  maintenance.ts     generateWeekly, prepareTargeted, optimizeSchedule (Worker)
  optimizer.ts       replayLoss, calibrate (6 tham số FSRS); optimizer-worker.ts
src/shared/        client.ts send(), messages.ts ContentMessageSchema, source-link.ts (Text Fragment),
                   source-text.ts (editSourceText, dictationText)
src/ui/            React, tiếng Việt
  app.tsx            Khung app + router hash, Home, CaptureCard, ReviewPanel, trang Cần chăm sóc, SettingsPanel
  library.tsx        Thư viện; library-index.ts (chỉ mục/lọc), library-management.tsx (sửa/xoá),
                     organizer-manager.tsx (nhóm/nhãn), modal.tsx (dialog)
  lab.tsx            Phòng Lab (thiết lập + LabSession); lab-games.tsx: MatchStage, ChoiceStage
  popup.tsx          Popup icon toolbar "Ôn 30 giây" (+ nút lưu câu YouTube); popup.css
  review-queue.ts    reviewQueue()/dueIn() dùng chung cho trang Ôn tập và popup
  insights.tsx       Hồ sơ & lộ trình
  learning-tools.tsx BudgetNotice, OriginalAudio, TranscriptCheck, UnitTools, AdvancedSettings
  ai-settings.tsx    Nhà cung cấp AI & dự phòng
  stats.ts           Thống kê từ review log
  *.css              style, typography, library, library-management, enrichment, lab, ai-settings (chỉ theme sáng)
public/            manifest.json, app.html, popup.html, offscreen.html, privacy.html, icons/, fonts/ (Noto Sans, OFL),
                   data/en-frequency.txt (FrequencyWords, CC BY-SA 4.0) + ATTRIBUTION.md
tests/             Vitest (fake-indexeddb); fixtures.ts dùng chung cho E2E
scripts/           build, e2e*, check-text, package.ps1, schema, store-assets, prepare-brand, performance
docs/              Tài liệu thiết kế .vi.md theo phiên bản + JSON Schema sinh tự động
artifacts/         Zip phát hành + bộ ảnh/nội dung Chrome Web Store (đã commit vào git)
```

**Điểm bắt đầu đọc code:** `public/manifest.json` → `src/background/index.ts` → `src/data/repository.ts` → `src/domain/models.ts` → `src/ui/app.tsx`.

---

## 3. Ngữ cảnh chạy và giao tiếp

```text
Trang web (http/https, all_frames, about:blank)
  content.js (isolated, IIFE) ──runtime.sendMessage──► background.js (service worker, ESM)
                                                        │  alarm 'maintenance' mỗi 1 phút: pump + badge + backupIfDue
YouTube (www/m/nocookie, all_frames)                    │
  video-main.js (MAIN, document_start) ◄─window.postMessage ns 'mach-doc-youtube'─► video.js (isolated)
  video.js ──sendMessage(+pageUrl)──► background ──tabs.sendMessage(frameId 0)──► top frame
  video-editor.js (web_accessible_resources, import() khi mở hộp lưu)
app.html (tab mới / options #settings / #review …) — React
  • Đọc/ghi IndexedDB TRỰC TIẾP (cùng origin extension)
  • Gọi AI TRỰC TIẾP cho grade / explain / targeted / weekly / kiểm tra kết nối
  • send() tới worker: wake, backup-now, settings-changed, library-changed, play-source
  • Tạo Web Worker optimizer.js để hiệu chỉnh FSRS
popup.html (icon toolbar, action.default_popup) — React, cùng quyền như app.html
  • Đọc IDB, recordReview trực tiếp; send('wake') để cập nhật badge/hàng đợi
  • Trên tab YouTube: chrome.tabs.sendMessage(capture-video) rồi tự đóng
offscreen.html — chỉ tạo Blob JSON cho sao lưu tải xuống
```

Chỉ **phân tích capture** chạy nền trong service worker (hàng đợi). Các tác vụ AI khác chạy trong trang app khi người dùng bấm.

### Bảng message

| Hướng | type | Ghi chú |
| --- | --- | --- |
| content → SW | `capture {source, note, analyze}` | SW thay `url` bằng `sender.tab.url`, `frameUrl` bằng `sender.url`. Web + analyze → `pump()`; video → báo `video-notes-changed` |
| content → SW | `open-editor {source}` | Từ iframe; SW relay `show-editor` tới frame 0 |
| content → SW | `lexicon` | Trả pattern cụm từ (≤3.000 unit, + biến thể) nếu bật highlight |
| content → SW | `encounter {unitIds ≤100}` | Ghi lần gặp khi đọc |
| video → SW | `video-open-editor`, `video-fetch-track`, `video-notes`, `video-ready`, `video-release-batch`, `video-open-library` | Luôn kèm `pageUrl`, SW kiểm tra cùng origin với sender và `videoId` khớp URL |
| UI → SW | `wake`, `backup-now`, `settings-changed`, `library-changed`, `play-source {video, blind}` | Chỉ nhận khi `sender.url` bắt đầu bằng `app.html` hoặc `popup.html` |
| SW → tab | `show-editor`, `show-video-editor`, `quick-capture`, `capture-video` (trả `{handled}`), `refresh-highlights`, `video-notes-changed` | |
| SW → offscreen | `{target:'offscreen', type:'backup-blob' \| 'revoke'}` | |

Mọi message từ content đều qua `ContentMessageSchema` (Zod). Worker từ chối nguồn không phải tab của extension hoặc trang app.

**Phím tắt (manifest commands):** `Alt+Shift+S` lưu nhanh (không AI) · `Alt+Shift+R` mở `#review` · `Alt+Shift+Y` lưu câu YouTube. **Icon toolbar:** mở `popup.html` (từ 0.6.0; vì có popup nên `action.onClicked` không còn dùng). Trên tab YouTube, popup có nút gửi `capture-video`.

**Quyền:** `storage, alarms, activeTab, unlimitedStorage, offscreen, downloads`; host cố định Gemini, dictionaryapi, YouTube timedtext; `optional_host_permissions: https://*/*` xin khi lưu cấu hình AI. CSP trang extension: `script-src 'self'; connect-src 'self' https:; frame-src https://www.youtube-nocookie.com`.

---

## 4. Dữ liệu

### 4.1 IndexedDB `mach-doc` phiên bản 3

| Store | Khóa | Index | Nội dung |
| --- | --- | --- | --- |
| `captures` | `id` | `status`, `videoId` (`source.video.videoId`) | Ngữ cảnh đã lưu |
| `units` | `id` | `canonical`, `due` (`schedule.due`) | Đơn vị kiến thức + lịch FSRS |
| `reviews` | `id` | `at`, `unitId` | Lượt ôn, bất biến |
| `encounters` | `${unitId}:${day}:${sha256(url)}` | — | Lần gặp tự nhiên khi đọc |
| `cache` | SHA-256 | — | Kết quả AI đã kiểm tra (≤300, xoá 50 cũ nhất) |
| `meta` | `key` | — | `settings`, `lastSnapshot`, `lastBackupDownload`, `backupLeaseUntil`, `download:<id>`, `assessmentMigration`, `aiCooldown:<hash>` |
| `backups` | `id` | — | Snapshot JSON (giữ 5) |
| `assessments` | `id` (= id lượt ôn / bài luyện) | `unitId`, `at` | Bài đã chấm, lưu trước khi rating |
| `usage` | `id` | `day`, `month` | Mỗi lần gọi AI (quota) |
| `practices` | `id` | — | Bài luyện nhắm lỗi |
| `weekly` | `id` | `week` | Đoạn tổng hợp tuần |
| `dictionary` | từ | — | Kết quả tra từ điển |
| `optimization` | `id` | — | Lịch sử hiệu chỉnh FSRS |
| `organizers` | `id` | — | Nhóm/nhãn (thêm ở v3) |

`chrome.storage.local` (giới hạn `TRUSTED_CONTEXTS`): `aiKeys = { "<connId>:<provider>:<baseUrl>": { binding, key } }`, khóa cũ `geminiKey`. `chrome.storage.session`: `clip:<tabId>` (clip mở từ app, hết hạn 2 phút).

### 4.2 Thực thể chính

- **Capture:** `id`, `source`, `note`, `status: saved | queued | processing | ready | error`, `analysis?`, `error?`, `attempts`, `nextAttemptAt`, `leaseUntil`, `updatedAt`, `unitsCreated`, `deferredAnalysis?`, `transcriptApproved?`, `organization? { groupId?, labelIds ≤30 }`.
- **Source:** `url`, `frameUrl`, `title`, `exact` (≤8.000), `originalExact?` (câu gốc khi đã sửa), `prefix`/`suffix` (≤250), `context` (≤14.000), `heading`, `scrollY`, `capturedAt`, `video?`.
- **VideoSource:** `provider:'youtube'`, `videoId` (11 ký tự), `start`, `end` (0 < độ dài ≤ 90 s), `language`, `automatic`, `timing: track | observed | manual`, `captionSource: text-track | timedtext | transcript-dom | rendered | manual`.
- **Analysis (schemaVersion 1):** `meaningVi`, `contextNoteVi`, `knowledge[1..8]`, `transcript?` (`textEn`, `uncertain`, `warningVi`, `changes[]`).
- **Knowledge:** `key`, `kind: grammar | phrase`, `group`, `name`, `form`, `meaningVi`, `explanationVi`, `evidence` (trích nguyên văn nguồn), `examples[2..4] {en, vi}`, `production {instructionVi, answerEn}`, `cloze {sentence có đúng một [[blank]], answer, hintVi}`.
- **Unit:** `id`, `canonical = kind + ':' + normalize(key)`, `knowledge`, `captureIds[]`, `schedule`, `failures`, `suspended`, `leech`, `encounters`, `createdAt`, `updatedAt`, `alternativeVi?`, `reportedIssue?`, `priority?: auto | high | low`.
- **Schedule:** thẻ FSRS serialize (`due`/`last_review` epoch ms, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state 0–3`, `learning_steps`).
- **Review:** `id`, `unitId`, `at`, `rating 1–4`, `mode: production | cloze | transfer | dictation`, `answer`, `grade?`, `prior`, `next`, `durationMs`, `assisted`.
- **Grade:** `correct`, `score 0–100`, `feedbackVi`, `correctedEn`, `errors[] {original, correction, reasonVi, category?, l1NoteVi?}`.

### 4.3 Settings (mặc định)

`model 'gemini-3.5-flash'`, `strongModel 'gemini-3.8-flash'`, `retention 0.9` (0,80–0,97), `highlighting false`, `backupDays 7`, `autoBackup true`, `dailyNewLimit 10`, `dailyApiLimit 50`, `monthlyApiLimit 1000`, `learnerLevel 'B1'`, `inflectionMatching false`, `weeklyAutomatic false`, `targetedAutomatic true`, `optimizationEnabled true`, `fsrsWeights?` (21 số), `ai?`, `lab?`.

- **ai:** `{ fallback, connections[≤6] }`; connection `{ id, name, provider: gemini | deepseek | openai | zai | compatible, enabled, model, strongModel?, baseUrl }`. `baseUrl` cố định theo provider trừ `compatible` (HTTPS, không query/khóa/`/chat/completions`). Không có `ai` → `effectiveAI()` tạo kết nối `legacy-gemini` từ `model`/`strongModel`.
- **lab:** `mode 'stream'`, `source 'all'`, `scope 'all'`, `groupId ''`, `labelId ''`, `count 20` (0 = tất cả, ≤5.000), `seconds 2` (0,6–10), `order 'random'`, `hideMeaning false`, `repeat false`, `columns 3`.
- Lưu cài đặt: `saveGeneralSettings` giữ `ai` và `lab` mới nhất; `saveLabPreferences` chỉ ghi `lab`; `saveAIConfiguration` chỉ ghi `ai`.

### 4.4 Vòng đời Capture

```text
Web + AI:     queued ─claim─► processing (lease 90 s) ─► ready (analysis) ─[Duyệt]─► unitsCreated
                                   └─ lỗi tạm thời, attempts < 4 ─► queued (nextAttemptAt, backoff) / còn lại ─► error
Web không AI: saved ─[Tạo bài từ ghi chú]─► ready + unitsCreated
              saved ─[Nhờ AI phân tích]─► queued …
YouTube:      saved + deferredAnalysis ─[hết video: Phân tích lô / Thư viện: Phân tích]─► queued …
Sửa exact:    ─► saved, xoá analysis, unitsCreated=false (unit đã tạo vẫn giữ nguyên lịch)
```

### 4.5 Backup / import

- Định dạng v3: `{ format:'mach-doc', version:3, exportedAt, settings, organizers, captures, units, reviews, encounters, assessments, usage, practices, weekly, dictionary, optimization }`. **Không** có khóa API, cache, snapshot lồng nhau.
- `parseBackup`: ≤150 MB, Zod, ID không trùng, liên kết đầy đủ (unit→capture, review/encounter/assessment/practice/weekly→unit, organization→organizer đúng loại). Đọc được v1/v2/v3.
- `importData`: tạo snapshot an toàn → ghép **bảo toàn**: ID đã có giữ nguyên; unit đã có không nhận review/encounter nhập (tránh lùi lịch); assessment ghép theo ID; settings chỉ ghi khi DB chưa có; capture `processing` → `queued`. Chưa phải sync hai thiết bị.
- Sao lưu tự động: alarm → `snapshot()` khi quá `backupDays`, và tải JSON qua offscreen Blob vào `Downloads/MachDoc/` (chỉ đánh dấu khi `downloads.onChanged` báo complete; lease 10 phút).

---

## 5. Tính năng chi tiết

### 5.1 Lưu từ và câu trên trang web

1. `content.js` nghe `selectionchange`/`pointerup`/`keyup`, debounce 160 ms → `selectedSource()`:
   - Bỏ vùng `input`, `textarea`, `contenteditable`, `role=textbox`; `exact` ≤ 8.000 ký tự và có chữ Latin.
   - `context` = ~1.500 ký tự trước + exact + ~1.500 sau, dùng TreeWalker bắt đầu từ hai đầu vùng chọn (≤100 node mỗi phía, bỏ script/style/editor/`[data-mach-doc]`). `prefix`/`suffix` 150 ký tự, heading gần nhất, rect hiển thị.
2. Nút **+** nằm trong `<div data-mach-doc="capture" popover="manual">` + closed Shadow DOM (tránh CSS trang, top layer). Bấm → `<dialog>` showModal: trích dẫn, ghi chú, checkbox **Nhờ AI phân tích** (mặc định tắt), xem ngữ cảnh sẽ gửi. Trong iframe: gửi `open-editor` để mở ở frame gốc, lỗi thì mở tại chỗ.
3. Lưu → SW `capture()` → `repository.capture()` chống trùng (web: cùng `frameUrl` + `normalize(exact)`; video: cùng `videoId`, lệch `start` < 0,4 s, cùng chữ) → gộp ghi chú; có analyze thì xếp hàng.
4. `Alt+Shift+S`: frame đang focus lưu ngay, không AI.
5. Liên kết nguồn (`source-link.ts`): Text Fragment `#:~:text=prefix-,match,-suffix` (dài > 200 ký tự dùng 90 ký tự đầu/cuối), giữ hash SPA; video → `youtube.com/watch?v=…&t=…s`.
6. Chỉ lưu text, không lưu HTML. UI chèn vào trang dùng `textContent`; `innerHTML` chỉ cho markup tĩnh.

### 5.2 Ôn luyện khoa học (FSRS)

- **Tạo bài:** `acceptAnalysis(captureId, separateKeys)` → mỗi knowledge tạo Unit mới (`scheduler.initial`) hoặc **ghép** vào unit trùng (`canonical` giống, hoặc cùng kind + form + name chuẩn hóa): thêm captureId, gộp ví dụ (giữ tối đa 4), giữ nguyên lịch. Checkbox "Khác nghĩa / cấu trúc" tạo riêng. Transcript `uncertain` phải được xác nhận trước.
- **Bài thủ công:** `addManualUnit` (cần ghi chú, exact < 500 ký tự) tạo knowledge `kind:'phrase'`, key `manual:…`, cloze `'[[blank]]'`, rồi `acceptAnalysis`.
- **Hàng đợi** `dueQueue(units, now, newLimit, priority)`: lọc chưa tạm dừng và đến hạn; mục đã học trước; mục mới sắp theo `learningPriority` (high = 10, low = 0, auto theo tần suất từ/chủ đề so với trình độ tự chọn) rồi `due`; hạn mức mới = `dailyNewLimit` − số unit bắt đầu hôm nay; **interleave**: tránh cùng nhóm hoặc cùng capture liền nhau. Phiên ôn chụp ≤30 mục khi mở trang.
- **Dạng bài** theo `schedule.reps`: `reps % 4 === 3` → **nghe chép chính tả** (clip YouTube ẩn CC hoặc giọng đọc máy) nếu đoạn nghe ≤ `DICTATION_AUTO_WORDS` (40) từ; còn lại `reps % 3`: `0` production (yêu cầu tiếng Việt → viết câu), `1` cloze (câu gốc có chỗ trống), `2` transfer (dịch ví dụ mới, dùng `form`). Nút đổi sang/khỏi nghe chép chỉ hiện khi đoạn ≤ 300 từ.
  - Đoạn nghe (`dictationPassage`, `learning/errors.ts`): video → đúng câu trong clip (khớp audio); web ≤40 từ → cả câu đã lưu; web dài → `knowledge.evidence`.
  - Bài thủ công (cloze chỉ là `[[blank]]`): lượt cloze chuyển thành production; lượt transfer bị bỏ khi ví dụ trùng `form` (tránh in đáp án); gợi ý production dùng `initialsHint` (chữ cái đầu) khi `form` = đáp án.
- **Chấm:** "Nhờ AI chấm" (model mạnh) hoặc chấm nghe chép offline (Levenshtein theo từ) → lưu `Assessment` ngay (id = id lượt ôn). "Tự đối chiếu" chỉ hiện đáp án. "Cần gợi ý" hoặc "Chưa nhớ · Xem để học lại" → `assisted = true` → rating bị ép về 1.
- **Rating** Chưa nhớ/Khó/Nhớ/Dễ → `recordReview`: idempotent theo UUID lượt ôn, chặn phiên cũ bằng `expectedReps`, `scheduler.review(retention, fsrsWeights)` (fuzz tắt, interval tối đa 3.650 ngày), `failures++` khi rating 1; `failures ≥ 5` → `leech` + tạm dừng → trang **Cần chăm sóc** (AI giải thích cách khác → `alternativeVi`; "Tôi đã hiểu hơn" bỏ tạm dừng, reset failures). Nút rating hiển thị khoảng cách lần ôn tới. "Bỏ qua lần này" không đổi lịch.
- **Badge** = số unit không tạm dừng đã đến hạn (kể cả mục mới, có thể lớn hơn phiên). **Tab mới** = app.
- **Thống kê** (`stats.ts`): tỉ lệ nhớ thực = rating ≥ 2 và không assisted / lượt có `prior.state = Review` trong 30 ngày; streak theo ngày local; lưới 28 ngày; theo nhóm kiến thức.
- **Hiệu chỉnh FSRS** (`optimizer.ts`, Worker 60 s): cần ≥1.000 review, ≥7 ngày và +200 review từ lần trước; replay đúng engine ts-fsrs, fit 6 weights `[0,1,2,3,8,11]` bằng coordinate search, chia 80/20 theo thời gian, chỉ áp dụng khi log-loss kiểm định giảm ≥ max(0,005; 1%). Hoàn tác trong Hồ sơ.
- **UnitTools** (mỗi unit): giải thích lại bằng AI, ưu tiên mục mới, báo lỗi + tạm dừng, tra Dictionary API (IPA, định nghĩa, nguồn, giấy phép).

### 5.3 AI giải đáp, giao bài tập, ví dụ minh họa

- **Chuỗi gọi:** `getProvider()` → `LearningProvider(new StructuredClient(routes, fallback))`. Routes = kết nối đang bật, khóa lấy từ kho, `permitted` = `chrome.permissions.contains(origin)`.
- **Model theo tác vụ:** analysis / transcript / weekly → `model`; grading / explanation / targeted → `strongModel ?? model`.
- **Tác vụ (prompt trong `provider.ts`):**
  - `analyze(source, note)`: video → bước 1 sửa transcript ASR (≤38 s), bước 2 phân tích (tổng ≤80 s, trong lease 90 s). Kết quả qua `validateAnalysis`: `evidence` phải có trong nguồn, cloze đúng một `[[blank]]` và khôi phục nguyên văn nguồn. Sinh 2–6 đơn vị, mỗi đơn vị có ví dụ mới, bài viết, cloze.
  - `grade(knowledge, prompt, answer)`: chấm tương đương nghĩa, lỗi có category + `l1NoteVi` (ảnh hưởng tiếng Việt khi có căn cứ).
  - `explain(knowledge)`: giải thích lại theo cách khác (đối chiếu Việt, cặp đúng/sai, mẹo).
  - `targeted(knowledge, errors)`: một bài tự viết nhắm lỗi thường gặp. Tự động khi một nhóm lỗi ≥3 lần trong 30 ngày, tối đa 1 bài/ngày, bật `targetedAutomatic`.
  - `weekly(units)`: đoạn đọc dùng lại ≤8 unit đã ôn tuần trước; mỗi `coverage.quote` phải nằm trong `textEn`; tối đa 4 đoạn mỗi lần.
- **StructuredClient.request** với từng route: bỏ qua khi thiếu khóa/quyền (không tính quota) → cache hit → kiểm tra cooldown → chia deadline (≤23 s/route; UI mặc định 65 s) → `reserveUsage` (hết quota → dừng cả chuỗi) → `generate` → `JSON.parse` → Zod → `validate` → ghi cache.
  - Lỗi không phải `AIError` (lỗi cục bộ) → dừng, không gửi sang AI khác. Từ chối nội dung / hết quota → dừng.
  - Gemini/OpenAI báo không hỗ trợ schema → thử lại một lần bằng JSON mode.
  - Mạng / 408 / 429 / 5xx → cooldown ≥60 s (theo `Retry-After`, ≤24 h), sang route kế. Output sai → sang route kế, không cache.
- **Transport:** Gemini `POST {base}/models/{model}:generateContent`, header `x-goog-api-key`, `responseJsonSchema` rút gọn, temperature 0,3, `maxOutputTokens` 10.000. Chat Completions: `Authorization: Bearer`; OpenAI dùng strict `json_schema` (trường tùy chọn thành nullable, `restoreOptionals` trả lại); hãng khác dùng `json_object` + schema trong system prompt; DeepSeek/Z.ai gửi `thinking: disabled`. `fetch` với `redirect:'error'`, `credentials:'omit'`, `no-referrer`.
- **System prompt** `tutorSystem`: gia sư ngữ pháp cho lập trình viên Việt; dữ liệu JSON của người dùng là không đáng tin; chỉ trả JSON.
- **Hàng đợi nền** (`background/index.ts` `pump`): mỗi alarm (1 phút) hoặc `wake`/capture: có provider (tôn trọng tắt dự phòng) → `claimJob` → `analyze` → `completeJob` (chỉ ghi khi lease khớp). Lỗi tạm thời và `attempts < MAX_ATTEMPTS` (4) → backoff `60 s · 2^(n−1)` + jitter ≤10 s. **Mỗi lượt tối đa `JOBS_PER_PUMP` = 3 job, tuần tự, dừng ngay khi có lỗi.** Job hết lease mà đã dùng đủ 4 lần → `error` (không nhận lại vô hạn). `enqueue` bỏ qua capture đã có `analysis`.
- **Quota:** store `usage`; mặc định 50/ngày, 1.000/tháng; cảnh báo từ 80% (`BudgetNotice`); đếm cả lần lỗi, không đếm cache hit.
- **Khóa:** `saveAIConfiguration` → `permissions.request` (trong click) → `navigator.locks` → ghi kho; khóa gắn với id + provider + baseUrl; không vào IDB/export/prompt/log; `redact()` trong thông báo lỗi. Nút **Kiểm tra JSON** gửi 1 yêu cầu nhỏ, không dự phòng.
- **Hồ sơ lỗi:** `errorProfile(assessments)` theo 10 nhóm; `classifyError` heuristic cho grade cũ/nghe chép.
- **Chưa có:** trò chuyện/hỏi đáp tự do với AI, sinh thêm ví dụ theo yêu cầu, bài tập trắc nghiệm/sắp xếp; adapter Anthropic Claude hoặc model local.

### 5.4 Phòng Lab

- `buildLabCards(captures, units)`: thẻ unit (`form` + `meaningVi`; bỏ unit tạm dừng, đã báo lỗi, không còn capture an toàn) và thẻ capture (`exact` + `analysis.meaningVi` hoặc ghi chú, nhãn "Ghi chú của bạn"). Loại transcript video chưa chắc chưa xác nhận. Cloze chỉ khi đúng một blank và khôi phục được trong capture liên quan.
- `filterLabCards`: nguồn (tất cả / câu / cụm từ / ngữ pháp), tiến độ (tất cả / đến hạn / cần luyện thêm = leech hoặc failures ≥3 hoặc difficulty ≥8), nhóm, nhãn; chế độ cloze bắt buộc có cloze.
- `sampleLabCards`: Fisher–Yates một phần hoặc mới nhất; `count 0` = tất cả.
- **Ghép cặp** (`match`) và **Trắc nghiệm** (`choice`) từ 0.6.0: chỉ mục ngắn (`gameReady`: ≤120 ký tự EN, ≤160 ký tự nghĩa). Ghép cặp chia bảng 4/6/8 cặp (`columns` 2/3/4), không để hai ô trùng chữ trong một bảng, đồng hồ 0,1 s, ghép nhầm đánh dấu cả hai mục; cần ≥2 mục/lượt. Trắc nghiệm lấy tối đa 3 đáp án nhiễu từ toàn thư viện (ưu tiên cùng loại, độ dài gần), loại đáp án trùng chữ hoặc mục khác cùng đề; chiều `direction` = en-vi / vi-en / mixed (cố định theo câu khi bắt đầu lượt); phím 1–4; ở vi-en ẩn nút nghe tới khi trả lời; cần thư viện ≥2 mục ngắn.
- **Chế độ:** *Lướt nhanh* (1 thẻ, `seconds`/mục, ẩn nghĩa → hiện ở nửa sau); *Bong bóng* (bảng 2×2/3×3/4×4, mỗi thẻ mặt Anh → lật 180° sang nghĩa → mờ 240 ms, xuất hiện lệch nhịp, vị trí xáo); *Điền khuyết* (tự gõ, `checkLabAnswer` bỏ qua hoa/thường, khoảng trắng, dấu câu hai đầu).
- Đồng hồ `performance.now()`, tự tạm dừng khi ẩn tab, Space/Esc, toàn màn hình, TTS, "Muốn gặp lại" (cloze sai tự đánh dấu), luyện lại mục đã đánh dấu, lặp vô hạn (`labPlaybackTimeline`).
- **Không** ghi Review/Assessment, **không** đổi FSRS. Chỉ lưu `Settings.lab`. Khi phiên Lab đang chạy, App ngừng tự refresh 10 s.

### 5.5 YouTube: phụ đề, transcript và lưu câu

- **Nạp phụ đề** theo thứ tự (`video/index.ts loadCaptions`):
  1. `TextTrack` tiếng Anh gốc của thẻ video.
  2. Caption track từ player response (`video-main.js` đọc `#movie_player.getPlayerResponse()` / `ytInitialPlayerResponse`) → SW tải `/api/timedtext` (whitelist host/path/`v`, `fmt=json3`, ≤8 MiB, timeout 12 s, tối đa 3 track tiếng Anh, ưu tiên track thủ công).
  3. Bảng transcript đang mở trên trang (`ytd-transcript-segment-renderer`; mốc kết thúc suy ra, đánh dấu `observed`).
  4. Lịch sử CC hiển thị (`.ytp-caption-segment`, MutationObserver + gom 100 ms, ≤300 cue, mốc ước lượng).
- **Lưu câu** (`Alt+Shift+Y`, nút **Lưu câu** trên panel, hoặc nút **Lưu câu vừa nghe** trong popup icon toolbar): tạm dừng video → `groupSentences` (khoảng nghỉ ≤1,1 s, cụm ≤16 s, <36 từ, dừng ở dấu câu, bỏ phần trùng của caption cuộn) → `recentSentences` (≤8 câu trong 50 s gần nhất, ưu tiên câu vừa kết thúc ≤8 s) → hộp chọn trong frame gốc: chọn **một** câu, sửa câu/từ (giữ `originalExact`), xác nhận ngôn ngữ, ghi chú, "phân tích sau" (mặc định bật) → capture `saved + deferredAnalysis`.
- **Panel LumaRead** chèn vào `#secondary` (hoặc cố định góc phải): danh sách note theo thời gian, timeline, marker trên thanh tiến trình, note trước/sau, **Luyện lại các đoạn** (lặp 1/2/3/5 lần, tốc độ 0,5–1,5×, ẩn CC lần đầu), mở thư viện. Hết video → banner **Phân tích lô câu đã chọn** (`video-release-batch`).
- **Nghe lại khi ôn:** iframe `youtube-nocookie` với `start/end` (làm tròn giây), tham số `md-review=1` (không gắn panel), `md-blind=1` (ẩn CC cho nghe chép). Bị chặn nhúng (lỗi 153) → **Mở đoạn trên YouTube**: tab mới + `storage.session` → `video-ready` → seek chính xác, dừng ở `end`.
- **Giới hạn quan trọng:** hiện **chưa có tính năng trích xuất và lưu toàn bộ transcript**. Transcript tải về chỉ nằm trong bộ nhớ tab để chọn câu gần đây; chỉ câu được chọn mới được lưu. Việc lấy timedtext phụ thuộc API nội bộ của YouTube.

### 5.6 Thư viện ngữ cảnh

- `indexLibrary` tạo chuỗi tìm kiếm bỏ dấu (exact, title, note, nghĩa, form/nghĩa/nhóm của unit), đếm bài đến hạn/khó/đã ôn. `filterLibrary`: nhiều từ khóa AND, nhóm (tất cả / chưa phân nhóm / id), nhãn, nguồn (YouTube/web), trạng thái (chờ tạo bài / đã tạo / đến hạn / cần chăm sóc / lỗi AI), sắp xếp (mới/cũ/cập nhật/hạn ôn).
- 24 thẻ/trang, dạng thẻ hoặc danh sách; chọn nhiều qua trang → chuyển nhóm, gắn/gỡ nhãn, **Phân tích (N)**. Chi tiết trong native `<dialog>` (câu trước/sau, Escape): tổ chức, CaptureCard (xem phân tích, duyệt, sửa/xoá ngữ cảnh và bài học, UnitTools, nghe clip, kiểm tra transcript).
- Nhóm (≤1 mỗi câu) + nhãn (≤30 mỗi câu), 6 màu, ≤1.000 danh mục, tên ≤60 ký tự NFC, chặn trùng tên (bỏ dấu). Xoá danh mục chỉ gỡ liên kết.
- Sửa: `editCapture` (đổi exact → bỏ phân tích, unit cũ giữ), `editKnowledge` (giữ FSRS, xoá bài luyện chưa làm, đổi `form` → key `edited:<id>:…`). Chống ghi đè tab khác bằng `updatedAt`.
- Xoá: `deleteLibraryItem` trong **một transaction trên mọi store**: snapshot đầy đủ (giữ 5) → xoá capture (gỡ khỏi unit dùng chung, xoá unit chỉ thuộc capture này) hoặc xoá unit → xoá dây chuyền reviews/encounters/assessments/practices, lọc coverage weekly.

### 5.7 Hồ sơ & lộ trình (Insights)

Hồ sơ lỗi 10 nhóm (30 ngày / tổng), tạo bài luyện nhắm lỗi + chấm (không đổi FSRS), bản đồ 17 chủ đề ngữ pháp (chưa gặp / đang tích lũy / yếu / nắm tốt, dựa trên ≥5 lượt trưởng thành cách nhau ≥1 ngày trong 90 ngày), phân bố A1–C2 ước lượng từ tần suất, tổng lần gặp, sử dụng AI (hôm nay/tháng, token, 20 lần gọi gần nhất, dấu dự phòng), tổng hợp tuần, hiệu chỉnh FSRS + hoàn tác.

### 5.8 Cài đặt & dữ liệu

AI (kết nối, thứ tự, dự phòng, khóa, kiểm tra), mục tiêu ghi nhớ, giới hạn mục mới/ngày, highlight, xuất JSON, nhập (xem trước → xác nhận), sao lưu định kỳ + **Sao lưu ngay**, tải snapshot, Cá nhân hóa (quota, trình độ, biến thể từ, tự hiệu chỉnh, tự tạo bài luyện, tự tổng hợp tuần). Trang được mở bằng `options_page: app.html#settings`.

### 5.9 Nhận diện cụm từ khi đọc (tắt mặc định)

Lexicon = unit `phrase` (≤3.000, + biến thể ≤12.000) → Aho-Corasick dựng theo idle chunk 3 ms → TreeWalker khám phá element (≤20.000/phiên) → IntersectionObserver → so khớp text node trực tiếp (≤4.096 ký tự, ≤200 node con) → `CSS.highlights` `mach-doc-known` (≤500 range) → hover dùng `caretRangeFromPoint` hiện nghĩa. Encounter gửi theo lô ≤100 mỗi 2 s, một lần/unit/URL/ngày (lưu hash URL). Không bọc hay sửa DOM trang. Lần gặp không đổi FSRS.

---

## 6. Bất biến và quy ước bắt buộc

1. **Không đổi định danh** `mach-doc` (DB, backup, lock, namespace, thuộc tính DOM). Người dùng nâng cấp bằng Reload cùng thư mục `dist`.
2. **Mọi dữ liệu từ AI, message, import đều qua Zod** và kiểm tra ngữ nghĩa (trích dẫn/cloze có trong nguồn, coverage) trước khi ghi. Không tin kiểu TypeScript ở ranh giới.
3. **Ghi nhiều store trong một transaction IDB**; đọc bản hiện tại *bên trong* transaction. Chống ghi đè: `updatedAt` (`changedAt = max(now, prev + 1)`), `expectedReps` cho review, lease cho job, UUID idempotent cho review/assessment.
4. **Chỉ `recordReview` đổi lịch FSRS.** Lab, encounter, weekly, targeted, assessment không tạo Review và không sửa `Unit.schedule`.
5. **Khóa API** chỉ ở `chrome.storage.local` (trusted), chỉ gửi trong header tới đúng endpoint; không bao giờ vào IDB, export, prompt, log, message content script. Không gửi URL/tiêu đề trang cho AI.
6. **Nội dung trang/AI hiển thị dạng text** (React text, `textContent`), không `innerHTML` động, không render HTML từ AI, không `eval`/remote code. UI trên trang người dùng dùng closed Shadow DOM + top layer; không mở bridge `postMessage` cho lệnh đặc quyền.
7. **Tương thích ngược:** field Settings/schema mới phải optional hoặc có default. Đổi IDB → tăng version trong `db.ts`, viết nhánh `upgrade`, thêm test migration. Đổi backup → version mới nhưng vẫn đọc bản cũ. Thêm field vào Settings do form chung sửa → kiểm tra `saveGeneralSettings`.
8. **Service worker có thể dừng bất cứ lúc nào:** trạng thái bền nằm trong IDB/storage; không dùng keep-alive hack, không `sleep` chờ Retry-After trong worker.
9. **Mọi lời gọi AI qua `StructuredClient`** để có quota, cache, dự phòng, redact. Không `fetch` AI trực tiếp.
10. **Version** đồng bộ `package.json` + `public/manifest.json` (check:text kiểm tra); footer đọc version từ `package.json`.
11. **Văn bản UI tiếng Việt có dấu, UTF-8**; không tải font/script từ CDN.
12. Tôn trọng `prefers-reduced-motion`; UI hiện chỉ có theme sáng.

**Phong cách code:** rất gọn, nhiều lệnh trên một dòng, JSX dài một dòng; 2 space; nháy đơn; có dấu chấm phẩy; `void promise` cho tác vụ bắn-và-quên; UI dùng mẫu `run(action, thôngBáoThànhCông)` để quản lý busy/refresh/thông báo; lỗi ném `Error` với thông điệp tiếng Việt cho người dùng; comment ít, chỉ giải thích "vì sao". Hạn chế thêm thư viện runtime.

---

## 7. Kiểm thử

| File | Phạm vi |
| --- | --- |
| `tests/core.test.ts` (19) | Grounding analysis, Text Fragment, capture/queue/lease, ghép unit, review stale/idempotent, leech, xoay dạng bài, encounter, export/import, matcher, thống kê, Gemini boundary/cache |
| `tests/enrichment.test.ts` (17) | URL YouTube, chọn câu, gộp cue, json3, rewatch, deferred/batch, dictation, assessment, quota đồng thời, backup v1/v2, model theo tác vụ, weekly, dictionary, ưu tiên, biến thể, hiệu chỉnh, tuần local |
| `tests/ai-fallback.test.ts` (37) | Đa nhà cung cấp, strict/nullable, GLM/custom, model mạnh, cooldown, Retry-After, deadline, quota chung, khóa/cấu hình/quyền |
| `tests/gemini.test.ts` (11) | Schema rút gọn, retry JSON mode, hai giai đoạn YouTube, redact lỗi |
| `tests/library.test.ts` (8) | Sửa câu/bài học, xoá dây chuyền, không hồi sinh dữ liệu |
| `tests/organization.test.ts` (7) | Nhóm/nhãn, hàng loạt, import/export, tìm không dấu |
| `tests/lab*.test.ts` (12 + 22 + 10) | Bộ thẻ, lọc, lấy mẫu, đối chiếu đáp án, timeline, lặp, thiết lập & backup |
| `tests/migration*.test.ts` (1 + 1) | Nâng DB v1 → v3, v2 → v3 thật |
| `tests/lab-games.test.ts` (10) | Trắc nghiệm (đáp án đúng đúng một lần, không đáp án nhiễu hợp lệ, cùng loại), chia bảng ghép cặp, lọc mục ngắn, thiết lập mới, `reviewQueue`/`dueIn` dùng chung |
| `tests/regressions.test.ts` (14) | Hồi quy cho B1–B12: bài thủ công khi ôn, đoạn nghe chép, `$` trong đáp án, emoji trong matcher, giữ `fsrsWeights`, `enqueue`/`claimJob`, leech/báo lỗi, sẵn sàng provider, dọn cooldown, thống kê |

E2E dùng extension thật trong Chromium headless, trang/API giả lập (không dùng khóa thật), profile riêng trong `test-results/`. `e2e-popup` mở `popup.html` như một trang (headless không bấm được icon toolbar): cùng mục kế tiếp với trang Ôn tập, gõ → Ctrl+Enter → chấm, Enter không chấm nhầm, badge cập nhật, xem đáp án trước = Chưa nhớ, bỏ qua không đổi lịch. `e2e-lab` có thêm Ghép cặp và Trắc nghiệm. Ma trận nghiệm thu từng phiên bản: `docs/VALIDATION.vi.md`.

---

## 8. Lỗi và rủi ro đã phát hiện

Phát hiện khi quét ngày 21/09/2026; **B1–B12, F1 và phần an toàn của B13/B14 đã sửa cùng ngày** (test hồi quy ở `tests/regressions.test.ts`). Bảng giữ lại để biết lý do của hành vi hiện tại.

| # | Mức | Vấn đề ban đầu | Trạng thái / cách sửa |
| --- | --- | --- | --- |
| B1 | Trung bình | Bài tạo từ ghi chú: lượt cloze chỉ hiện `________`; lượt transfer in `form` = đáp án. | **Đã sửa** `scheduler.ts` `exercise()`: cloze không có chữ quanh chỗ trống → production; transfer bị bỏ khi ví dụ trùng `form`; gợi ý = `initialsHint`. Bài AI giữ nguyên vòng xoay; Lab không đổi. |
| B2 | Trung bình | Nghe chép tự bật với đoạn dài, lỗi >300 từ, khóa nút quay lại. | **Đã sửa** `app.tsx` + `dictationPassage`: tự bật chỉ khi ≤40 từ; web dài dùng `evidence`; >300 từ không đề nghị nghe chép. |
| B3 | Trung bình | **Lưu cài đặt** với form cũ ghi đè `fsrsWeights` vừa hiệu chỉnh. | **Đã sửa** `saveGeneralSettings` giữ `fsrsWeights` hiện tại (chỉ optimizer/hoàn tác ghi trường này). |
| B4 | Thấp–TB | **Phân tích (N)** gửi lại cả câu đã phân tích đang chờ duyệt. | **Đã sửa** ở UI (`library.tsx`) và `enqueue` (bỏ qua capture có `analysis`). |
| B5 | Thấp | `replace('[[blank]]', answer)` diễn giải `$&`, `$$` trong đáp án. | **Đã sửa** `models.ts`, `lab.ts`: dùng hàm thay thế. |
| B6 | Thấp | Trie dựng theo code point, tìm theo UTF-16 → pattern có emoji không khớp. | **Đã sửa** `matcher.ts`: cả hai theo UTF-16. |
| B7 | Thấp | **Sao lưu ngay** báo thành công khi lượt tải trước còn giữ lease. | **Đã sửa**: `downloadBackup()` trả `boolean`; UI báo đã tạo bản chụp nhưng lượt tải trước còn chạy. |
| B8 | Thấp | Hàng đợi chỉ 1 job/phút. | **Đã sửa**: tối đa 3 job/lượt (`JOBS_PER_PUMP`), tuần tự, dừng ngay khi lỗi. |
| B9 | Thấp | Tắt dự phòng + kết nối đầu thiếu khóa vẫn claim job rồi báo lỗi. | **Đã sửa** `hasConfiguredProvider` giống `StructuredClient` (chỉ kết nối đầu khi tắt dự phòng) → job chờ. |
| B10 | Thấp | Gỡ báo lỗi cũng reset `failures`; ô báo lỗi không xoá. | **Đã sửa**: `reviseUnit` chỉ reset khi thả một leech; UI xoá ô sau khi gỡ. |
| B11 | Thấp | Dòng `aiCooldown:*` tích lũy trong `meta`. | **Đã sửa**: `pruneCooldowns()` chạy theo alarm, chỉ xoá dòng hết hạn. |
| B12 | Rủi ro | Job hết lease được nhận lại vô hạn. | **Đã sửa**: `claimJob` chuyển `error` khi đã dùng đủ `MAX_ATTEMPTS`; người học bấm phân tích lại. |
| B13 | Hiệu năng | App đọc toàn bộ dữ liệu mỗi 10 s, tính lại thống kê mỗi lần render; xoá chụp toàn bộ DB. | **Một phần**: `useMemo` cho hàng đợi/thống kê, `statistics` một lượt duyệt. **Còn lại** (thiết kế lớn): aggregate theo ngày/cursor thay vì `getAll` mỗi 10 s; snapshot khi xoá giữ nguyên vì là bảo đảm an toàn. |
| B14 | Rủi ro ngoài | Phụ thuộc API nội bộ YouTube; timedtext có thể trả rỗng. | **Một phần**: body rỗng → `[]` để sang nguồn kế. Phụ thuộc player vẫn là rủi ro cần theo dõi. Đã gỡ listener chết `play-video-clip`. |
| B15 | Repo | Zip phát hành commit vào git; `.gitignore` có dòng `index.html`. | **Chưa đổi**: cần quyết định của chủ repo (LFS/Release; viết lại lịch sử là thao tác phá hủy). |
| F1 | Hiển thị | Ô trả lời ôn tập và chữ tiếng Anh dùng Georgia; Georgia thiếu chữ Việt dựng sẵn nên Chrome tách dấu ("viê´t"). | **Đã sửa** `typography.css`: font `Luma Serif` = Georgia giới hạn `unicode-range` ở Latin không có chữ Việt; chữ Việt rơi sang Times New Roman → Noto Sans đóng gói. Placeholder ô trả lời dùng Noto Sans. UI chèn vào trang web/YouTube (shadow DOM, không dùng được `@font-face`) vẫn dùng Georgia cho câu tiếng Anh. |

---

## 9. Khoảng trống và ý tưởng tính năng

Gợi ý cho giai đoạn tiếp theo, bám theo 5 trụ cột:

1. **Lưu từ/câu:** menu chuột phải "Lưu vào LumaRead", tra nghĩa nhanh khi chọn từ (không cần lưu), lưu nhanh kèm tự đoán nghĩa.
2. **Ôn luyện:** phím tắt 1–4/Enter trong phiên ôn, luyện nói bằng SpeechRecognition, bury sibling (tránh hai bài cùng capture trong một ngày), mục tiêu ngày + nhắc nhở, heatmap cả năm.
3. **AI:** chat gia sư hỏi đáp tự do theo câu/bài (có ngữ cảnh capture), "Thêm ví dụ" theo yêu cầu, sinh bài tập đa dạng (trắc nghiệm, sắp xếp từ, chọn giới từ, dịch ngược), giải thích lỗi chi tiết; adapter **Anthropic Claude** (Messages API) và model local (Ollama).
4. **Lab:** (đã có ghép cặp, trắc nghiệm từ 0.6.0) nghe rồi chọn nghĩa, gõ nhanh chính tả, lật thẻ thủ công, chế độ sinh tồn có điểm/combo/âm thanh.
5. **YouTube transcript:** **trích xuất toàn bộ transcript và lưu lại** (xem, tìm, bấm câu để nhảy/lưu, lưu nhiều câu một lần, xuất .txt/.srt), phụ đề song ngữ, lưu nhiều câu trong một hộp thoại.
6. **Dữ liệu/UI:** xuất Anki/CSV, dark mode, sync tùy chọn (Drive), xoá hàng loạt trong thư viện.

---

## 10. Checklist khi thêm tính năng hoặc phát hành

1. Schema/type mới ở `src/domain/*` (Zod là nguồn), field mới optional/default.
2. Ghi dữ liệu ở `src/data/*` trong transaction; nếu thêm store/index → tăng version `db.ts` + migration + test.
3. Dữ liệu cần theo backup → cập nhật `BackupSchema`, `exportData`, `parseBackup` (kiểm tra liên kết), `importData`, snapshot trong `deleteLibraryItem`.
4. Tác vụ AI mới → thêm vào `LearningProvider` + `Usage.task` enum + nhãn `stages` + nhãn trong Insights; đi qua `StructuredClient`; có hàm validate ngữ nghĩa.
5. Message mới → `ContentMessageSchema` (content) hoặc danh sách UI trong `background/index.ts`; kiểm tra sender.
6. Quyền/host mới → `public/manifest.json`, CSP, `privacy.html` (và `artifacts/store/privacy.html`).
7. UI tiếng Việt, có trạng thái rỗng/lỗi, bàn phím/focus, màn hình hẹp, reduced motion.
8. Test unit (Vitest) + E2E nếu chạm luồng trình duyệt; chạy `npm run typecheck && npm test && npm run build && npm run check:text`.
9. Phát hành: tăng version ở `package.json` **và** `public/manifest.json`, cập nhật README + `docs/VALIDATION.vi.md` + tài liệu tính năng, build, `scripts/package.ps1`.
10. Cập nhật file này (mục 5, 8, 9).
