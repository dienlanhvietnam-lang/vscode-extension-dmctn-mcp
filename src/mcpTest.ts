import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface McpTestResult {
  ok: boolean;
  summary: string;
  detail?: string;
  durationMs: number;
}

/** Chạy pilot-stdio.mjs — không dùng npx. */
export function runMcpSmokeTest(serverRoot: string, workspacePath: string): Promise<McpTestResult> {
  const script = path.join(serverRoot, "scripts", "pilot-stdio.mjs");
  const start = Date.now();

  if (!fs.existsSync(script)) {
    return Promise.resolve({
      ok: false,
      summary: "FAIL — thiếu scripts/pilot-stdio.mjs",
      durationMs: 0,
    });
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, workspacePath], {
      cwd: serverRoot,
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => (stdout += c.toString()));
    child.stderr?.on("data", (c) => (stderr += c.toString()));

    child.on("close", (code) => {
      const durationMs = Date.now() - start;
      let parsed: { initialize?: string; toolCount?: number; check_system?: string } = {};
      try {
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i]!.startsWith("{")) {
            parsed = JSON.parse(lines[i]!);
            break;
          }
        }
      } catch {
        // ignore
      }

      const pass =
        code === 0 &&
        parsed.initialize === "PASS" &&
        (parsed.toolCount ?? 0) >= 1 &&
        parsed.check_system === "PASS";

      resolve({
        ok: pass,
        summary: pass
          ? `PASS — ${parsed.toolCount ?? "?"} công cụ, check_system OK (${durationMs}ms)`
          : `FAIL — exit ${code ?? "?"}`,
        detail: pass ? stdout.slice(-1500) : (stderr || stdout).slice(-1500),
        durationMs,
      });
    });

    child.on("error", (err) => {
      resolve({
        ok: false,
        summary: `FAIL — ${err.message}`,
        durationMs: Date.now() - start,
      });
    });
  });
}
