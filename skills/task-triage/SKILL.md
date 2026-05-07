---
name: task-triage
description: Triage and organize tasks from the Obsidian Tasks Inbox. Use when the user needs to process new tasks, assign metadata (dates, tags, priorities), and move them to their permanent project notes or scheduled lists.
---

# Task Triage Skill

This skill provides a systematic workflow for processing the `Tasks/Inbox.md` file and ensuring every captured task is properly categorized and scheduled.

## The Triage Workflow

Follow these steps when the user asks to "triage tasks" or "clean the inbox":

1.  **Read the Inbox**: Open `Tasks/Inbox.md` and identify all pending tasks.
2.  **Analyze Each Task**: For every task, determine its destination:
    *   **Project-Specific**: If it belongs to an existing project note (e.g., `Work Tasks.md`, `Cooking Database.md`), move it there.
    *   **Scheduled**: If it has a specific date, add a `📅 YYYY-MM-DD` string (using Obsidian Tasks format) and move it to `Tasks/Today.md` or keep it in the inbox if it's for a future date.
    *   **Someday/Maybe**: If it's a "would be nice" but not immediate, move it to `Tasks/Someday.md` or `Tasks/Ideas.md`.
    *   **Quick Win**: If it takes < 2 minutes, suggest doing it immediately and marking it done.
3.  **Apply Metadata**: Ensure tasks use standard tags and formats:
    *   Tags: `#work`, `#personal`, `#errand`, `#someday`.
    *   Dates: `📅 YYYY-MM-DD` (Scheduled), `🛫 YYYY-MM-DD` (Start), `⌛ YYYY-MM-DD` (Due).
4.  **Execute the Moves**: Use the `obsidian move` or `replace` tools to shift tasks to their final destinations.
5.  **Clean Up**: Ensure the `Tasks/Inbox.md` "Capture" section is empty once triaged.

## Permanent Destinations

*   `Tasks/Today.md` - For anything scheduled for today or overdue.
*   `Tasks/Someday.md` - For non-urgent personal aspirations.
*   `Tasks/Ideas.md` - For creative or project-starter seeds.
*   `Work Tasks.md` - For work-related tasks (actual path in local-preferences.md).
*   `Travel/` - For trip-specific planning tasks.

## Tips for the Agent

*   **Group Moves**: If multiple tasks are going to the same file, move them all in one `replace` call to be context-efficient.
*   **Ask when Ambiguous**: If a task could belong to two projects, ask the user for clarification.
*   **Suggest Deletion**: If a task looks outdated or irrelevant, ask the user if it should be deleted.
