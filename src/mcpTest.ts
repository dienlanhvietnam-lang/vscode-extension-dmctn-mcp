import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { getSystemNodeCommand } from "./nodeCheck";

export interface McpTestResult {
  ok: boolean;
  summary: string;
  detail?: string;
  durationMs: number;
}

interface PilotReport {
  initialize?: string;
  toolsList?: string;
  toolCount?: number;
  check_system?: string;
  run_coding_session?: string;
  error?: string;
}

/** pilot-stdio in JSON pretty-print (multi-line) — lấy object đầu/cuối { }. */
export function parsePilotReport(stdout: string): PilotReport {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as PilotReport;
  } catch {
    return {};
  }
}

/** Chạy pilot-stdio.mjs bằng Node hệ thống (PATH) — không dùng process.execPath của IDE. */
export function runMcpSmokeTest(serverRoot: string, workspacePath: string): Promise<McpTestResult> {
  const script = path.join(serverRoot, "scripts", "pilot-stdio.mjs");
  const start = Date.now();
  const nodeCmd = getSystemNodeCommand();

  if (!fs.existsSync(script)) {
    return Promise.resolve({
      ok: false,
      summary: "FAIL — thiếu scripts/pilot-stdio.mjs",
      durationMs: 0,
    });
  }

  return new Promise((resolve) => {
    const child = spawn(nodeCmd, [script, workspacePath], {
      cwd: serverRoot,
      shell: false,
      windowsHide: true,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => (stdout += c.toString()));
    child.stderr?.on("data", (c) => (stderr += c.toString()));

    child.on("close", (code) => {
      const durationMs = Date.now() - start;
      const parsed = parsePilotReport(stdout);

      const pass =
        code === 0 &&
        parsed.initialize === "PASS" &&
        (parsed.toolCount ?? 0) >= 1 &&
        parsed.check_system === "PASS";

      const warnNote = stderr.trim() ? `\n(stderr)\n${stderr.trim()}` : "";
      const failDetail = parsed.error
        ? `${parsed.error}\n${JSON.stringify(parsed, null, 2)}${warnNote}`
        : stderr.trim() || stdout || "(không có output)";

      resolve({
        ok: pass,
        summary: pass
          ? `PASS — ${parsed.toolCount ?? "?"} công cụ, check_system OK (${durationMs}ms)`
          : `FAIL — exit ${code ?? "?"}${parsed.error ? ` — ${parsed.error}` : ""}`,
        detail: pass
          ? `${stdout.slice(-1500)}${warnNote}`.trim()
          : failDetail.slice(-2000),
        durationMs,
      });
    });

    child.on("error", (err) => {
      resolve({
        ok: false,
        summary: `FAIL — không chạy được ${nodeCmd}: ${err.message}`,
        detail: "Đảm bảo Node.js ≥ 18 có trong PATH (giống lúc cài MCP).",
        durationMs: Date.now() - start,
      });
    });
  });
}
