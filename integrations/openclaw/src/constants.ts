/**
 * Names and limits shared across the plugin.
 *
 * @module
 */

/** Plugin id, as declared in `openclaw.plugin.json`. */
export const PLUGIN_ID = "phone-harness";

/** The one tool this plugin registers. */
export const TOOL_NAME = "phone_exec";

/** Executable used when the `command` setting is not set. */
export const DEFAULT_COMMAND = "phone-harness";

/** Script timeout used when the model gives none, in seconds. */
export const DEFAULT_TIMEOUT_S = 300;

/** Shortest script timeout the model may ask for, in seconds. */
export const MIN_TIMEOUT_S = 5;

/** Longest script timeout the model may ask for, in seconds. */
export const MAX_TIMEOUT_S = 1800;

/** How long a call waits for the phone before reporting it busy, in milliseconds. */
export const LOCK_WAIT_MS = 120_000;
