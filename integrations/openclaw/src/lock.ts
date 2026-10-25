/** One script drives the phone at a time, across agents in this gateway. */

export class PhoneBusyError extends Error {
  constructor(waitMs: number) {
    super(`The phone is busy with another phone_exec script (waited ${Math.round(waitMs / 1000)}s). ` +
          "Try again when it finishes.");
    this.name = "PhoneBusyError";
  }
}

export class PhoneLock {
  private busy = false;
  private waiters: Array<() => void> = [];

  /** Resolves to a release function, or rejects with PhoneBusyError after waitMs. */
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
