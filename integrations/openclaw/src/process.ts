/**
 * Run one script through phone-harness: stdin in, stdout/stderr out.
 *
 * @module
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

/** How to run one script. */
export interface RunOptions {
  /** The executable and its arguments, e.g. `["phone-harness"]`. */
  command: string[];
  /** The child's environment. */
  env: Record<string, string | undefined>;
  /** Kill the script after this many seconds. */
  timeoutS: number;
  /** Kills the script when aborted. */
  signal?: AbortSignal;
}

/** What one run produced. */
export interface RunResult {
  /** The exit code, or `null` when the script was killed by a signal. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** `true` when the script was killed for running past its timeout. */
  timedOut: boolean;
  /** When the run started, in epoch milliseconds. */
  startedMs: number;
}

const IS_WINDOWS = process.platform === "win32";

// Kill the runner and everything it spawned (it leads its own process group).
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

/**
 * Pipes a script on stdin to phone-harness and collects its output.
 *
 * @param code - The Python script to run.
 * @param opts - The command, environment, timeout and abort signal.
 * @returns A promise resolving when the script exits or is killed.
 * @throws {Error} If the executable cannot be started (e.g. `ENOENT`).
 *
 * @example
 * ```ts
 * const run = await runScript("print(6 * 7)", { command: ["phone-harness"], env: process.env, timeoutS: 60 });
 * console.log(run.stdout); // "42\n"
 * ```
 */
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
