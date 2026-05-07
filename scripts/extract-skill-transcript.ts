#!/usr/bin/env npx tsx
/**
 * Extracts the conversation transcript from the most recent Claude Code session,
 * scoped to the last invocation of a given skill.
 *
 * Usage: npx tsx extract-skill-transcript.ts <skill-name>
 * Example: npx tsx extract-skill-transcript.ts brainstorm
 */

import fs from "fs";
import path from "path";
import os from "os";

const skillName = process.argv[2];
if (!skillName) {
  console.error("Usage: npx tsx extract-skill-transcript.ts <skill-name>");
  process.exit(1);
}

// Find the most recently modified JSONL across all Claude Code project directories
const claudeProjects = path.join(os.homedir(), ".claude/projects");
const files = fs
  .readdirSync(claudeProjects)
  .flatMap((dir) => {
    const dirPath = path.join(claudeProjects, dir);
    try {
      if (!fs.statSync(dirPath).isDirectory()) return [];
      return fs
        .readdirSync(dirPath)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => {
          const full = path.join(dirPath, f);
          return { name: full, mtime: fs.statSync(full).mtime };
        });
    } catch {
      return [];
    }
  })
  .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

if (files.length === 0) {
  console.error("No session files found.");
  process.exit(1);
}

const latest = files[0].name;
const records = fs
  .readFileSync(latest, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

// Find the last invocation of the target skill
let skillStart = -1;
for (let i = 0; i < records.length; i++) {
  const obj = records[i];
  if (obj.type === "assistant" && !obj.isMeta) {
    const content = obj.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block?.type === "tool_use" &&
          block?.name === "Skill" &&
          block?.input?.skill === skillName
        ) {
          skillStart = i;
          break;
        }
      }
    }
  }
}

if (skillStart === -1) {
  console.error(`Skill invocation for "${skillName}" not found in session.`);
  process.exit(1);
}

for (const obj of records.slice(skillStart)) {
  if (obj.isMeta) continue;
  if (obj.type !== "user" && obj.type !== "assistant") continue;

  const content = obj.message?.content;
  let text: string;

  if (Array.isArray(content)) {
    text = content
      .filter((p: any) => p?.type === "text")
      .map((p: any) => p.text)
      .join("\n")
      .trim();
  } else {
    text = String(content ?? "").trim();
  }

  if (!text || text.startsWith("<") || text.startsWith("/")) continue;

  const role = obj.type === "user" ? "User" : "Claude";
  console.log(`**${role}:** ${text}\n`);
}
