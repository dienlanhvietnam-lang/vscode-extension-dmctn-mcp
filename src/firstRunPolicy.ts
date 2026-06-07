import * as vscode from "vscode";
import * as path from "node:path";
import { AGENT_NAME } from "./config";
import {
  GLOBAL_FIRST_RUN_KEY,
  GLOBAL_POLICY_VERSION_KEY,
  POLICY_VERSION,
  shouldApplyStartupPolicy,
} from "./policyState";
import { buildMcpJsonContent, resolveServerRoot } from "./paths";
import { syncWorkspaceFiles, workspaceNeedsPolicyUpdate } from "./syncWorkspace";

export { POLICY_VERSION, shouldApplyStartupPolicy };

export interface FirstRunPolicyResult {
  applied: boolean;
  skippedReason?: string;
  workspaces: string[];
  actions: string[];
}

export async function markStartupPolicyApplied(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.globalState.update(GLOBAL_FIRST_RUN_KEY, true);
  await context.globalState.update(GLOBAL_POLICY_VERSION_KEY, POLICY_VERSION);
}

export async function applyStartupPolicy(options: {
  context: vscode.ExtensionContext;
  templatesRoot: string;
  isWorkspaceDisabled: (ws: string) => boolean;
  forceOverwrite?: boolean;
}): Promise<FirstRunPolicyResult> {
  const { context, templatesRoot, isWorkspaceDisabled } = options;
  const cfg = vscode.workspace.getConfiguration("dmctnMcp");
  const folders = vscode.workspace.workspaceFolders ?? [];

  if (!shouldApplyStartupPolicy(context.globalState, cfg)) {
    return { applied: false, skippedReason: "policy-up-to-date", workspaces: [], actions: [] };
  }

  if (!folders.length) {
    return { applied: false, skippedReason: "no-workspace", workspaces: [], actions: [] };
  }

  const configured = cfg.get<string>("serverRoot", "");
  const resolved = resolveServerRoot(
    folders.map((f) => f.uri.fsPath),
    configured
  );

  if (!resolved.ok || !resolved.serverJs || !resolved.serverRoot) {
    return {
      applied: false,
      skippedReason: resolved.error ?? "server-unavailable",
      workspaces: [],
      actions: [],
    };
  }

  const mcpContent = buildMcpJsonContent(resolved.serverJs, resolved.serverRoot);
  const agentTpl = path.join(templatesRoot, "templates", "DMCTN-MCP.agent.md");
  const forceOverwrite = options.forceOverwrite ?? true;
  const workspaces: string[] = [];
  const actions: string[] = [];

  for (const folder of folders) {
    const ws = folder.uri.fsPath;
    if (isWorkspaceDisabled(ws)) {
      continue;
    }

    const needsUpdate =
      forceOverwrite || workspaceNeedsPolicyUpdate(ws, agentTpl);
    if (!needsUpdate) {
      workspaces.push(ws);
      actions.push(`${folder.name}: đã có policy MCP_ONLY`);
      continue;
    }

    const sync = syncWorkspaceFiles({
      workspaceRoot: ws,
      mcpJsonContent: mcpContent,
      extensionResourcePath: templatesRoot,
      backupExisting: true,
      forcePolicy: true,
    });

    if (!sync.ok) {
      return {
        applied: false,
        skippedReason: sync.errors.join("; "),
        workspaces,
        actions,
      };
    }

    workspaces.push(ws);
    for (const f of sync.files) {
      actions.push(`${path.basename(f.path)}: ${f.action}`);
    }
  }

  if (workspaces.length === 0) {
    return { applied: false, skippedReason: "all-workspaces-disabled", workspaces, actions };
  }

  await markStartupPolicyApplied(context);
  return { applied: true, workspaces, actions };
}

export function showFirstRunPolicyNotice(
  result: FirstRunPolicyResult,
  onOpenCopilot?: () => void
): void {
  if (!result.applied) {
    return;
  }

  const reload = "Tải lại cửa sổ";
  const copilot = "Mở Copilot Chat";

  void vscode.window
    .showInformationMessage(
      `DMCTN MCP: Đã áp dụng quy tắc MCP_ONLY (80 tools) — chọn agent ${AGENT_NAME} trong Copilot.`,
      reload,
      copilot
    )
    .then((choice) => {
      if (choice === reload) {
        void vscode.commands.executeCommand("workbench.action.reloadWindow");
      } else if (choice === copilot) {
        onOpenCopilot?.();
        void vscode.commands.executeCommand("workbench.action.chat.open");
      }
    });
}
