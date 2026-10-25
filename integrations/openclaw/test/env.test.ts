import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { childEnv, telemetryOptedIn, workspaceDir } from "../src/env.ts";

const tempHome = () => mkdtempSync(join(tmpdir(), "ph-openclaw-"));

test("secrets are dropped, the rest is kept", () => {
  const env = childEnv({ PATH: "/bin", OPENAI_API_KEY: "k", GH_TOKEN: "t", APP_SECRET: "s",
                         ANDROID_HOME: "/sdk", PHONE_HARNESS_HOME: tempHome() }, "/ws");
  assert.equal(env.PATH, "/bin");
  assert.equal(env.ANDROID_HOME, "/sdk");
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.APP_SECRET, undefined);
});

test("PHONE_HARNESS_ settings pass through even with a secret suffix", () => {
  const env = childEnv({ PHONE_HARNESS_HOME: tempHome(), PHONE_HARNESS_PLATFORM: "ios",
                         PHONE_HARNESS_CLOUD_TOKEN: "c" }, "/ws");
  assert.equal(env.PHONE_HARNESS_PLATFORM, "ios");
  assert.equal(env.PHONE_HARNESS_CLOUD_TOKEN, "c");
});

test("the child is tagged as openclaw and given the workspace", () => {
  const env = childEnv({ PHONE_HARNESS_HOME: tempHome() }, "/ws");
  assert.equal(env.PH_CLIENT, "openclaw");
  assert.equal(env.PH_AGENT_WORKSPACE, "/ws");
});

test("telemetry is off unless the user opted in", () => {
  const home = tempHome();
  assert.equal(telemetryOptedIn({ PHONE_HARNESS_HOME: home }), false);
  assert.equal(childEnv({ PHONE_HARNESS_HOME: home }, "/ws").PHONE_HARNESS_TELEMETRY, "0");

  mkdirSync(join(home, "config"), { recursive: true });
  writeFileSync(join(home, "config", "config.json"), JSON.stringify({ telemetry: true }));
  assert.equal(telemetryOptedIn({ PHONE_HARNESS_HOME: home }), true);
  assert.equal(childEnv({ PHONE_HARNESS_HOME: home }, "/ws").PHONE_HARNESS_TELEMETRY, undefined);

  assert.equal(telemetryOptedIn({ PHONE_HARNESS_HOME: home, PHONE_HARNESS_TELEMETRY: "0" }), false);
  assert.equal(telemetryOptedIn({ PHONE_HARNESS_TELEMETRY: "yes" }), true);
});

test("an inherited PH_AGENT_WORKSPACE wins over the default folder", () => {
  assert.equal(workspaceDir({ PH_AGENT_WORKSPACE: "/mine" }, "/home/u"), "/mine");
  assert.equal(workspaceDir({}, "/home/u"),
               join("/home/u", ".openclaw", "phone-harness", "agent-workspace"));
});
