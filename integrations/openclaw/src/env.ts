/**
 * Environment and workspace for the phone-harness child process.
 *
 * @module
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

const SECRET_SUFFIXES = ["_API_KEY", "_TOKEN", "_SECRET"];
// Same enabling spellings as phone_harness.config's bool env override.
const TRUTHY = new Set(["1", "true", "yes", "on"]);

function truthy(value: unknown): boolean {
  if (typeof value === "string") return TRUTHY.has(value.trim().toLowerCase());
  return Boolean(value);
}

// Same directory rules as phone_harness.config.config_dir.
function configJsonPath(env: Env): string {
  if (env.PHONE_HARNESS_HOME) return join(env.PHONE_HARNESS_HOME, "config", "config.json");
  const base = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "phone-harness", "config.json");
}

/**
 * Checks whether the user explicitly opted in to telemetry.
 *
 * @remarks
 * Opt-in is `PHONE_HARNESS_TELEMETRY` set to an enabling value, or
 * `phone-harness config set telemetry true`. The CLI's built-in default is
 * not an opt-in.
 *
 * @param env - The environment to read `PHONE_HARNESS_*` settings from.
 * @returns `true` only for an explicit opt-in.
 */
export function telemetryOptedIn(env: Env): boolean {
  if (env.PHONE_HARNESS_TELEMETRY !== undefined) return truthy(env.PHONE_HARNESS_TELEMETRY);
  try {
    const data = JSON.parse(readFileSync(configJsonPath(env), "utf8"));
    return typeof data === "object" && data !== null && "telemetry" in data && truthy(data.telemetry);
  } catch {
    return false;
  }
}

/**
 * Picks the folder where the agent's scripts keep notes.
 *
 * @param env - The environment; an inherited `PH_AGENT_WORKSPACE` wins.
 * @param home - The home directory to put the default folder under.
 * @returns `PH_AGENT_WORKSPACE`, else `~/.openclaw/phone-harness/agent-workspace`.
 */
export function workspaceDir(env: Env, home: string = homedir()): string {
  const inherited = env.PH_AGENT_WORKSPACE?.trim();
  if (inherited) return inherited;
  return join(home, ".openclaw", "phone-harness", "agent-workspace");
}

/**
 * Builds the environment for one phone-harness run.
 *
 * @remarks
 * Drops `*_API_KEY`, `*_TOKEN` and `*_SECRET` variables (except
 * `PHONE_HARNESS_*` ones), sets the client and workspace, and turns telemetry
 * off unless the user opted in.
 *
 * @param base - The gateway's environment.
 * @param workspace - The agent workspace folder.
 * @returns A new environment; `base` is not changed.
 */
export function childEnv(base: Env, workspace: string): Env {
  const env: Env = {};
  for (const [key, value] of Object.entries(base)) {
    const upper = key.toUpperCase();
    if (SECRET_SUFFIXES.some((suffix) => upper.endsWith(suffix)) && !key.startsWith("PHONE_HARNESS_")) continue;
    env[key] = value;
  }
  env.PH_AGENT_WORKSPACE = workspace;
  env.PH_CLIENT = "openclaw";
  if (!telemetryOptedIn(base)) env.PHONE_HARNESS_TELEMETRY = "0";
  return env;
}
