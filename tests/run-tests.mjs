#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const { buildMcpJsonContent, resolveServerRoot } = require(path.join(ROOT, "dist/paths.js"));
const {
  syncWorkspaceFiles,
  validateMcpJsonContent,
  workspaceNeedsPolicyUpdate,
} = require(path.join(ROOT, "dist/syncWorkspace.js"));
const {
  POLICY_VERSION,
  shouldApplyStartupPolicy,
} = require(path.join(ROOT, "dist/policyState.js"));
const { getInstallStatus } = require(path.join(ROOT, "dist/installStatus.js"));
const { parsePilotReport } = require(path.join(ROOT, "dist/mcpTest.js"));
const { uninstallWorkspaceFiles } = require(path.join(ROOT, "dist/uninstallWorkspace.js"));
const { parseNodeMajor } = require(path.join(ROOT, "dist/nodeCheck.js"));
const {
  getBundledServerRoot,
  needsServerBootstrap,
  isBundledServerReady,
  acquireZipFile,
  extractZip,
  normalizeExtractedRoot,
} = require(path.join(ROOT, "dist/serverBootstrap.js"));
const { loadServerManifest } = require(path.join(ROOT, "dist/serverManifest.js"));

const MCP_SERVER = path.resolve(ROOT, "..", "local-coding-tools-mcp", "dist", "server.js");

function testBuildMcpJson() {
  const content = buildMcpJsonContent(
    "E:\\MCP\\local-coding-tools-mcp\\dist\\server.js",
    "E:\\MCP\\local-coding-tools-mcp"
  );
  const v = validateMcpJsonContent(content);
  assert.equal(v.ok, true, v.reasons.join(", "));
  assert.ok(!/npx/i.test(content));
  console.log("PASS buildMcpJsonContent");
}

function testParseNodeMajor() {
  assert.equal(parseNodeMajor("v20.11.0").ok, true);
  assert.equal(parseNodeMajor("v18.0.0").ok, true);
  assert.equal(parseNodeMajor("v16.20.0").ok, false);
  assert.equal(parseNodeMajor("").ok, false);
  console.log("PASS parseNodeMajor");
}

function testServerManifest() {
  const m = loadServerManifest(path.join(ROOT, "resources"));
  assert.equal(m.version, "0.14.0");
  assert.ok(m.downloadUrl.includes("github.com"));
  assert.match(m.sha256, /^[A-F0-9]{64}$/);
  assert.equal(m.sha256, "2C4432B357A93EFAC01B195EEDE7A6CB4B097433C1415EA4FC77448BEA6E7992");
  assert.equal(m.minNodeMajor, 18);
  console.log("PASS serverManifest");
}

function testBundledServerPaths() {
  const root = getBundledServerRoot();
  assert.ok(root.includes(".dmctn"));
  assert.ok(root.includes("local-coding-tools-mcp"));
  assert.equal(needsServerBootstrap(root, "0.14.0", undefined), true);
  assert.equal(needsServerBootstrap(root, "0.14.0", "0.14.0"), !isBundledServerReady(root));
  console.log("PASS bundledServerPaths");
}

function testResolveServerRootBundled() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dmctn-bundled-"));
  const distDir = path.join(tmp, "dist");
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "server.js"), "// test\n");
  fs.mkdirSync(path.join(tmp, "node_modules"));
  const r = resolveServerRoot([], tmp);
  assert.equal(r.ok, true, r.error);
  assert.ok(r.serverJs?.endsWith("server.js"));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("PASS resolveServerRoot configured/bundled path");
}

function testResolveServerRoot() {
  if (!fs.existsSync(MCP_SERVER)) {
    console.log("SKIP resolveServerRoot workspace — local-coding-tools-mcp dist not built");
    return;
  }
  const serverRoot = path.resolve(ROOT, "..", "local-coding-tools-mcp");
  const r = resolveServerRoot([path.resolve(ROOT, "..")], serverRoot);
  assert.equal(r.ok, true, r.error);
  assert.ok(r.serverJs?.endsWith("server.js"));
  console.log("PASS resolveServerRoot workspace");
}

