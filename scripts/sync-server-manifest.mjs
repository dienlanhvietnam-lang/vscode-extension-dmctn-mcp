#!/usr/bin/env node
/**
 * Sync server-manifest.json from local-coding-tools-mcp release SHA256SUMS + version.
 * Usage: node scripts/sync-server-manifest.mjs [version]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = path.resolve(__dirname, "..");
const MCP_ROOT = path.resolve(EXT_ROOT, "..", "local-coding-tools-mcp");
const version = process.argv[2] || "0.7.0";
const zipName = `local-coding-tools-mcp-v${version}-customer.zip`;
const sumsPath = path.join(MCP_ROOT, "release", "SHA256SUMS.txt");
const manifestPath = path.join(EXT_ROOT, "resources", "server-manifest.json");

const zipPath = path.join(MCP_ROOT, "release", zipName);
let sha256 = "";

// Prefer live hash from ZIP (SHA256SUMS.txt may be stale until release script updates it)
if (fs.existsSync(zipPath)) {
  const { createHash } = await import("node:crypto");
  const buf = fs.readFileSync(zipPath);
  sha256 = createHash("sha256").update(buf).digest("hex").toUpperCase();
} else if (fs.existsSync(sumsPath)) {
  const text = fs.readFileSync(sumsPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Fa-f0-9]{64})\s+(\S+)/);
    if (m && m[2] === zipName) {
      sha256 = m[1].toUpperCase();
      break;
    }
  }
}

if (!sha256) {
  console.error(`FAIL: SHA256 not found for ${zipName}`);
  process.exit(1);
}

const manifest = {
  version,
  zipFileName: zipName,
  downloadUrl: `https://github.com/devgol/local-coding-tools-mcp/releases/download/v${version}/${zipName}`,
  sha256,
  minNodeMajor: 18,
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`[PASS] Updated ${manifestPath}`);
console.log(`  version: ${version}`);
console.log(`  sha256:  ${sha256}`);
