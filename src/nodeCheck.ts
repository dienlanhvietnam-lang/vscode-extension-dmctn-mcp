import { spawn } from "node:child_process";

export interface NodeCheckResult {
  ok: boolean;
  version?: string;
  major?: number;
  message: string;
}

export const NODE_DOWNLOAD_URL = "https://nodejs.org/";

/** Parse "v20.11.0" or "20.11.0" → major version. */
export function parseNodeMajor(versionOutput: string, minMajor = 18): { ok: boolean; major?: number; version?: string } {
  const trimmed = versionOutput.trim().replace(/^v/i, "");
  const match = trimmed.match(/^(\d+)/);
  if (!match) {
    return { ok: false };
  }
  const major = Number.parseInt(match[1]!, 10);
  const version = trimmed.split(/\s/)[0];
  return { ok: major >= minMajor, major, version };
}

/** Check system Node.js from PATH (not VS Code embedded node). */
export function checkSystemNode(minMajor = 18): Promise<NodeCheckResult> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "node.exe" : "node";
    const child = spawn(cmd, ["--version"], {
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    child.stdout?.on("data", (c) => (stdout += c.toString()));
    child.stderr?.on("data", (c) => (stdout += c.toString()));

    child.on("error", () => {
      resolve({
        ok: false,
        message: `Cần Node.js LTS ≥ ${minMajor}. Tải tại nodejs.org`,
      });
    });

    child.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve({
          ok: false,
          message: `Cần Node.js LTS ≥ ${minMajor}. Tải tại nodejs.org`,
        });
        return;
      }

      const parsed = parseNodeMajor(stdout, minMajor);
      if (parsed.ok) {
        resolve({
          ok: true,
          version: parsed.version,
          major: parsed.major,
          message: `Node.js v${parsed.version} (OK)`,
        });
      } else {
        resolve({
          ok: false,
          version: parsed.version,
          major: parsed.major,
          message: `Node.js v${parsed.version ?? "?"} quá cũ — cần ≥ ${minMajor}`,
        });
      }
    });
  });
}
