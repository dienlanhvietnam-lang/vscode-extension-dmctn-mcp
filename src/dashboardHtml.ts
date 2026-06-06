export interface DashboardViewModel {
  installed: boolean;
  serverOk: boolean;
  workspaceName: string;
  statusLines: string[];
  testLog: string;
  busy: boolean;
  userDisabled: boolean;
  nodeOk: boolean;
  nodeVersion: string;
  serverBundled: boolean;
  serverVersion: string;
  manifestVersion: string;
  serverUpdateAvailable: boolean;
  bootstrapLog: string;
  canInstall: boolean;
}

export function renderDashboardHtml(vm: DashboardViewModel): string {
  const nonce = String(Date.now());
  const statusBadge = vm.installed
    ? '<span class="badge pass">Đã cài đặt</span>'
    : '<span class="badge warn">Chưa cài đặt</span>';

  const nodeBadge = vm.nodeOk
    ? `<span class="badge pass">Node.js ${escapeHtml(vm.nodeVersion)}</span>`
    : '<span class="badge danger">Thiếu Node.js ≥ 18</span>';

  const serverBadge = vm.serverBundled
    ? `<span class="badge pass">MCP server ${escapeHtml(vm.serverVersion)}</span>`
    : '<span class="badge warn">MCP server chưa tải</span>';

  const installDisabled = !vm.canInstall || vm.installed || vm.busy ? "disabled" : "";
  const installLabel = vm.installed ? "Đã cài — bỏ qua" : "Cài đặt MCP DMCTN";

  const nodeWarn = vm.nodeOk
    ? ""
    : `<p class="warn-text danger-text">⚠ ${escapeHtml(vm.nodeVersion || "Chưa có Node.js")}. Cần Node.js LTS ≥ 18 trước khi cài.</p>`;

  const serverWarn =
    vm.serverOk || vm.serverBundled
      ? ""
      : '<p class="warn-text">⚠ Lần đầu cần mạng để tải MCP server từ GitHub Release.</p>';

  const updateWarn = vm.serverUpdateAvailable
    ? `<p class="warn-text">⚠ Server đang <strong>v${escapeHtml(vm.serverVersion)}</strong> — manifest <strong>v${escapeHtml(vm.manifestVersion)}</strong>. Bấm <strong>Tải lại MCP server</strong>.</p>`
    : "";

  const details = vm.statusLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("");
  const testBlock = vm.testLog
    ? `<pre class="log">${escapeHtml(vm.testLog)}</pre>`
    : '<p class="muted">Chưa chạy kiểm tra.</p>';

  const bootstrapBlock = vm.bootstrapLog
    ? `<pre class="log">${escapeHtml(vm.bootstrapLog)}</pre>`
    : "";

  const nodeBtn = vm.nodeOk
    ? ""
    : `<button id="btnNode" class="secondary" data-action="openNodeDownload">Tải Node.js</button>`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --btn: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --border: var(--vscode-panel-border);
      --muted: var(--vscode-descriptionForeground);
      --pass: #107c10;
      --warn: #ca5010;
      --danger: var(--vscode-errorForeground);
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background: var(--bg);
      margin: 0;
      padding: 16px;
      line-height: 1.55;
    }
    h1 { font-size: 1.15rem; margin: 0 0 4px; font-weight: 600; }
    h2 { font-size: 0.9rem; margin: 0 0 8px; font-weight: 600; }
    .subtitle { color: var(--muted); font-size: 0.85rem; margin-bottom: 14px; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .badge.pass { background: rgba(16,124,16,.15); color: var(--pass); }
    .badge.warn { background: rgba(202,80,16,.12); color: var(--warn); }
    .badge.danger { background: rgba(255,0,0,.1); color: var(--danger); }
    .card {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 14px;
    }
    ul, ol { margin: 0; padding-left: 18px; font-size: 0.85rem; }
    ul li, ol li { margin-bottom: 4px; }
    .actions { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
    button {
      width: 100%;
      padding: 10px 14px;
      border: none;
      border-radius: 4px;
      font-size: 0.9rem;
      cursor: pointer;
      background: var(--btn);
      color: var(--btn-fg);
    }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    button.secondary { background: transparent; color: var(--fg); border: 1px solid var(--border); }
    button.danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
    .warn-text { color: var(--warn); font-size: 0.85rem; margin: 0 0 10px; }
    .danger-text { color: var(--danger); }
    .muted { color: var(--muted); font-size: 0.85rem; }
    pre.log {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 4px;
      font-size: 0.75rem;
      overflow: auto;
      max-height: 160px;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
    }
    code { font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>Bảng điều khiển DMCTN MCP</h1>
  <p class="subtitle">Workspace: ${escapeHtml(vm.workspaceName)}</p>
  <div class="badges">${statusBadge}${nodeBadge}${serverBadge}</div>
  ${nodeWarn}
  ${serverWarn}
  ${updateWarn}

  <div class="card">
    <h2>Trạng thái cài đặt</h2>
    <ul>${details}</ul>
  </div>

  <div class="actions">
    <button id="btnInstall" ${installDisabled} data-action="install">${installLabel}</button>
    <button id="btnReinstall" class="secondary" ${vm.busy || !vm.nodeOk ? "disabled" : ""} data-action="reinstall">Tải lại MCP server (Reinstall)</button>
    ${nodeBtn}
    <button id="btnTest" class="secondary" ${vm.busy || !vm.serverOk ? "disabled" : ""} data-action="test">Kiểm tra MCP</button>
    <button id="btnUninstall" class="danger" ${vm.busy || !vm.installed ? "disabled" : ""} data-action="uninstall">Gỡ MCP khỏi VS Code</button>
    <button id="btnRefresh" class="secondary" ${vm.busy ? "disabled" : ""} data-action="refresh">Làm mới trạng thái</button>
  </div>

  ${bootstrapBlock ? `<div class="card"><h2>Nhật ký tải server</h2>${bootstrapBlock}</div>` : ""}

  <div class="card">
    <h2>Kết quả kiểm tra</h2>
    ${testBlock}
  </div>

  <div class="card">
    <h2>Hướng dẫn sử dụng</h2>
    <ol>
      <li>Cài <strong>Node.js LTS ≥ 18</strong> nếu chưa có (nút Tải Node.js).</li>
      <li>Mở bất kỳ workspace nào trong VS Code.</li>
      <li>Bấm <strong>Cài đặt MCP DMCTN</strong> — extension tự tải MCP server (lần đầu cần mạng).</li>
      <li>Đã cài nhưng cần bản mới → <strong>Tải lại MCP server (Reinstall)</strong> hoặc Command Palette: <code>DMCTN MCP: Reinstall Server</code>.</li>
      <li><strong>Developer: Reload Window</strong> (Ctrl+Shift+P).</li>
      <li>Mở <strong>Copilot Chat</strong> → chọn agent <strong>DMCTN-MCP</strong>.</li>
      <li>Gửi thử: <code>Gọi check_system qua MCP local-coding-tools</code></li>
      <li>Bấm <strong>Kiểm tra MCP</strong> để smoke test cục bộ (không dùng npx).</li>
    </ol>
    <p class="muted">Server lưu tại <code>~/.dmctn/servers/local-coding-tools-mcp</code>. Không dùng npx.</p>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        vscode.postMessage({ type: btn.dataset.action });
      });
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
