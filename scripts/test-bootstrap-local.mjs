#!/usr/bin/env node
/**
 * Integration test: bootstrap MCP server from local customer ZIP (no network).
 * Usage: node scripts/test-bootstrap-local.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const {
  ensureMcpServer,
  getBundledServerRoot,
  removeBundledServer,
  GLOBAL_STATE_VERSION_KEY,
} = require(path.join(EXT_ROOT, "dist/serverBootstrap.js"));

const ZIP = path.resolve(
  EXT_ROOT,
  "..",
  "local-coding-tools-mcp",
  "release",
  "local-coding-tools-mcp-v0.7.0-customer.zip"
);

const globalState = {
  _v: undefined,
  get(key) {
    return this._v;
  },
  async update(key, value) {
    this._v = value;
  },
};

async function main() {
  if (!fs.existsSync(ZIP)) {
    console.error(`FAIL: ZIP not found: ${ZIP}`);
    process.exit(1);
  }

  removeBundledServer();
  await globalState.update(GLOBAL_STATE_VERSION_KEY, undefined);

  const result = await ensureMcpServer({
    extensionResourcesPath: path.join(EXT_ROOT, "resources"),
    globalState,
    configuredUrl: ZIP,
    force: true,
    onProgress: (m) => console.log(`  ${m}`),
  });

  if (!result.ok) {
    console.error("FAIL:", result.error);
    console.error(result.log.join("\n"));
    process.exit(1);
  }

  const root = getBundledServerRoot();
  const serverJs = path.join(root, "dist", "server.js");
  if (!fs.existsSync(serverJs)) {
    console.error("FAIL: dist/server.js missing after bootstrap");
    process.exit(1);
  }

  console.log("\n[PASS] Local bootstrap OK");
  console.log(`  server: ${serverJs}`);
  console.log(`  version: ${globalState._v}`);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
