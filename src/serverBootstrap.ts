import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as https from "node:https";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadServerManifest, resolveManifestOptions } from "./serverManifest";

export const BUNDLED_SERVER_DIR = "local-coding-tools-mcp";
export const GLOBAL_STATE_VERSION_KEY = "dmctnMcp.serverInstalledVersion";

export interface BootstrapResult {
  ok: boolean;
  serverRoot?: string;
  serverJs?: string;
  skipped?: boolean;
  log: string[];
  error?: string;
}

export interface BootstrapOptions {
  extensionResourcesPath: string;
  globalState: { get<T>(key: string): T | undefined; update(key: string, value: unknown): Thenable<void> };
  configuredVersion?: string;
  configuredUrl?: string;
  force?: boolean;
  onProgress?: (message: string) => void;
}

export function getBundledServerRoot(): string {
  return path.join(os.homedir(), ".dmctn", "servers", BUNDLED_SERVER_DIR);
}

export function isBundledServerReady(serverRoot: string): boolean {
  const serverJs = path.join(serverRoot, "dist", "server.js");
  const nodeModules = path.join(serverRoot, "node_modules");
  return fs.existsSync(serverJs) && fs.existsSync(nodeModules);
}

export function needsServerBootstrap(
  serverRoot: string,
  expectedVersion: string,
  installedVersion: string | undefined
): boolean {
  if (installedVersion !== expectedVersion) return true;
  return !isBundledServerReady(serverRoot);
}

function logPush(log: string[], onProgress: ((m: string) => void) | undefined, message: string): void {
  log.push(message);
  onProgress?.(message);
}

/** Resolve file://, absolute path, or http(s) URL to a local zip path (copy or download). */
export async function acquireZipFile(source: string, dest: string): Promise<void> {
  const trimmed = source.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    await downloadFile(trimmed, dest);
    return;
  }

  let localPath = trimmed;
  if (trimmed.startsWith("file://")) {
    localPath = fileURLToPath(trimmed);
  }

  if (!fs.existsSync(localPath)) {
    throw new Error(`Không tìm thấy file zip: ${localPath}`);
  }
  fs.copyFileSync(localPath, dest);
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = url.startsWith("https:") ? https.get : http.get;

    const request = get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode} khi tải ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    });

    request.on("error", (err) => {
      file.close();
      try {
        fs.unlinkSync(dest);
      } catch {
        // ignore
      }
      reject(err);
    });
  });
}

function sha256File(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex").toUpperCase();
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 300_000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === "win32",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timeout sau ${timeoutMs / 1000}s: ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout?.on("data", (c) => (stdout += c.toString()));
    child.stderr?.on("data", (c) => (stderr += c.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  if (process.platform === "win32") {
    const ps = [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ];
    const r = await runCommand("powershell.exe", ps, os.tmpdir());
    if (r.code !== 0) {
      throw new Error(`Giải nén thất bại: ${r.stderr || r.stdout}`);
    }
    return;
  }

  const r = await runCommand("unzip", ["-o", zipPath, "-d", destDir], os.tmpdir());
  if (r.code !== 0) {
    throw new Error(`Giải nén thất bại (unzip): ${r.stderr || r.stdout}`);
  }
}

/** If zip extracts into a single subfolder, hoist contents up. */
export function normalizeExtractedRoot(destDir: string): string {
  const serverJsDirect = path.join(destDir, "dist", "server.js");
  if (fs.existsSync(serverJsDirect)) {
    return destDir;
  }

  const entries = fs.readdirSync(destDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1) {
    const nested = path.join(destDir, dirs[0]!.name);
    if (fs.existsSync(path.join(nested, "dist", "server.js"))) {
      for (const name of fs.readdirSync(nested)) {
        fs.renameSync(path.join(nested, name), path.join(destDir, name));
      }
      fs.rmdirSync(nested);
    }
  }
  return destDir;
}

export async function ensureMcpServer(options: BootstrapOptions): Promise<BootstrapResult> {
  const log: string[] = [];
  const { onProgress } = options;
  const manifest = loadServerManifest(options.extensionResourcesPath);
  const resolved = resolveManifestOptions(
    manifest,
    options.configuredVersion ?? "",
    options.configuredUrl ?? ""
  );

  const serverRoot = getBundledServerRoot();
  const installedVersion = options.globalState.get<string>(GLOBAL_STATE_VERSION_KEY);

  if (!options.force && !needsServerBootstrap(serverRoot, resolved.version, installedVersion)) {
    logPush(log, onProgress, `MCP server v${resolved.version} đã sẵn sàng — bỏ qua tải.`);
    return {
      ok: true,
      serverRoot,
      serverJs: path.join(serverRoot, "dist", "server.js"),
      skipped: true,
      log,
    };
  }

  try {
    const serversParent = path.dirname(serverRoot);
    fs.mkdirSync(serversParent, { recursive: true });

    const zipPath = path.join(os.tmpdir(), `dmctn-mcp-${resolved.version}-${Date.now()}.zip`);
    const isRemote = /^https?:\/\//i.test(resolved.downloadUrl.trim());
    logPush(
      log,
      onProgress,
      isRemote
        ? `Đang tải MCP server v${resolved.version}…`
        : `Đang lấy MCP server v${resolved.version} từ file local…`
    );
    await acquireZipFile(resolved.downloadUrl, zipPath);

    logPush(log, onProgress, "Đang xác minh SHA256…");
    const actual = sha256File(zipPath);
    if (actual !== resolved.sha256.toUpperCase()) {
      fs.unlinkSync(zipPath);
      return {
        ok: false,
        log,
        error: `SHA256 không khớp. Mong đợi ${resolved.sha256}, nhận ${actual}`,
      };
    }

    logPush(log, onProgress, "Đang giải nén…");
    await extractZip(zipPath, serverRoot);
    normalizeExtractedRoot(serverRoot);
    fs.unlinkSync(zipPath);

    if (!fs.existsSync(path.join(serverRoot, "dist", "server.js"))) {
      return {
        ok: false,
        log,
        error: "Sau giải nén không tìm thấy dist/server.js",
      };
    }

    logPush(log, onProgress, "Đang chạy npm install --omit=dev…");
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const npm = await runCommand(npmCmd, ["install", "--omit=dev"], serverRoot);
    if (npm.code !== 0) {
      return {
        ok: false,
        log,
        error: `npm install thất bại: ${npm.stderr || npm.stdout}`.slice(0, 800),
      };
    }

    await options.globalState.update(GLOBAL_STATE_VERSION_KEY, resolved.version);
    logPush(log, onProgress, `Hoàn tất — MCP server v${resolved.version} tại ${serverRoot}`);

    return {
      ok: true,
      serverRoot,
      serverJs: path.join(serverRoot, "dist", "server.js"),
      skipped: false,
      log,
    };
  } catch (err) {
    return {
      ok: false,
      log,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function removeBundledServer(): void {
  const root = getBundledServerRoot();
  if (fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
