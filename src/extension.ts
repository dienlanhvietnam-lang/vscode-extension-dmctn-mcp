import * as vscode from "vscode";
import * as path from "node:path";
import { MCP_PROVIDER_ID, SERVER_LABEL } from "./config";
import { DashboardProvider } from "./dashboardProvider";
import {
  applyStartupPolicy,
  showFirstRunPolicyNotice,
  shouldApplyStartupPolicy,
} from "./firstRunPolicy";
import { buildMcpJsonContent, resolveServerRoot } from "./paths";
import { syncWorkspaceFiles, workspaceNeedsPolicyUpdate } from "./syncWorkspace";

let mcpChangeEmitter = new vscode.EventEmitter<void>();
let dashboardProvider: DashboardProvider | undefined;

function isWorkspaceMcpDisabled(context: vscode.ExtensionContext, ws: string): boolean {
  return context.workspaceState.get<boolean>(`dmctnMcp.disabled.${ws}`, false);
}

export function activate(context: vscode.ExtensionContext): void {
  const templatesRoot = path.join(context.extensionPath, "resources");

  const provider: vscode.McpServerDefinitionProvider = {
    onDidChangeMcpServerDefinitions: mcpChangeEmitter.event,
    provideMcpServerDefinitions: async () => {
      const folders = vscode.workspace.workspaceFolders ?? [];
      const paths = folders.map((f) => f.uri.fsPath);
      const cfg = vscode.workspace.getConfiguration("dmctnMcp");
      const configured = cfg.get<string>("serverRoot", "");

      if (folders.length === 1 && isWorkspaceMcpDisabled(context, folders[0]!.uri.fsPath)) {
        return [];
      }

      const resolved = resolveServerRoot(paths, configured);
      if (!resolved.ok || !resolved.serverJs || !resolved.serverRoot) {
        return [];
      }

      return [
        new vscode.McpStdioServerDefinition(
          SERVER_LABEL,
          "node",
          [resolved.serverJs],
          { DMCTN_MCP_SERVER_ROOT: resolved.serverRoot },
          "0.11.2"
        ),
      ];
    },
    resolveMcpServerDefinition: async (server) => {
      if (server.label === SERVER_LABEL) {
        return server;
      }
      return undefined;
    },
  };

  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, provider)
  );

  const onMcpChanged = () => {
    mcpChangeEmitter.fire();
    dashboardProvider?.refresh();
  };

  dashboardProvider = new DashboardProvider(
    context,
    templatesRoot,
    onMcpChanged,
    () => false
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DashboardProvider.viewType,
      dashboardProvider
    )
  );

  const setupCmd = vscode.commands.registerCommand("dmctnMcp.setupWorkspace", async () => {
    await runWorkspaceSync(context, templatesRoot, true);
    onMcpChanged();
  });

  const hintCmd = vscode.commands.registerCommand("dmctnMcp.showAgentHint", () => {
    showAgentHint();
  });

  const verifyCmd = vscode.commands.registerCommand("dmctnMcp.verifyServer", async () => {
    const paths = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const cfg = vscode.workspace.getConfiguration("dmctnMcp");
    const resolved = resolveServerRoot(paths, cfg.get<string>("serverRoot", ""));
    if (resolved.ok) {
      void vscode.window.showInformationMessage(
        `DMCTN MCP: Máy chủ OK — ${resolved.serverJs}`
      );
    } else {
      void vscode.window.showErrorMessage(`DMCTN MCP: ${resolved.error}`);
    }
  });

  const openDashboardCmd = vscode.commands.registerCommand("dmctnMcp.openDashboard", async () => {
    await vscode.commands.executeCommand("workbench.view.extension.dmctnMcp");
  });

  const reinstallCmd = vscode.commands.registerCommand("dmctnMcp.reinstallServer", async () => {
    await dashboardProvider?.runReinstallServer();
  });

  context.subscriptions.push(setupCmd, hintCmd, verifyCmd, openDashboardCmd, reinstallCmd);

  void runStartupPolicyFlow(context, templatesRoot, onMcpChanged);

  if (vscode.workspace.getConfiguration("dmctnMcp").get<boolean>("autoSyncOnOpen", true)) {
    void runWorkspaceSync(context, templatesRoot, false).then(() => onMcpChanged());
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      mcpChangeEmitter.fire();
      void runStartupPolicyFlow(context, templatesRoot, onMcpChanged);
      if (vscode.workspace.getConfiguration("dmctnMcp").get<boolean>("autoSyncOnOpen", true)) {
        void runWorkspaceSync(context, templatesRoot, false).then(() => onMcpChanged());
      }
      dashboardProvider?.refresh();
    })
  );
}