function testSyncWorkspace() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dmctn-ext-"));
  const templates = path.join(ROOT, "resources");
  const content = buildMcpJsonContent(MCP_SERVER, path.dirname(path.dirname(MCP_SERVER)));
  const sync = syncWorkspaceFiles({
    workspaceRoot: tmp,
    mcpJsonContent: content,
    extensionResourcePath: templates,
    backupExisting: true,
  });
  assert.equal(sync.ok, true, sync.errors.join("; "));
  assert.ok(fs.existsSync(path.join(tmp, ".vscode", "mcp.json")));
  assert.ok(fs.existsSync(path.join(tmp, ".github", "agents", "DMCTN-MCP.agent.md")));
  assert.ok(fs.existsSync(path.join(tmp, ".github", "copilot-instructions.md")));
  const agent = fs.readFileSync(path.join(tmp, ".github", "agents", "DMCTN-MCP.agent.md"), "utf8");
  assert.ok(agent.includes("local-coding-tools/check_system"));
  assert.ok(agent.includes("MCP_ONLY") || agent.includes("BẮT BUỘC"));
  assert.ok(agent.includes("TODO_AUTO"));
  assert.ok(agent.includes("RESPONSE_STYLE"));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("PASS syncWorkspaceFiles");
}

function testWorkspaceNeedsPolicyUpdate() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dmctn-policy-"));
  const templates = path.join(ROOT, "resources");
  const agentTpl = path.join(templates, "templates", "DMCTN-MCP.agent.md");
  assert.equal(workspaceNeedsPolicyUpdate(tmp, agentTpl), true);

  const content = buildMcpJsonContent(MCP_SERVER, path.dirname(path.dirname(MCP_SERVER)));
  syncWorkspaceFiles({
    workspaceRoot: tmp,
    mcpJsonContent: content,
    extensionResourcePath: templates,
    backupExisting: true,
    forcePolicy: true,
  });
  assert.equal(workspaceNeedsPolicyUpdate(tmp, agentTpl), false);

  const legacyAgent = path.join(tmp, ".github", "agents", "DMCTN-MCP.agent.md");
  fs.writeFileSync(
    legacyAgent,
    "---\nname: DMCTN-MCP\ntools:\n  - local-coding-tools/*\n---\n",
    "utf8"
  );
  assert.equal(workspaceNeedsPolicyUpdate(tmp, agentTpl), true);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("PASS workspaceNeedsPolicyUpdate");
}

function testFirstRunPolicyFlags() {
  const cfg = {
    get: (key, defaultValue) => {
      if (key === "autoApplyPolicyOnFirstRun") return true;
      return defaultValue;
    },
  };
  const ctx = {
    globalState: {
      get: (key, defaultValue) => {
        if (key === "dmctnMcp.firstRunCompleted") return false;
        if (key === "dmctnMcp.appliedPolicyVersion") return "";
        return defaultValue;
      },
    },
  };
  assert.equal(shouldApplyStartupPolicy(ctx.globalState, cfg), true);
  assert.equal(POLICY_VERSION, "4");
  console.log("PASS firstRunPolicyFlags");
}

function testInstallStatus() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dmctn-status-"));
  const templates = path.join(ROOT, "resources");
  const serverRoot = path.resolve(ROOT, "..", "local-coding-tools-mcp");
  const serverJs = path.join(serverRoot, "dist", "server.js");
  const content = buildMcpJsonContent(serverJs, serverRoot);
  const sync = syncWorkspaceFiles({
    workspaceRoot: tmp,
    mcpJsonContent: content,
    extensionResourcePath: templates,
    backupExisting: true,
  });
  assert.equal(sync.ok, true, sync.errors.join("; "));

  const before = getInstallStatus(tmp, serverRoot, false);
  if (fs.existsSync(serverJs)) {
    assert.equal(before.installed, true);
    assert.ok(before.details.some((d) => d.includes("mcp.json: hợp lệ")));
  } else {
    assert.equal(before.installed, false);
  }
  assert.ok(before.details.some((d) => d.includes("Server bundled")));

  const disabled = getInstallStatus(tmp, serverRoot, true);
  assert.equal(disabled.installed, false);
  assert.ok(disabled.details[0].includes("gỡ"));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("PASS getInstallStatus");
}

