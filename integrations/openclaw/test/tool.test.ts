import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TOOL_NAME } from "../src/constants.ts";
import { PhoneLock } from "../src/lock.ts";
import type { RunOptions } from "../src/process.ts";
import { clampTimeout, createPhoneExecTool } from "../src/tool.ts";

const ok = { exitCode: 0, stdout: "hi\n", stderr: "", timedOut: false, startedMs: 0 };

function tool(run: (code: string, opts: RunOptions) => Promise<typeof ok>) {
  return createPhoneExecTool({ command: ["phone-harness"], lock: new PhoneLock(),
                               env: { PH_AGENT_WORKSPACE: "/ws", PHONE_HARNESS_TELEMETRY: "0" }, run });
}

test("the script runs through phone-harness with the openclaw env", async () => {
  let seen: { code: string; opts: RunOptions } | undefined;
  const got = await tool(async (code, opts) => {
    seen = { code, opts };
    return ok;
  }).execute("id", { code: "print('hi')", timeout_s: 60 });
  assert.equal(seen?.code, "print('hi')");
  assert.deepEqual(seen?.opts.command, ["phone-harness"]);
  assert.equal(seen?.opts.timeoutS, 60);
  assert.equal(seen?.opts.env.PH_CLIENT, "openclaw");
  assert.equal(got.details.output, "hi\n");
});

test("empty code is rejected before anything runs", async () => {
  await assert.rejects(tool(async () => assert.fail("ran")).execute("id", { code: "  " }), /No code provided/);
});

test("a timeout is an error the model can act on", async () => {
  await assert.rejects(tool(async () => ({ ...ok, timedOut: true })).execute("id", { code: "x" }), /timed out/);
});

test("a missing phone-harness says how to install it", async () => {
  const missing = Object.assign(new Error("spawn phone-harness ENOENT"), { code: "ENOENT" });
  await assert.rejects(tool(async () => { throw missing; }).execute("id", { code: "x" }), /uv tool install/);
});

test("the lock is released after a failed run", async () => {
  const lock = new PhoneLock();
  const t = createPhoneExecTool({ command: ["x"], lock, env: {}, run: async () => { throw new Error("boom"); } });
  await assert.rejects(t.execute("id", { code: "x" }), /boom/);
  (await lock.acquire(10))();
});

test("timeouts are clamped to the allowed range", () => {
  assert.equal(clampTimeout(undefined), 300);
  assert.equal(clampTimeout(1), 5);
  assert.equal(clampTimeout(99999), 1800);
  assert.equal(clampTimeout("abc"), 300);
});

test("the manifest declares exactly the tool the plugin registers, as optional", () => {
  const manifest = JSON.parse(readFileSync(new URL("../openclaw.plugin.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.contracts.tools, [TOOL_NAME]);
  assert.equal(manifest.toolMetadata[TOOL_NAME].optional, true);
});
