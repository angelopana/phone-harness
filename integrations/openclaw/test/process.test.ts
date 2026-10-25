import assert from "node:assert/strict";
import { test } from "node:test";

import { runScript } from "../src/process.ts";

// A stand-in for phone-harness: node reads the script on stdin and evals it.
const FAKE = [process.execPath, "-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>eval(s))"];

test("the script arrives on stdin and its output comes back", async () => {
  const got = await runScript("console.log(6 * 7)", { command: FAKE, env: process.env, timeoutS: 10 });
  assert.equal(got.exitCode, 0);
  assert.equal(got.stdout.trim(), "42");
  assert.equal(got.timedOut, false);
});

test("stderr and a non-zero exit are reported", async () => {
  const got = await runScript("console.error('boom'); process.exit(3)", { command: FAKE, env: process.env, timeoutS: 10 });
  assert.equal(got.exitCode, 3);
  assert.match(got.stderr, /boom/);
});

test("a script past its timeout is killed", async () => {
  const started = Date.now();
  const got = await runScript("setInterval(() => {}, 1000)", { command: FAKE, env: process.env, timeoutS: 0.3 });
  assert.equal(got.timedOut, true);
  assert.ok(Date.now() - started < 5000);
});

test("an abort signal kills the script", async () => {
  const abort = new AbortController();
  setTimeout(() => abort.abort(), 200);
  const got = await runScript("setInterval(() => {}, 1000)", {
    command: FAKE, env: process.env, timeoutS: 30, signal: abort.signal });
  assert.notEqual(got.exitCode, 0);
});

test("a missing executable rejects", async () => {
  await assert.rejects(runScript("", { command: ["/no/such/phone-harness"], env: process.env, timeoutS: 5 }),
                       /ENOENT/);
});
