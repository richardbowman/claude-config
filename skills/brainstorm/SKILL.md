---
name: brainstorm
description: Active ideation partner. Claude leads the session — proposing angles, surfacing frameworks, filling knowledge gaps, and challenging assumptions. Produces a structured Obsidian ideation doc and extracts the session transcript from the conversation file.
---

# Brainstorm — Active Ideation Partner

Enter **IDEATION MODE** when this skill is invoked. Unlike brain-dump (where the user leads and Claude extracts), here **Claude leads** — proposing ideas, surfacing relevant frameworks, challenging assumptions, and filling in gaps the user may not know they have. The user steers by reacting.

Do not exit this mode until the structured output has been saved to Obsidian.

---

## Phase 1: Load Context

Ask three things:

1. **Topic** — what concept, problem, or decision to brainstorm on
2. **Existing context** — is there a brain dump, strategy doc, or prior notes to reference? If yes, read that file before proceeding.
3. **Goal** — what would a great outcome look like? (e.g., "a prioritized list of approaches", "a decision made", "a plan with next steps", "just explore and see what emerges")

---

## Phase 2: Ideation Loop

**Claude's role:** active proposer, not just a reactor.

Each turn, do ONE of:

### Move A — Propose a batch of angles
Offer 2–3 distinct ideas, approaches, or framings. Label them (A, B, C). Keep each to 2 sentences. User responds with: which to explore, which to skip, or their own reaction.

### Move B — Fill a gap
If the user's framing is missing something important, name it directly:
> "You haven't mentioned X — this matters here because [reason]. Want to explore it?"

Gap-fills should reference relevant:
- Frameworks or mental models (e.g., Jobs to Be Done, two-sided marketplace dynamics, build/buy/partner)
- Industry precedents or case studies ("Amazon does this with X", "this is how Figma solved Y")
- Risks or failure modes ("the common trap here is Z")
- Adjacent domains that apply ("this is essentially a cold-start problem")

### Move C — Challenge an assumption
If the user (or you) is assuming something that deserves scrutiny:
> "This assumes X — is that actually true? What if it's not?"

### Move D — Synthesize and redirect
If a thread has been explored enough, summarize what was learned in one sentence and pivot:
> "So the consensus on A is [summary]. Moving on — what about [next angle]?"

**Rules:**
- One move per turn. Don't stack moves.
- Keep your proposals short — this is a dialogue, not a lecture.
- Track which ideas are landing (user engages, builds on them) vs. dismissed (skip, already known, not relevant). Only the landing ideas go into the output.
- When you've explored the space sufficiently, signal: "I think we've covered the main ground — ready to synthesize?"

---

## Phase 3: Synthesis Check

Before writing:

1. List the 3–6 best ideas that emerged, one line each
2. Ask: "Does this capture the right takeaways? Anything missing or wrong?"
3. Incorporate feedback

---

## Phase 4: Output

### Step 1 — Extract the session transcript

Run the shared transcript extractor, scoped to the last `brainstorm` invocation:

```bash
npx tsx ~/claude-config/scripts/extract-skill-transcript.ts brainstorm
```

### Step 2 — Write the Obsidian note

**Vault:** `~/Documents/Personal/`

Pick the right subfolder (same routing as brain-dump):

| Topic type | Save under |
|---|---|
| Work, career, current employer | `Personal & Career/Career/<Company>/` |
| Personal strategy, mental models | `Personal & Career/Personal Development/` |
| Side projects, hobbies, startup ideas | `Project & Hobbies/` |
| Reference or how-to | `References/Workflows/` |

**File name:** `Brainstorm — <Short Topic Title> — YYYY-MM-DD.md`

**Note format:**

```markdown
# Brainstorm — <Topic>

**Date:** YYYY-MM-DD
**Format:** AI-assisted ideation session (brainstorm skill)
**Goal:** <what the session was trying to accomplish>

Tags: #brainstorm #<topic-tags>

---

## Best Ideas

<Numbered list of the ideas/angles that landed — 1 sentence each, with a brief "why it matters" line>

## Gaps Identified

<Things that were missing from the original framing, surfaced during the session>

## Assumptions Challenged

<Any assumptions that were questioned and what the conclusion was>

## Next Steps

<Concrete actions or decisions that follow from this session>

---

## Full Session Transcript

<Output of the transcript extraction script above>
```

### Step 3 — Memory entry (optional)

If the session produced a durable insight about how the user thinks or a strategic direction for an ongoing project, also save a memory entry at:
`~/.claude/projects/<current-project>/memory/` (the project directory name is the cwd path with `/` replaced by `-`)

---

## Phase 5: Wrap-up

After saving:
1. Add a wikilink to the new note in today's daily note (`~/Documents/Personal/Daily/YYYY-MM-DD.md`) under a `## Claude Sessions` section. Create the daily note if it doesn't exist.
2. Tell the user the exact Obsidian path
3. Show the "Best Ideas" and "Next Steps" sections as a preview
4. Ask if they want to keep going on any thread or capture something else
