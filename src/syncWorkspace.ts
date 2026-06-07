import * as fs from "node:fs";
import * as path from "node:path";

export interface SyncResult {
  ok: boolean;
  workspaceRoot: string;
  files: Array<{ path: string; action: string }>;
  errors: string[];
}

function backupIfExists(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  const stamp = formatStamp(new Date());
  const bak = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, bak);
  return bak;
}

function formatStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeUtf8NoBom(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, { encoding: "utf8" });
}

function copyTemplate(
  templatePath: string,
  destPath: string,
  doBackup: boolean,
  force = false
): string {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template missing: ${templatePath}`);
  }
  let action = "written";
  ensureDir(path.dirname(destPath));
  if (fs.existsSync(destPath)) {
    if (doBackup || force) {
      backupIfExists(destPath);
      action = "updated (backed up)";
    } else {
      action = "skipped (exists)";
      return action;
    }
  }
  fs.copyFileSync(templatePath, destPath);
  return action;
}

/** True when workspace agent/instructions lack current MCP_ONLY policy. */
export function workspaceNeedsPolicyUpdate(
  workspaceRoot: string,
  agentTemplatePath: string
): boolean {
  const agentDest = path.join(workspaceRoot, ".github", "agents", "DMCTN-MCP.agent.md");
  const instrDest = path.join(workspaceRoot, ".github", "copilot-instructions.md");

  if (!fs.existsSync(agentDest) || !fs.existsSync(instrDest)) {
    return true;
  }

  const agentText = fs.readFileSync(agentDest, "utf8");
  const instrText = fs.readFileSync(instrDest, "utf8");
  const hasMcpOnly = /MCP_ONLY|BẮT BUỘC/.test(agentText) && /MCP_ONLY|BẮT BUỘC/.test(instrText);
  const hasTodoAuto = /TODO_AUTO/.test(agentText);
  const hasResponseStyle = /RESPONSE_STYLE/.test(agentText);
  const hasUiDesignLoop = /UI_DESIGN_LOOP/.test(agentText);
  const hasExplicitTools =
    /local-coding-tools\/check_system/.test(agentText) &&
    /local-coding-tools\/fetch_cached_output/.test(agentText) &&
    /local-coding-tools\/capture_screenshot/.test(agentText);

  if (!hasMcpOnly || !hasExplicitTools || !hasTodoAuto || !hasResponseStyle || !hasUiDesignLoop) {
    return true;
  }

  if (!fs.existsSync(agentTemplatePath)) {
    return false;
  }

  const templateText = fs.readFileSync(agentTemplatePath, "utf8");
  const templateTools = (templateText.match(/local-coding-tools\/[a-z_]+/g) ?? []).length;
  const destTools = (agentText.match(/local-coding-tools\/[a-z_]+/g) ?? []).length;
  return templateTools > 0 && destTools < templateTools;
}

export function syncWorkspaceFiles(options: {
  workspaceRoot: string;
  mcpJsonContent: string;
  extensionResourcePath: string;
  backupExisting?: boolean;
  /** Always overwrite agent + copilot-instructions (first-run / policy upgrade). */
  forcePolicy?: boolean;
}): SyncResult {
  const { workspaceRoot, mcpJsonContent, extensionResourcePath } = options;
  const backupExisting = options.backupExisting ?? true;
  const forcePolicy = options.forcePolicy ?? false;
  const result: SyncResult = {
    ok: true,
    workspaceRoot,
    files: [],
    errors: [],
  };

  try {
    const vscodeDir = path.join(workspaceRoot, ".vscode");
    const mcpFile = path.join(vscodeDir, "mcp.json");
    ensureDir(vscodeDir);
    if (fs.existsSync(mcpFile) && backupExisting) {
      backupIfExists(mcpFile);
    }
    writeUtf8NoBom(mcpFile, mcpJsonContent);
    result.files.push({ path: mcpFile, action: "written" });

    const agentDest = path.join(workspaceRoot, ".github", "agents", "DMCTN-MCP.agent.md");
    const instrDest = path.join(workspaceRoot, ".github", "copilot-instructions.md");
    const agentTpl = path.join(extensionResourcePath, "templates", "DMCTN-MCP.agent.md");
    const instrTpl = path.join(extensionResourcePath, "templates", "copilot-instructions.md");

    result.files.push({
      path: agentDest,
      action: copyTemplate(agentTpl, agentDest, backupExisting, forcePolicy),
    });
    result.files.push({
      path: instrDest,
      action: copyTemplate(instrTpl, instrDest, backupExisting, forcePolicy),
    });
  } catch (err) {
    result.ok = false;
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

export function validateMcpJsonContent(content: string): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (/\bnpx(\.cmd|\.ps1)?\b/i.test(content)) {
    reasons.push("contains npx");
  }
  if (/\b(api[_-]?key|token|password|secret)\b/i.test(content)) {
    reasons.push("contains secret pattern");
  }
  try {
    const parsed = JSON.parse(content) as {
      servers?: Record<string, { command?: string; type?: string; args?: string[]; cwd?: string }>;
    };
    const s = parsed.servers?.["local-coding-tools"];
    if (!s) reasons.push("missing local-coding-tools server");
    else {
      if (s.command !== "node") reasons.push("command must be node");
      if (s.type !== "stdio") reasons.push("type must be stdio");
      const args = (s.args ?? []).join("/").replace(/\\/g, "/").toLowerCase();
      if (!args.includes("dist/server.js")) reasons.push("args must point to dist/server.js");
    }
  } catch {
    reasons.push("invalid JSON");
  }
  return { ok: reasons.length === 0, reasons };
}
