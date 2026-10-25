/**
 * Turn a finished run into an OpenClaw tool result, attaching the screenshot.
 *
 * @module
 */
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

import type { RunResult } from "./process.ts";

const OUTPUT_CAP = 50_000;
const STDERR_CAP = 4_000;
const MAX_IMAGE_BYTES = 5_000_000;
// Covers filesystems that store timestamps in whole seconds.
const MTIME_SLACK_MS = 1000;

// Absolute PNG / JPEG / WebP paths. A relative path, or a suffix of one, does not count.
const IMAGE_PATH = /(?<![\w.])((?:[A-Za-z]:[\\/]|\/)[^\s"']+?\.(?:png|jpe?g|webp))(?![\w.])/gi;
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

/** The tool result handed back to OpenClaw. */
export interface PhoneExecResult {
  /** A JSON text summary of the run, then the screenshot when there is one. */
  content: Content[];
  /** The same summary as structured data. */
  details: Record<string, unknown>;
}

/**
 * Finds the screenshot a script saved during this call.
 *
 * @param stdout - What the script printed; `screenshot()` prints the path it saved.
 * @param sinceMs - When the run started, in epoch milliseconds.
 * @returns The last absolute image path that exists and was written since
 *   `sinceMs`, or `undefined`.
 */
export function findScreenshot(stdout: string, sinceMs: number): string | undefined {
  const paths = [...stdout.matchAll(IMAGE_PATH)].map((m) => m[1]);
  for (const path of paths.reverse()) {
    try {
      const stat = statSync(path);
      if (stat.isFile() && stat.mtimeMs >= sinceMs - MTIME_SLACK_MS) return path;
    } catch {
      continue;
    }
  }
  return undefined;
}

function imageContent(path: string): Content | undefined {
  try {
    const bytes = readFileSync(path);
    // Too large to hand the model whole; the path stays in the text result.
    if (bytes.length > MAX_IMAGE_BYTES) return undefined;
    const mimeType = IMAGE_MIME[extname(path).toLowerCase()] ?? "image/png";
    return { type: "image", data: bytes.toString("base64"), mimeType };
  } catch {
    return undefined;
  }
}

// Drop empty fields so the model sees only what happened.
function payload(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
  );
}

/**
 * Builds the tool result for a finished run.
 *
 * @param run - The finished run.
 * @param workspace - The agent workspace folder, reported back to the model.
 * @returns Output, exit code and stderr tail as JSON text, plus the
 *   screenshot as an image when one under 5 MB was saved.
 */
export function toToolResult(run: RunResult, workspace: string): PhoneExecResult {
  const shot = findScreenshot(run.stdout, run.startedMs);
  const details = payload({
    success: run.exitCode === 0,
    exit_code: run.exitCode,
    output: run.stdout.slice(-OUTPUT_CAP),
    stderr: run.stderr.trim().slice(-STDERR_CAP),
    screenshots: shot ? [shot] : [],
    workspace,
  });
  const content: Content[] = [{ type: "text", text: JSON.stringify(details) }];
  const image = shot ? imageContent(shot) : undefined;
  if (image) content.push(image);
  return { content, details };
}
