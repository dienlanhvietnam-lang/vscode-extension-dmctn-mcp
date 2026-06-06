import * as fs from "node:fs";
import * as path from "node:path";

export interface UninstallResult {
  ok: boolean;
  workspaceRoot: string;
  actions: string[];
  errors: string[];
}

function formatStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function disableFile(filePath: string, stamp: string): string | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  const bak = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, bak);
  const disabled = `${filePath}.disabled-${stamp}`;
  fs.renameSync(filePath, disabled);
  return disabled;
}

export function uninstallWorkspaceFiles(workspaceRoot: string): UninstallResult {
  const result: UninstallResult = {
    ok: true,
    workspaceRoot,
    actions: [],
    errors: [],
  };

  const stamp = formatStamp(new Date());
  const targets = [
    path.join(workspaceRoot, ".vscode", "mcp.json"),
    path.join(workspaceRoot, ".github", "agents", "DMCTN-MCP.agent.md"),
    path.join(workspaceRoot, ".github", "copilot-instructions.md"),
  ];

  try {
    for (const t of targets) {
      const disabled = disableFile(t, stamp);
      if (disabled) {
        result.actions.push(`Đã vô hiệu: ${path.basename(disabled)}`);
      }
    }
    if (result.actions.length === 0) {
      result.actions.push("Không có file MCP DMCTN để gỡ trong workspace này.");
    }
  } catch (err) {
    result.ok = false;
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}
