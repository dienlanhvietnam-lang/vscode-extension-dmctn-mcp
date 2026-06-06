import * as vscode from "vscode";
import { renderDashboardHtml } from "./dashboardHtml";
import { getInstallStatus } from "./installStatus";
import { checkSystemNode, NODE_DOWNLOAD_URL } from "./nodeCheck";
import { runMcpSmokeTest } from "./mcpTest";
import { buildMcpJsonContent, resolveServerRoot } from "./paths";
import { loadServerManifest } from "./serverManifest";
import {
  ensureMcpServer,
  getBundledServerRoot,
  GLOBAL_STATE_VERSION_KEY,
  isBundledServerReady,
} from "./serverBootstrap";
import { syncWorkspaceFiles } from "./syncWorkspace";
import { uninstallWorkspaceFiles } from "./uninstallWorkspace";

export class DashboardProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "dmctnMcp.dashboard";

  private view?: vscode.WebviewView;
  private testLog = "";
  private bootstrapLog = "";
  private busy = false;
  private nodeOk = false;
  private nodeVersion = "đang kiểm tra…";

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly templatesRoot: string,
    private readonly onMcpChanged: () => void,
    private readonly isMcpDisabled: () => boolean
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.onDidReceiveMessage(async (msg: { type: string }) => {
      switch (msg.type) {
        case "refresh":
          await this.postState();
          break;
        case "install":
          await this.handleInstall();
          break;
        case "test":
          await this.handleTest();
          break;
        case "uninstall":
          await this.handleUninstall();
          break;
        case "openNodeDownload":
          void vscode.env.openExternal(vscode.Uri.parse(NODE_DOWNLOAD_URL));
          break;
      }
    });

    void this.postState();
  }

  refresh(): void {
    void this.postState();
  }

  private getPrimaryFolder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
  }

  private disabledKey(ws: string): string {
    return `dmctnMcp.disabled.${ws}`;
  }

  private isUserDisabled(ws: string): boolean {
    return this.context.workspaceState.get<boolean>(this.disabledKey(ws), false);
  }

  private async setUserDisabled(ws: string, disabled: boolean): Promise<void> {
    await this.context.workspaceState.update(this.disabledKey(ws), disabled);
  }

  private getDmctnConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("dmctnMcp");
  }

  private async postState(): Promise<void> {
    if (!this.view) return;

    const manifest = loadServerManifest(this.templatesRoot);
    const nodeCheck = await checkSystemNode(manifest.minNodeMajor ?? 18);
    this.nodeOk = nodeCheck.ok;
    this.nodeVersion = nodeCheck.ok ? `v${nodeCheck.version}` : nodeCheck.message;

    const installedVer = this.context.globalState.get<string>(GLOBAL_STATE_VERSION_KEY);
    const bundledRoot = getBundledServerRoot();
    const serverBundled = isBundledServerReady(bundledRoot);
    const serverVersion = installedVer || manifest.version;

    const folder = this.getPrimaryFolder();
    if (!folder) {
      this.view.webview.html = renderDashboardHtml({
        installed: false,
        serverOk: serverBundled,
        workspaceName: "(Chưa mở workspace)",
        statusLines: ["Mở thư mục dự án trước khi cài MCP.", `Node.js: ${this.nodeVersion}`],
        testLog: this.testLog,
        busy: this.busy,
        userDisabled: false,
        nodeOk: this.nodeOk,
        nodeVersion: this.nodeVersion,
        serverBundled,
        serverVersion,
        bootstrapLog: this.bootstrapLog,
        canInstall: this.nodeOk,
      });
      return;
    }

    const ws = folder.uri.fsPath;
    const cfg = this.getDmctnConfig();
    const status = getInstallStatus(ws, cfg.get<string>("serverRoot", ""), this.isUserDisabled(ws));

    if (!status.details.some((d) => d.startsWith("Node.js:"))) {
      status.details.unshift(`Node.js: ${this.nodeVersion}`);
    }

    this.view.webview.html = renderDashboardHtml({
      installed: status.installed,
      serverOk: status.serverOk,
      workspaceName: folder.name,
      statusLines: status.details,
      testLog: this.testLog,
      busy: this.busy,
      userDisabled: this.isUserDisabled(ws),
      nodeOk: this.nodeOk,
      nodeVersion: this.nodeVersion,
      serverBundled,
      serverVersion,
      bootstrapLog: this.bootstrapLog,
      canInstall: this.nodeOk,
    });
  }

  private async handleInstall(): Promise<void> {
    const folder = this.getPrimaryFolder();
    if (!folder) return;

    const ws = folder.uri.fsPath;
    const cfg = this.getDmctnConfig();
    const manifest = loadServerManifest(this.templatesRoot);
    const status = getInstallStatus(ws, cfg.get<string>("serverRoot", ""), this.isUserDisabled(ws));

    if (status.installed) {
      void vscode.window.showInformationMessage("DMCTN MCP: Đã cài đặt — bỏ qua bước cài.");
      return;
    }

    const nodeCheck = await checkSystemNode(manifest.minNodeMajor ?? 18);
    if (!nodeCheck.ok) {
      void vscode.window
        .showErrorMessage(`DMCTN MCP: ${nodeCheck.message}`, "Tải Node.js")
        .then((c) => {
          if (c === "Tải Node.js") {
            void vscode.env.openExternal(vscode.Uri.parse(NODE_DOWNLOAD_URL));
          }
        });
      await this.postState();
      return;
    }

    this.busy = true;
    this.bootstrapLog = "";
    await this.postState();

    let resolved = resolveServerRoot([ws], cfg.get<string>("serverRoot", ""));
    const autoBootstrap = cfg.get<boolean>("autoBootstrapServer", true);

    if ((!resolved.ok || !resolved.serverJs) && autoBootstrap) {
      const bootstrap = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "DMCTN MCP",
          cancellable: false,
        },
        async (progress) => {
          return ensureMcpServer({
            extensionResourcesPath: this.templatesRoot,
            globalState: this.context.globalState,
            configuredVersion: cfg.get<string>("serverVersion", ""),
            configuredUrl: cfg.get<string>("serverDownloadUrl", ""),
            onProgress: (m) => progress.report({ message: m }),
          });
        }
      );

      this.bootstrapLog = bootstrap.log.join("\n");
      if (!bootstrap.ok) {
        this.busy = false;
        void vscode.window.showErrorMessage(`DMCTN MCP: ${bootstrap.error ?? "Tải server thất bại"}`);
        await this.postState();
        return;
      }

      resolved = resolveServerRoot([ws], cfg.get<string>("serverRoot", ""));
    }

    if (!resolved.ok || !resolved.serverJs || !resolved.serverRoot) {
      this.busy = false;
      void vscode.window.showErrorMessage(`DMCTN MCP: ${resolved.error}`);
      await this.postState();
      return;
    }

    const sync = syncWorkspaceFiles({
      workspaceRoot: ws,
      mcpJsonContent: buildMcpJsonContent(resolved.serverJs, resolved.serverRoot),
      extensionResourcePath: this.templatesRoot,
      backupExisting: true,
    });

    this.busy = false;

    if (!sync.ok) {
      void vscode.window.showErrorMessage(sync.errors.join("; "));
      await this.postState();
      return;
    }

    await this.setUserDisabled(ws, false);
    this.onMcpChanged();

    void vscode.window
      .showInformationMessage(
        "DMCTN MCP: Cài đặt thành công. Reload Window và chọn agent DMCTN-MCP trong Copilot.",
        "Tải lại cửa sổ"
      )
      .then((c) => {
        if (c === "Tải lại cửa sổ") {
          void vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });

    await this.postState();
  }

  private async handleTest(): Promise<void> {
    const folder = this.getPrimaryFolder();
    if (!folder) return;

    const ws = folder.uri.fsPath;
    const cfg = this.getDmctnConfig();
    const resolved = resolveServerRoot([ws], cfg.get<string>("serverRoot", ""));

    if (!resolved.ok || !resolved.serverRoot) {
      this.testLog = `FAIL — ${resolved.error}`;
      await this.postState();
      return;
    }

    this.busy = true;
    this.testLog = "Đang chạy kiểm tra MCP (pilot-stdio)…";
    await this.postState();

    const result = await runMcpSmokeTest(resolved.serverRoot, ws);
    this.busy = false;
    this.testLog = `${result.summary}\n${result.detail ?? ""}`.trim();

    if (result.ok) {
      void vscode.window.showInformationMessage("DMCTN MCP: Kiểm tra PASS");
    } else {
      void vscode.window.showErrorMessage("DMCTN MCP: Kiểm tra FAIL — xem bảng điều khiển");
    }

    await this.postState();
  }

  private async handleUninstall(): Promise<void> {
    const folder = this.getPrimaryFolder();
    if (!folder) return;

    const choice = await vscode.window.showWarningMessage(
      "Gỡ MCP DMCTN khỏi workspace này? File sẽ được backup rồi vô hiệu hóa.",
      { modal: true },
      "Gỡ MCP"
    );
    if (choice !== "Gỡ MCP") return;

    const ws = folder.uri.fsPath;
    this.busy = true;
    await this.postState();

    const result = uninstallWorkspaceFiles(ws);
    await this.setUserDisabled(ws, true);
    this.onMcpChanged();

    this.busy = false;
    this.testLog = result.actions.join("\n");

    if (!result.ok) {
      void vscode.window.showErrorMessage(result.errors.join("; "));
    } else {
      void vscode.window
        .showInformationMessage("DMCTN MCP: Đã gỡ. Nên tải lại cửa sổ.", "Tải lại cửa sổ")
        .then((c) => {
          if (c === "Tải lại cửa sổ") {
            void vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        });
    }

    await this.postState();
  }
}
