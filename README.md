# DMCTN MCP — Extension VS Code v0.3.0

Extension đăng ký MCP **local-coding-tools**, đồng bộ agent Copilot **DMCTN-MCP**, và **tự tải MCP server** từ GitHub Release ZIP qua bảng điều khiển Webview.

## Yêu cầu

- VS Code **1.99+** với Copilot MCP
- **Node.js LTS ≥ 18** trên PATH (extension kiểm tra trước khi cài)
- **Mạng** lần đầu bấm Cài đặt (tải zip từ GitHub Release)
- Không dùng **npx** — máy chủ chạy `node` trực tiếp

## Cài extension (VSIX)

```powershell
code --install-extension dmctn-mcp-0.3.0.vsix
```

1. Reload Window
2. Sidebar → icon **DMCTN MCP** → **Bảng điều khiển**
3. Nếu thiếu Node.js → bấm **Tải Node.js**, cài xong mở lại VS Code
4. Bấm **Cài đặt MCP DMCTN** → extension tải server về `~/.dmctn/servers/local-coding-tools-mcp`
5. Reload Window → Copilot Chat → agent **DMCTN-MCP**

## Bảng điều khiển

| Nút | Chức năng |
|-----|-----------|
| **Cài đặt MCP DMCTN** | Kiểm tra Node → tải zip (nếu cần) → `npm install` → sync workspace |
| **Tải Node.js** | Mở nodejs.org khi thiếu Node ≥ 18 |
| **Kiểm tra MCP** | Smoke test `pilot-stdio.mjs` |
| **Gỡ MCP khỏi VS Code** | Backup + vô hiệu hóa file workspace |
| **Làm mới trạng thái** | Cập nhật badge Node / server / workspace |

Badge hiển thị: **Đã cài đặt**, **Node.js**, **MCP server v0.7.0**.

## Cài đặt (Settings)

| Key | Mặc định | Mô tả |
|-----|----------|--------|
| `dmctnMcp.serverRoot` | `""` | Override đường dẫn server (bỏ qua bundled) |
| `dmctnMcp.serverVersion` | `""` | Version zip (rỗng = manifest) |
| `dmctnMcp.serverDownloadUrl` | `""` | URL zip (rỗng = GitHub Release; dùng cho dev/local) |
| `dmctnMcp.autoBootstrapServer` | `true` | Tự tải server khi Cài đặt |
| `dmctnMcp.autoSyncOnOpen` | `true` | Sync workspace khi mở |
| `dmctnMcp.showAgentHintOnOpen` | `true` | Nhắc chọn agent |

## Lệnh Command Palette

- **DMCTN MCP: Mở bảng điều khiển**
- **DMCTN MCP: Tải lại MCP server từ Release** — xóa bundled + tải lại zip
- **DMCTN MCP: Setup Workspace** / **Verify MCP Server Build** / **Show Agent Hint**

## Maintainer — Publish GitHub Release

```powershell
# 1. Build customer zip (trong local-coding-tools-mcp)
cd E:\MCP\local-coding-tools-mcp
powershell -ExecutionPolicy Bypass -File scripts/package-customer-zip.ps1 -Version 0.7.0

# 2. Sync manifest SHA256 vào extension
cd E:\MCP\vscode-extension-dmctn-mcp
node scripts/sync-server-manifest.mjs 0.7.0

# 3. Publish (cần gh auth login)
powershell -ExecutionPolicy Bypass -File scripts/publish-github-release.ps1 -Version 0.7.0
```

URL mặc định:  
`https://github.com/devgol/local-coding-tools-mcp/releases/download/v0.7.0/local-coding-tools-mcp-v0.7.0-customer.zip`

## Test local (chưa có GitHub Release)

Trỏ tới zip customer trên ổ đĩa:

```json
"dmctnMcp.serverDownloadUrl": "E:\\MCP\\local-coding-tools-mcp\\release\\local-coding-tools-mcp-v0.7.0-customer.zip"
```

Hoặc chạy integration test:

```powershell
cd E:\MCP\vscode-extension-dmctn-mcp
npm run compile
node scripts/test-bootstrap-local.mjs
```

## Xử lý sự cố

| Triệu chứng | Cách xử lý |
|-------------|------------|
| Thiếu Node.js | Cài Node LTS ≥ 18, Reload Window |
| Tải zip HTTP 404 | Chưa publish GitHub Release — dùng `serverDownloadUrl` local (xem trên) |
| Tải zip HTTP lỗi | Kiểm tra mạng; hoặc set `serverDownloadUrl` mirror/local |
| SHA256 không khớp | Chạy `sync-server-manifest.mjs` sau khi build zip mới |
| npm install lỗi | Xem nhật ký dashboard; thử **Tải lại MCP server** |
| Copilot không gọi MCP | Chọn agent **DMCTN-MCP**, Reload Window |

## Build

```bash
npm install
npm run test
npm run package
```
