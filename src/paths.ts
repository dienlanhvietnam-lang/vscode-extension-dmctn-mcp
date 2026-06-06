import * as fs from "node:fs";
import * as path from "node:path";
import { getBundledServerRoot } from "./serverBootstrap";

const SERVER_REL = path.join("local-coding-tools-mcp", "dist", "server.js");

export interface ServerRootResult {
  ok: boolean;
  serverRoot?: string;
  serverJs?: string;
  error?: string;
}

/** Detect local-coding-tools-mcp inside workspace folders or configured path. */
export function resolveServerRoot(
  workspacePaths: readonly string[],
  configuredRoot: string
): ServerRootResult {
  const candidates: string[] = [];

  if (configuredRoot.trim()) {
    candidates.push(path.resolve(configuredRoot.trim()));
  }

  candidates.push(getBundledServerRoot());

  for (const ws of workspacePaths) {
    candidates.push(path.join(ws, "local-coding-tools-mcp"));
    const parent = path.dirname(ws);
    candidates.push(path.join(parent, "local-coding-tools-mcp"));
  }

  const seen = new Set<string>();
  for (const root of candidates) {
    const norm = path.resolve(root).toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);

    const serverJs = path.join(root, "dist", "server.js");
    if (fs.existsSync(serverJs)) {
      return { ok: true, serverRoot: root, serverJs };
    }
  }

  return {
    ok: false,
    error: `dist/server.js not found. Set dmctnMcp.serverRoot or add ${SERVER_REL} to workspace.`,
  };
}

/** Build mcp.json content with Windows-safe escaped backslashes in JSON strings. */
export function buildMcpJsonContent(serverJs: string, serverRoot: string): string {
  const serverJsJson = serverJs.replace(/\\/g, "\\\\");
  const serverRootJson = serverRoot.replace(/\\/g, "\\\\");
  return `{
  "servers": {
    "local-coding-tools": {
      "type": "stdio",
      "command": "node",
      "args": [
        "${serverJsJson}"
      ],
      "cwd": "${serverRootJson}"
    }
  }
}
`;
}
