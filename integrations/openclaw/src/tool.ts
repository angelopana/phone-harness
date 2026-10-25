/**
 * The phone_exec tool: run a model-written script on the user's phone.
 *
 * @module
 */
import { Type, type Static } from "typebox";

import {
  DEFAULT_TIMEOUT_S,
  LOCK_WAIT_MS,
  MAX_TIMEOUT_S,
  MIN_TIMEOUT_S,
  TOOL_NAME,
} from "./constants.ts";
import { childEnv, workspaceDir } from "./env.ts";
import type { PhoneLock } from "./lock.ts";
import { runScript, type RunOptions, type RunResult } from "./process.ts";
import { toToolResult, type PhoneExecResult } from "./result.ts";

/** What the model reads about phone_exec. */
export const DESCRIPTION =
  "Drive the user's real phone with phone-harness: their iPhone through the Mac's iPhone Mirroring " +
  "window, an Android over adb, or a Phone Harness Cloud phone. `code` runs as Python with the phone " +
  "helpers pre-imported; print() whatever you need back. Each call is a fresh interpreter (variables " +
  "do not persist); the phone keeps its state. Start with ensure_device(); it covers iPhone " +
  "Mirroring, Android, and a cloud phone. Read what is on screen with screen(). screenshot() prints " +
  "the image path it saved, and that image is attached to this result. " +
  "Ask the user before anything outward-facing or hard to undo (sending, posting, buying, deleting, " +
  "changing settings). Never type passwords, PINs or 2FA codes. Read the phone-harness skill for the helpers.";

/** phone_exec's parameters: the script and an optional timeout. */
export const PARAMETERS = Type.Object({
  code: Type.String({ description: "Python using the pre-imported phone-harness helpers. print() what you need back." }),
  timeout_s: Type.Optional(Type.Integer({
    default: DEFAULT_TIMEOUT_S,
    description: `Max seconds for the script (default ${DEFAULT_TIMEOUT_S}, max ${MAX_TIMEOUT_S}).`,
  })),
});

type Params = Static<typeof PARAMETERS>;

/** What phone_exec needs from the plugin. */
export interface PhoneExecDeps {
  /** The phone-harness executable and its arguments. */
  command: string[];
  /** Shared by every phone_exec call in the gateway. */
  lock: PhoneLock;
  /** The gateway's environment; defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /** Runs the script; defaults to {@link runScript}. Tests pass a fake. */
  run?: (code: string, opts: RunOptions) => Promise<RunResult>;
}

/**
 * Clamps a requested script timeout to the allowed range.
 *
 * @param value - The model's `timeout_s`, possibly missing or not a number.
 * @returns Whole seconds between 5 and 1800; 300 when `value` is unusable.
 */
export function clampTimeout(value: unknown): number {
  const n = Number(value ?? DEFAULT_TIMEOUT_S);
  if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_S;
  return Math.max(MIN_TIMEOUT_S, Math.min(Math.trunc(n), MAX_TIMEOUT_S));
}

/**
 * Creates the phone_exec tool for `api.registerTool`.
 *
 * @param deps - The command, lock and (for tests) environment and runner.
 * @returns An OpenClaw agent tool that runs one script per call.
 *
 * @example
 * ```ts
 * api.registerTool(createPhoneExecTool({ command: ["phone-harness"], lock: new PhoneLock() }),
 *                  { name: "phone_exec", optional: true });
 * ```
 */
export function createPhoneExecTool(deps: PhoneExecDeps) {
  const run = deps.run ?? runScript;
  const baseEnv = deps.env ?? process.env;
  return {
    name: TOOL_NAME,
    label: "Phone",
    description: DESCRIPTION,
    parameters: PARAMETERS,
    // The phone is one device: calls in a batch take turns.
    executionMode: "sequential" as const,

    /**
     * Runs one script on the phone.
     *
     * @param _toolCallId - OpenClaw's id for this call (unused).
     * @param params - The script and optional timeout.
     * @param signal - Kills the script when the call is cancelled.
     * @returns The script's output, exit code and screenshot.
     * @throws {Error} If `code` is empty, phone-harness is missing, or the
     *   script times out.
     * @throws {PhoneBusyError} If the phone stays busy for 120 s.
     */
    async execute(_toolCallId: string, params: Params, signal?: AbortSignal): Promise<PhoneExecResult> {
      const code = params.code ?? "";
      if (!code.trim()) throw new Error("No code provided. Start with: ensure_device(); print(screen_info())");
      const timeoutS = clampTimeout(params.timeout_s);
      const workspace = workspaceDir(baseEnv);

      const release = await deps.lock.acquire(LOCK_WAIT_MS);
      let result: RunResult;
      try {
        result = await run(code, { command: deps.command, env: childEnv(baseEnv, workspace), timeoutS, signal });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error(`phone-harness was not found (${deps.command[0]}). Install it with ` +
                          "`uv tool install phone-harness`, or set this plugin's `command` setting.");
        }
        throw err;
      } finally {
        release();
      }

      if (result.timedOut) {
        throw new Error(`phone_exec timed out after ${timeoutS}s. Split the work into smaller ` +
                        `scripts or raise timeout_s (max ${MAX_TIMEOUT_S}).`);
      }
      return toToolResult(result, workspace);
    },
  };
}
