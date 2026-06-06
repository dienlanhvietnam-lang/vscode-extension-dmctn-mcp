import * as fs from "node:fs";
import * as path from "node:path";

export interface ServerManifest {
  version: string;
  zipFileName: string;
  downloadUrl: string;
  sha256: string;
  minNodeMajor: number;
}

export function loadServerManifest(extensionResourcesPath: string): ServerManifest {
  const file = path.join(extensionResourcesPath, "server-manifest.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as ServerManifest;
  return raw;
}

export function resolveManifestOptions(
  manifest: ServerManifest,
  configuredVersion: string,
  configuredUrl: string
): { version: string; downloadUrl: string; sha256: string; minNodeMajor: number } {
  return {
    version: configuredVersion.trim() || manifest.version,
    downloadUrl: configuredUrl.trim() || manifest.downloadUrl,
    sha256: manifest.sha256,
    minNodeMajor: manifest.minNodeMajor ?? 18,
  };
}
