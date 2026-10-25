/**
 * Approval gate: every phone_exec call asks first.
 *
 * @remarks
 * `allow-always` trusts phone_exec for the rest of that session (until the
 * gateway restarts). Calls without a session key always ask.
 *
 * @module
 */
import { TOOL_NAME } from "./constants.ts";

const SUMMARY_LIMIT = 140;

// The SDK does not export its hook types; these are the fields this gate reads and returns.
type ToolEvent = { toolName: string; params: Record<string, unknown> };
type ToolContext = { sessionKey?: string };
type Decision = "allow-once" | "allow-always" | "deny";
type ApprovalResult = {
  requireApproval: {
    title: string;
    description: string;
    severity: "info" | "warning" | "critical";
    allowedDecisions: Decision[];
    onResolution: (decision: string) => void;
  };
};

/** Sessions the user has trusted with `allow-always`, held in memory. */
export class SessionTrust {
  private trusted = new Set<string>();

  /**
   * Checks whether a session was trusted earlier.
   *
   * @param sessionKey - The OpenClaw session key, if the call has one.
   * @returns `true` when the session was trusted; always `false` without a key.
   */
  isTrusted(sessionKey?: string): boolean {
    return sessionKey !== undefined && this.trusted.has(sessionKey);
  }

  /**
   * Trusts a session for the rest of the gateway's life.
   *
   * @param sessionKey - The OpenClaw session key; ignored when missing.
   */
  trust(sessionKey?: string): void {
    if (sessionKey !== undefined) this.trusted.add(sessionKey);
  }
}

/**
 * Collapses a script onto one line, cut to fit the approval prompt.
 *
 * @param code - The script the model wants to run.
 * @returns The script on one line, at most 140 characters, or `(empty)`.
 */
export function scriptSummary(code: string): string {
  const compact = code.split(/\s+/).filter(Boolean).join(" ");
  if (!compact) return "(empty)";
  if (compact.length <= SUMMARY_LIMIT) return compact;
  return compact.slice(0, SUMMARY_LIMIT - 3).trimEnd() + "...";
}

/**
 * Decides whether a tool call needs the user's approval.
 *
 * @param event - The `before_tool_call` event: tool name and parameters.
 * @param ctx - The hook context; only `sessionKey` is read.
 * @param trust - Sessions trusted earlier with `allow-always`.
 * @returns An approval request for an untrusted phone_exec call, or
 *   `undefined` to let the call through.
 */
export function approvalFor(
  event: ToolEvent,
  ctx: ToolContext,
  trust: SessionTrust,
): ApprovalResult | undefined {
  if (event.toolName !== TOOL_NAME || trust.isTrusted(ctx.sessionKey)) return undefined;
  const code = typeof event.params.code === "string" ? event.params.code : "";
  return {
    requireApproval: {
      title: "Run a script on your phone",
      description: `phone_exec taps and types on your real phone: ${scriptSummary(code)}`,
      severity: "warning",
      allowedDecisions: ["allow-once", "allow-always", "deny"],
      onResolution(decision) {
        if (decision === "allow-always") trust.trust(ctx.sessionKey);
      },
    },
  };
}
