import assert from "node:assert/strict";
import { test } from "node:test";

import { PhoneBusyError, PhoneLock } from "../src/lock.ts";

test("a second caller waits for the first to release", async () => {
  const lock = new PhoneLock();
  const order: string[] = [];
  const releaseFirst = await lock.acquire(1000);
  const second = lock.acquire(1000).then((release) => {
    order.push("second");
    release();
  });
  order.push("first");
  releaseFirst();
  await second;
  assert.deepEqual(order, ["first", "second"]);
});

test("a caller that waits too long gets PhoneBusyError", async () => {
  const lock = new PhoneLock();
  const release = await lock.acquire(1000);
  await assert.rejects(lock.acquire(20), PhoneBusyError);
  release();
  const again = await lock.acquire(20);
  again();
});
