import assert from "node:assert/strict";
import { test } from "node:test";

import { approvalFor, scriptSummary, SessionTrust } from "../src/approval.ts";

const event = (code: string) => ({ toolName: "phone_exec", params: { code } });
const ctx = (sessionKey?: string) => ({ sessionKey });

test("other tools are left alone", () => {
  const got = approvalFor({ toolName: "exec", params: {} }, ctx("s1"), new SessionTrust());
  assert.equal(got, undefined);
});

test("every phone_exec call asks, showing the script", () => {
  const got = approvalFor(event('open_app("Weather")'), ctx("s1"), new SessionTrust());
  assert.ok(got?.requireApproval);
  assert.match(got.requireApproval.description, /open_app\("Weather"\)/);
  assert.deepEqual(got.requireApproval.allowedDecisions, ["allow-once", "allow-always", "deny"]);
});

test("allow-always trusts later calls in the same session only", async () => {
  const trust = new SessionTrust();
  const first = approvalFor(event("home()"), ctx("s1"), trust);
  await first?.requireApproval?.onResolution?.("allow-always");
  assert.equal(approvalFor(event("home()"), ctx("s1"), trust), undefined);
  assert.ok(approvalFor(event("home()"), ctx("s2"), trust)?.requireApproval);
});

test("without a session key, allow-always is not remembered", async () => {
  const trust = new SessionTrust();
  const first = approvalFor(event("home()"), ctx(), trust);
  await first?.requireApproval?.onResolution?.("allow-always");
  assert.ok(approvalFor(event("home()"), ctx(), trust)?.requireApproval);
});

test("long scripts are collapsed and cut to fit the prompt", () => {
  const summary = scriptSummary("tap(1, 2)\n\n" + "x".repeat(500));
  assert.ok(summary.length <= 140);
  assert.ok(summary.startsWith("tap(1, 2) x"));
  assert.ok(summary.endsWith("..."));
  assert.equal(scriptSummary("   "), "(empty)");
});
