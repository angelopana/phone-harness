/** Turn a finished run into an OpenClaw tool result, attaching the screenshot. */
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

export interface PhoneExecResult {
  content: Content[];
  details: Record<string, unknown>;
}

/** Last absolute image path in stdout that exists and was written during this call. */
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

/** Drop empty fields so the model sees only what happened. */
function payload(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
  );
}

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
