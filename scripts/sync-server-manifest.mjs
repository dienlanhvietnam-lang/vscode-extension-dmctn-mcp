#!/usr/bin/env node
/**
 * Sync server-manifest.json SHA256 from GitHub Release asset (preferred) or local ZIP.
 * Usage: node scripts/sync-server-manifest.mjs [version]
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = path.resolve(__dirname, "..");
const MCP_ROOT = path.resolve(EXT_ROOT, "..", "local-coding-tools-mcp");
const version = process.argv[2] || "0.8.0";
const zipName = `local-coding-tools-mcp-v${version}-customer.zip`;
const manifestPath = path.join(EXT_ROOT, "resources", "server-manifest.json");
const repo = "dienlanhvietnam-lang/local-coding-tools-mcp";
const tag = `v${version}`;

function shaFromGhRelease() {
  try {
    const out = execSync(`gh release view ${tag} -R ${repo} --json assets`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const data = JSON.parse(out);
    const asset = data.assets?.find((a) => a.name === zipName);
    const digest = asset?.digest;
    if (digest?.startsWith("sha256:")) {
      return digest.slice(7).toUpperCase();
    }
  } catch {
    // gh not available or release missing
  }
  return "";
}

function shaFromLocalZip() {
  const zipPath = path.join(MCP_ROOT, "release", zipName);
  if (!fs.existsSync(zipPath)) return "";
  const buf = fs.readFileSync(zipPath);
  return createHash("sha256").update(buf).digest("hex").toUpperCase();
}

const sha256 = shaFromGhRelease() || shaFromLocalZip();
if (!sha256) {
  console.error(`FAIL: SHA256 not found for ${zipName} (gh release or local zip)`);
  process.exit(1);
}

const manifest = {
  version,
  zipFileName: zipName,
  downloadUrl: `https://github.com/${repo}/releases/download/${tag}/${zipName}`,
  sha256,
  minNodeMajor: 18,
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`[PASS] Updated ${manifestPath}`);
console.log(`  version: ${version}`);
console.log(`  sha256:  ${sha256}`);
console.log(`  source:  ${shaFromGhRelease() ? "GitHub Release" : "local zip"}`);
