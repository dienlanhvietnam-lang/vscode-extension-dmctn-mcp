import * as fs from "node:fs";
import * as path from "node:path";
import { validateMcpJsonContent } from "./syncWorkspace";
import { resolveServerRoot } from "./paths";
import { getBundledServerRoot, isBundledServerReady } from "./serverBootstrap";

export interface InstallStatus {
  installed: boolean;
  serverOk: boolean;
  workspaceRoot: string;
  details: string[];
  serverRoot?: string;
  serverJs?: string;
}

export function getInstallStatus(
  workspaceRoot: string,
  configuredServerRoot: string,
  userDisabled: boolean
): InstallStatus {
  const details: string[] = [];
  const resolved = resolveServerRoot([workspaceRoot], configuredServerRoot);

  if (userDisabled) {
    return {
      installed: false,
      serverOk: resolved.ok,
      workspaceRoot,
      details: ["Người dùng đã gỡ MCP khỏi workspace này."],
      serverRoot: resolved.serverRoot,
      serverJs: resolved.serverJs,
    };
  }

  const mcpFile = path.join(workspaceRoot, ".vscode", "mcp.json");
  const agentFile = path.join(workspaceRoot, ".github", "agents", "DMCTN-MCP.agent.md");
  const instrFile = path.join(workspaceRoot, ".github", "copilot-instructions.md");

  let mcpOk = false;
  if (fs.existsSync(mcpFile)) {
    const content = fs.readFileSync(mcpFile, "utf8");
    const v = validateMcpJsonContent(content);
    mcpOk = v.ok;
    details.push(mcpOk ? "mcp.json: hợp lệ" : `mcp.json: ${v.reasons.join(", ")}`);
  } else {
    details.push("mcp.json: chưa có");
  }

  const agentOk = fs.existsSync(agentFile);
  details.push(agentOk ? "DMCTN-MCP.agent.md: có" : "DMCTN-MCP.agent.md: chưa có");

  const instrOk = fs.existsSync(instrFile);
  details.push(instrOk ? "copilot-instructions.md: có" : "copilot-instructions.md: chưa có");

  const bundledRoot = getBundledServerRoot();
  if (isBundledServerReady(bundledRoot)) {
    details.push(`Server bundled: ${bundledRoot} (sẵn sàng)`);
  } else if (fs.existsSync(path.join(bundledRoot, "dist", "server.js"))) {
    details.push(`Server bundled: ${bundledRoot} (thiếu node_modules — chạy lại Cài đặt)`);
  } else {
    details.push("Server bundled: chưa tải (bấm Cài đặt để tải tự động)");
  }

  if (resolved.ok) {
    details.push(`Máy chủ đang dùng: ${resolved.serverJs}`);
  } else {
    details.push(`Máy chủ: ${resolved.error ?? "không tìm thấy"}`);
  }

  const installed = mcpOk && agentOk && instrOk && resolved.ok;

  return {
    installed,
    serverOk: resolved.ok,
    workspaceRoot,
    details,
    serverRoot: resolved.serverRoot,
    serverJs: resolved.serverJs,
  };
}
