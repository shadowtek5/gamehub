// Release manifest (manifest.json inside every release bundle) + runtime
// compatibility checks. Mirrors the manifest written by scripts/build-release.mjs.

import packageJson from "../../../package.json";

export interface ReleaseManifest {
  schema: number;
  name: string;
  version: string;
  platform: string; // e.g. "linux-x64"
  node: string; // major, e.g. "22"
  builtAt: string;
  commit: string | null;
}

/** The platform string a release must match to run here (e.g. "linux-x64"). */
export function runtimePlatform(): string {
  return `${process.platform}-${process.arch}`.replace("win32", "windows");
}

export function runtimeNodeMajor(): string {
  return process.versions.node.split(".")[0];
}

export function parseManifest(raw: string): ReleaseManifest {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("manifest.json is not valid JSON");
  }
  const m = obj as Partial<ReleaseManifest>;
  if (!m || typeof m !== "object") throw new Error("manifest.json is empty");
  if (m.name !== "gamehub") throw new Error(`Not a GameHub release (name=${String(m.name)})`);
  if (typeof m.version !== "string" || !/^\d+\.\d+/.test(m.version)) {
    throw new Error(`Bad version in manifest (${String(m.version)})`);
  }
  return {
    schema: typeof m.schema === "number" ? m.schema : 1,
    name: m.name,
    version: m.version,
    platform: typeof m.platform === "string" ? m.platform : "",
    node: typeof m.node === "string" ? m.node : "",
    builtAt: typeof m.builtAt === "string" ? m.builtAt : "",
    commit: typeof m.commit === "string" ? m.commit : null,
  };
}

/** Whether a manifest's bundle can actually run in this process. */
export function checkCompatible(m: ReleaseManifest): { ok: boolean; reason?: string } {
  const plat = runtimePlatform();
  if (m.platform && m.platform !== plat) {
    return { ok: false, reason: `built for ${m.platform}, this runtime is ${plat}` };
  }
  const nodeMajor = runtimeNodeMajor();
  if (m.node && m.node !== nodeMajor) {
    return { ok: false, reason: `built for Node ${m.node}, this runtime is Node ${nodeMajor}` };
  }
  return { ok: true };
}

/**
 * Self-update is only meaningful in the Docker runtime, which:
 *  - sets GAMEHUB_DATA_DIR (docker-entrypoint.sh), and
 *  - can restart the process via the container restart policy.
 * A native `next start` / dev run on Windows can't hot-swap a Linux bundle.
 */
export function selfUpdateSupported(): boolean {
  return Boolean(process.env.GAMEHUB_DATA_DIR) && process.platform === "linux";
}

/** Version of the code currently executing (staged release or baked image). */
export function runningVersion(): string {
  return (packageJson as { version?: string }).version ?? "0.0.0";
}

/** Version baked into the Docker image (the fallback floor). */
export function imageVersion(): string {
  return process.env.GAMEHUB_IMAGE_VERSION || runningVersion();
}

/** Which release the entrypoint actually booted ("image" or a version). */
export function bootedRelease(): string {
  return process.env.GAMEHUB_RELEASE || "image";
}
