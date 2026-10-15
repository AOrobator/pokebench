// Every gameplay launch leads its own process group, so stopping or restarting the
// viewer (Ctrl-C, a deploy) never signals a run it started.
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";

export interface DetachedOptions {
  readonly cwd?: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdout: string;
  readonly stderr: string;
  readonly started?: (pid: number) => void;
}

// Resolves with the child's exit code (null for a signal) while this process lives.
export function spawnDetached(command: string, argv: readonly string[], options: DetachedOptions): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const out = openSync(options.stdout, "wx", 0o600);
    let err: number;
    try {
      err = openSync(options.stderr, "wx", 0o600);
    } catch (error) {
      closeSync(out);
      throw error;
    }
    // The child holds its own copies; the parent closes its descriptors.
    const child = spawn(command, [...argv], { ...(options.cwd === undefined ? {} : { cwd: options.cwd }), env: { ...options.env }, stdio: ["ignore", out, err], detached: true });
    closeSync(out);
    closeSync(err);
    child.unref();
    child.once("spawn", () => { if (child.pid !== undefined) options.started?.(child.pid); });
    child.once("error", reject);
    child.once("exit", (code) => { resolve(code); });
  });
}
