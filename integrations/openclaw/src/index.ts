/**
 * phone-harness for OpenClaw: one optional `phone_exec` tool.
 *
 * @remarks
 * The model writes a Python script; the plugin pipes it to the phone-harness
 * CLI, which runs it with the phone helpers pre-imported, and returns what it
 * printed (plus the screenshot, if one was saved). Every call asks first.
 *
 * @packageDocumentation
 */
import { buildJsonPluginConfigSchema, definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { approvalFor, SessionTrust } from "./approval.ts";
import { DEFAULT_COMMAND, PLUGIN_ID, TOOL_NAME } from "./constants.ts";
import { PhoneLock } from "./lock.ts";
import { createPhoneExecTool } from "./tool.ts";

const CONFIG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    command: { type: "string", default: DEFAULT_COMMAND },
  },
} as const;

// The `command` setting as argv, falling back to phone-harness on PATH.
function commandFrom(pluginConfig: Record<string, unknown> | undefined): string[] {
  const command = pluginConfig?.command;
  return [typeof command === "string" && command.trim() ? command.trim() : DEFAULT_COMMAND];
}

/** The plugin entry OpenClaw loads: registers phone_exec and its approval gate. */
export default definePluginEntry({
  id: PLUGIN_ID,
  name: "Phone Harness",
  description: "Drive a real phone with one phone_exec tool.",
  configSchema: buildJsonPluginConfigSchema(CONFIG_SCHEMA),
  register(api) {
    const trust = new SessionTrust();
    api.registerTool(createPhoneExecTool({ command: commandFrom(api.pluginConfig), lock: new PhoneLock() }),
                     { name: TOOL_NAME, optional: true });
    api.on("before_tool_call", (event, ctx) => approvalFor(event, ctx, trust));
  },
});