function testUninstallWorkspace() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dmctn-uninst-"));
  const templates = path.join(ROOT, "resources");
  const serverRoot = path.resolve(ROOT, "..", "local-coding-tools-mcp");
  const serverJs = path.join(serverRoot, "dist", "server.js");
  const content = buildMcpJsonContent(serverJs, serverRoot);
  syncWorkspaceFiles({
    workspaceRoot: tmp,
    mcpJsonContent: content,
    extensionResourcePath: templates,
    backupExisting: true,
  });

  const mcpPath = path.join(tmp, ".vscode", "mcp.json");
  assert.ok(fs.existsSync(mcpPath));

  const result = uninstallWorkspaceFiles(tmp);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.ok(!fs.existsSync(mcpPath));
  assert.ok(result.actions.some((a) => a.includes("vô hiệu")));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("PASS uninstallWorkspaceFiles");
}

async function testAcquireZipLocal() {
  const srcZip = path.resolve(
    ROOT,
    "..",
    "local-coding-tools-mcp",
    "release",
    "local-coding-tools-mcp-v0.14.0-customer.zip"
  );
  if (!fs.existsSync(srcZip)) {
    console.log("SKIP acquireZipFile local — customer zip not built");
    return;
  }
  const dest = path.join(os.tmpdir(), `dmctn-acquire-${Date.now()}.zip`);
  await acquireZipFile(srcZip, dest);
  assert.ok(fs.existsSync(dest));
  assert.ok(fs.statSync(dest).size > 1000);
  fs.unlinkSync(dest);
  console.log("PASS acquireZipFile local path");
}

async function testExtractZip() {
  const srcZip = path.resolve(
    ROOT,
    "..",
    "local-coding-tools-mcp",
    "release",
    "local-coding-tools-mcp-v0.14.0-customer.zip"
  );
  if (!fs.existsSync(srcZip)) {
    console.log("SKIP extractZip — customer zip not built");
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dmctn-extract-"));
  await extractZip(srcZip, tmp);
  normalizeExtractedRoot(tmp);
  assert.ok(fs.existsSync(path.join(tmp, "dist", "server.js")));
  assert.ok(fs.existsSync(path.join(tmp, "package.json")));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("PASS extractZip");
}

function testParsePilotReport() {
  const sample = `{
  "initialize": "PASS",
  "toolCount": 56,
  "check_system": "PASS"
}`;
  const p = parsePilotReport(sample);
  assert.equal(p.initialize, "PASS");
  assert.equal(p.toolCount, 56);
  console.log("PASS parsePilotReport");
}

function testPackageJson() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok(pkg.contributes?.mcpServerDefinitionProviders?.length);
  assert.ok(pkg.contributes?.viewsContainers?.activitybar?.length);
  assert.ok(pkg.contributes?.views?.dmctnMcp?.length);
  assert.equal(pkg.version, "0.5.2");
  assert.ok(pkg.contributes.configuration.properties["dmctnMcp.autoBootstrapServer"]);
  assert.ok(pkg.contributes.configuration.properties["dmctnMcp.autoApplyPolicyOnFirstRun"]);
  assert.ok(pkg.contributes.configuration.properties["dmctnMcp.serverDownloadUrl"]);
  assert.equal(pkg.engines.vscode, "^1.99.0");
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "extension.js")));
  assert.ok(fs.existsSync(path.join(ROOT, "resources", "server-manifest.json")));
  console.log("PASS package manifest + compiled extension.js");
}

async function runAll() {
  testBuildMcpJson();
  testParseNodeMajor();
  testServerManifest();
  testBundledServerPaths();
  testResolveServerRootBundled();
  testResolveServerRoot();
  testSyncWorkspace();
  testWorkspaceNeedsPolicyUpdate();
  testFirstRunPolicyFlags();
  testInstallStatus();
  testUninstallWorkspace();
  await testAcquireZipLocal();
  await testExtractZip();
  testParsePilotReport();
  testPackageJson();
  console.log("\nALL TESTS PASS");
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
