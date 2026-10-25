/**
 * Approval gate: every phone_exec call asks first.
 *
 * `allow-always` trusts phone_exec for the rest of that session (until the
 * gateway restarts). Calls without a session key always ask.
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

export class SessionTrust {
  private trusted = new Set<string>();

  isTrusted(sessionKey?: string): boolean {
    return sessionKey !== undefined && this.trusted.has(sessionKey);
  }

  trust(sessionKey?: string): void {
    if (sessionKey !== undefined) this.trusted.add(sessionKey);
  }
}

/** The script on one line, cut to fit the approval prompt. */
export function scriptSummary(code: string): string {
  const compact = code.split(/\s+/).filter(Boolean).join(" ");
  if (!compact) return "(empty)";
  if (compact.length <= SUMMARY_LIMIT) return compact;
  return compact.slice(0, SUMMARY_LIMIT - 3).trimEnd() + "...";
}

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