async function runStartupPolicyFlow(
  context: vscode.ExtensionContext,
  templatesRoot: string,
  onMcpChanged: () => void
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("dmctnMcp");
  if (!shouldApplyStartupPolicy(context.globalState, cfg)) {
    return;
  }

  const result = await applyStartupPolicy({
    context,
    templatesRoot,
    isWorkspaceDisabled: (ws) => isWorkspaceMcpDisabled(context, ws),
    forceOverwrite: true,
  });

  if (result.applied) {
    onMcpChanged();
    showFirstRunPolicyNotice(result);
    return;
  }

  if (result.skippedReason === "server-unavailable" || result.skippedReason === "no-workspace") {
    return;
  }

  if (result.skippedReason && result.skippedReason !== "policy-up-to-date") {
    void vscode.window.showWarningMessage(
      `DMCTN MCP: Chưa áp dụng quy tắc MCP_ONLY — ${result.skippedReason}`
    );
  }
}

async function runWorkspaceSync(
  context: vscode.ExtensionContext,
  templatesRoot: string,
  showToast: boolean
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    if (showToast) {
      void vscode.window.showWarningMessage("DMCTN MCP: Chưa mở workspace.");
    }
    return;
  }

  const cfg = vscode.workspace.getConfiguration("dmctnMcp");
  const configured = cfg.get<string>("serverRoot", "");
  const resolved = resolveServerRoot(
    folders.map((f) => f.uri.fsPath),
    configured
  );

  if (!resolved.ok || !resolved.serverJs || !resolved.serverRoot) {
    if (showToast) {
      void vscode.window.showErrorMessage(`DMCTN MCP: ${resolved.error}`);
    }
    return;
  }

  const mcpContent = buildMcpJsonContent(resolved.serverJs, resolved.serverRoot);
  const agentTpl = path.join(templatesRoot, "templates", "DMCTN-MCP.agent.md");
  const outputs: string[] = [];

  for (const folder of folders) {
    const ws = folder.uri.fsPath;
    if (isWorkspaceMcpDisabled(context, ws)) {
      continue;
    }
    const sync = syncWorkspaceFiles({
      workspaceRoot: ws,
      mcpJsonContent: mcpContent,
      extensionResourcePath: templatesRoot,
      backupExisting: true,
      forcePolicy: workspaceNeedsPolicyUpdate(ws, agentTpl),
    });
    if (!sync.ok) {
      void vscode.window.showErrorMessage(sync.errors.join("; "));
      return;
    }
    for (const f of sync.files) {
      outputs.push(`${path.basename(f.path)}: ${f.action}`);
    }
  }

  mcpChangeEmitter.fire();

  if (showToast && outputs.length) {
    void vscode.window.showInformationMessage(
      `DMCTN MCP: Đồng bộ workspace (${outputs.join(", ")})`
    );
  }

  if (cfg.get<boolean>("showAgentHintOnOpen", true) && showToast) {
    showAgentHint();
  }
}

function showAgentHint(): void {
  const action = "Mở Copilot Chat";
  void vscode.window
    .showInformationMessage(
      "DMCTN MCP: Chọn agent DMCTN-MCP trong Copilot (không dùng agent mặc định). Thử: Gọi check_system qua MCP local-coding-tools",
      action
    )
    .then((choice) => {
      if (choice === action) {
        void vscode.commands.executeCommand("workbench.action.chat.open");
      }
    });
}

export function deactivate(): void {
  mcpChangeEmitter.dispose();
}
