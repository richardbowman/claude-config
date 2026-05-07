---
name: brain-dump
description: Interactive knowledge extraction interviewer. Enters a structured interview mode to extract tacit knowledge from the user and saves a full transcript + structured notes to the Obsidian vault.
---

# Brain Dump — Knowledge Capture Interviewer

Enter **INTERVIEWER MODE** when this skill is invoked. Your job is to extract knowledge from the user through structured questioning and save it as a permanent, well-structured Obsidian note. Do not exit this mode until output has been saved.

---

## Phase 1: Opening

Greet the user briefly — say you're in interviewer mode and ready. Ask two things:

1. **What to capture** — a task, workflow, strategy, process, opinion, or mental model they want to externalize
2. **Time available** — roughly (5 min, 15 min, 30 min+)

---

## Phase 2: Extraction

Rules:
- Ask **ONE question at a time**. Never stack multiple questions in one message.
- Start broad ("Tell me about X"), then drill down.
- After each answer, choose one move:
  - **Follow a thread** — pick the most interesting or unclear thing they said and probe it specifically
  - **Surface an assumption** — "it sounds like you assume X — is that right?"
  - **Ask for an example** — "can you walk me through a real case of that?"
  - **Ask the new-person question** — "what would you tell someone new to this who asked you how it works?"
  - **Ask what breaks** — "what goes wrong if someone does this incorrectly?"
- Keep the tone conversational. This is a dialogue, not a form.
- Track mentally what you've covered. When you have a complete picture, move to Phase 3.

---

## Phase 3: Synthesis Check

Before writing anything:

1. Say: "I think I have a solid picture — let me read it back."
2. Summarize your understanding in **plain prose**, 4–8 sentences. No headers yet.
3. Ask: "What's missing, wrong, or oversimplified in that?"
4. Incorporate corrections. If corrections were significant, summarize once more.

---

## Phase 4: Output

### Primary output — Obsidian note (always)

**Vault location:** `~/Documents/Personal/`

Pick the right subfolder based on topic:

| Topic type | Save under |
|---|---|
| Work, career, current employer | `Personal & Career/Career/<Company>/` |
| Personal strategy, mental models, self-development | `Personal & Career/Personal Development/` |
| Side projects, hobbies, startup ideas | `Project & Hobbies/` |
| How-to workflows, reference material | `References/Workflows/` |

**File name:** `Brain Dump — <Short Topic Title> — YYYY-MM-DD.md`

**Note format:**

```markdown
# Brain Dump — <Topic>

**Date:** YYYY-MM-DD
**Format:** AI-assisted knowledge extraction interview (brain-dump skill)
**Status:** Complete | Partial — open questions remain

Tags: #braindump #<topic-tags>

---

## Overview

<2–4 sentence synthesis of what was captured>

---

## Full Session Transcript

<Extract using this script, then paste the output here:>

```bash
npx tsx ~/claude-config/scripts/extract-skill-transcript.ts brain-dump
```

---

## Key Takeaways

<Structured summary — tables, bullet lists, whatever best fits the material>

---

## Open Questions

<Numbered list of threads not fully explored, or follow-up questions for next session>
```

### Secondary output — memory index entry (when valuable for Claude's recall)

If the content is something Claude should remember across future conversations (a strategy, preference, or ongoing project), also save a memory entry:

- File: `~/.claude/projects/<current-project>/memory/<name>.md` (the project directory name is the cwd path with `/` replaced by `-`)
- Frontmatter: `name`, `description`, `type` (user / feedback / project / reference)
- Add pointer line to `MEMORY.md`

If the content is purely a one-off capture (a meeting recap, a reference document), skip the memory entry — the Obsidian note is enough.

### Optional — Skill file

If the session captured a repeatable workflow that Claude should execute in the future, also create a skill file at `~/.claude/skills/<slug>.md`.

---

## Phase 5: Wrap-up

After saving:
1. Add a wikilink to the new note in today's daily note (`~/Documents/Personal/Daily/YYYY-MM-DD.md`) under a `## Claude Sessions` section. Create the daily note if it doesn't exist.
2. Tell the user the exact Obsidian path where you saved it
3. Show a short preview (first 20 lines of the note)
4. Ask if they want to capture anything else while in this mode
