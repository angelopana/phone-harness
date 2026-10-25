// Build the bundled skill from the repo's SKILL.md, with OpenClaw's frontmatter.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SOURCE = new URL("../../../SKILL.md", import.meta.url);
const TARGET_DIR = new URL("../skills/phone-harness/", import.meta.url);

// OpenClaw wants a description under 160 characters and gates on the CLI being installed.
const FRONTMATTER = `---
name: phone-harness
description: "Control the user's phone (iPhone via iPhone Mirroring, Android over adb, or a cloud phone) with the phone_exec tool."
metadata: { "openclaw": { "requires": { "bins": ["phone-harness"] } } }
---
`;

const text = readFileSync(SOURCE, "utf8").replace(/^﻿/, "");
const body = text.replace(/^---\n[\s\S]*?\n---\n/, "");
if (body === text) throw new Error("SKILL.md has no frontmatter to replace");

mkdirSync(TARGET_DIR, { recursive: true });
writeFileSync(new URL("SKILL.md", TARGET_DIR), FRONTMATTER + body);
