import assert from "node:assert/strict";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { findScreenshot, toToolResult } from "../src/result.ts";

const dir = mkdtempSync(join(tmpdir(), "ph-openclaw-shot-"));
const png = (name: string) => {
  const path = join(dir, name);
  writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return path;
};

test("the last fresh absolute image path in stdout is the screenshot", () => {
  const since = Date.now();
  const a = png("a.png");
  const b = png("b.png");
  assert.equal(findScreenshot(`saved ${a}\nsaved ${b}\n`, since), b);
});

test("missing, stale and relative paths are ignored", () => {
  const stale = png("stale.png");
  const old = new Date(Date.now() - 60_000);
  utimesSync(stale, old, old);
  const out = `${stale}\n/no/such/file.png\nshots/rel.png\n`;
  assert.equal(findScreenshot(out, Date.now()), undefined);
});

test("a successful run returns its output as text", () => {
  const got = toToolResult({ exitCode: 0, stdout: "42\n", stderr: "", timedOut: false, startedMs: 0 }, "/ws");
  assert.equal(got.content.length, 1);
  const payload = JSON.parse((got.content[0] as { text: string }).text);
  assert.equal(payload.success, true);
  assert.equal(payload.output, "42\n");
  assert.equal(payload.workspace, "/ws");
  assert.deepEqual(got.details, payload);
});

test("a failed run reports the exit code and stderr tail", () => {
  const got = toToolResult({ exitCode: 1, stdout: "", stderr: "Traceback...\nNameError\n",
                             timedOut: false, startedMs: 0 }, "/ws");
  const payload = JSON.parse((got.content[0] as { text: string }).text);
  assert.equal(payload.success, false);
  assert.equal(payload.exit_code, 1);
  assert.match(payload.stderr, /NameError/);
});

test("a screenshot is attached as an image", () => {
  const since = Date.now();
  const shot = png("screen.png");
  const got = toToolResult({ exitCode: 0, stdout: `${shot}\n`, stderr: "", timedOut: false, startedMs: since }, "/ws");
  assert.equal(got.content.length, 2);
  const image = got.content[1] as { type: string; mimeType: string; data: string };
  assert.equal(image.type, "image");
  assert.equal(image.mimeType, "image/png");
  assert.equal(image.data, Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"));
});
