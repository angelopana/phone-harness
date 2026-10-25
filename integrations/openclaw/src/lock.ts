/**
 * One script drives the phone at a time, across agents in this gateway.
 *
 * @module
 */

/** Raised when a caller waits too long for the phone. */
export class PhoneBusyError extends Error {
  /**
   * @param waitMs - How long the caller waited, in milliseconds.
   */
  constructor(waitMs: number) {
    super(`The phone is busy with another phone_exec script (waited ${Math.round(waitMs / 1000)}s). ` +
          "Try again when it finishes.");
    this.name = "PhoneBusyError";
  }
}

/** A first-come, first-served lock on the phone. */
export class PhoneLock {
  private busy = false;
  private waiters: Array<() => void> = [];

  /**
   * Waits for the phone to be free and takes it.
   *
   * @param waitMs - The longest to wait, in milliseconds.
   * @returns A promise resolving to a function that releases the phone.
   * @throws {PhoneBusyError} If the phone is still taken after `waitMs`.
   *
   * @example
   * ```ts
   * const release = await lock.acquire(120_000);
   * try {
   *   await runScript(code, opts);
   * } finally {
   *   release();
   * }
   * ```
   */
  acquire(waitMs: number): Promise<() => void> {
    if (!this.busy) {
      this.busy = true;
      return Promise.resolve(() => this.release());
    }
    return new Promise((resolve, reject) => {
      const grant = () => {
        clearTimeout(timer);
        resolve(() => this.release());
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== grant);
        reject(new PhoneBusyError(waitMs));
      }, waitMs);
      this.waiters.push(grant);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    // Hand the lock straight to the next waiter so no one can cut in.
    if (next) next();
    else this.busy = false;
  }
}
