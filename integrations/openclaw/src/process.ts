/** Run one script through phone-harness: stdin in, stdout/stderr out. */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

export interface RunOptions {
  command: string[];
  env: Record<string, string | undefined>;
  timeoutS: number;
  signal?: AbortSignal;
}

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  startedMs: number;
}

const IS_WINDOWS = process.platform === "win32";

/** Kill the runner and everything it spawned (it leads its own process group). */
function killGroup(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (IS_WINDOWS) {
    spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)]);
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

/** Resolves when the script exits or is killed; rejects if it could not start. */
export function runScript(code: string, opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const startedMs = Date.now();
    const [file, ...args] = opts.command;
    const child = spawn(file, args, { env: opts.env, stdio: ["pipe", "pipe", "pipe"], detached: !IS_WINDOWS });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    // A runner that exits before reading stdin closes the pipe; that is not an error here.
    child.stdin.on("error", () => {});

    const kill = () => killGroup(child);
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.timeoutS * 1000);
    opts.signal?.addEventListener("abort", kill, { once: true });

    const finish = () => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", kill);
    };
    child.on("error", (err) => {
      finish();
      reject(err);
    });
    child.on("close", (exitCode) => {
      finish();
      resolve({ exitCode, stdout, stderr, timedOut, startedMs });
    });

    child.stdin.end(code);
  });
}
