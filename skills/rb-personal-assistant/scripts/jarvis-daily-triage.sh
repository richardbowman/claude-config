#!/bin/bash

# Jarvis Daily Triage Script
# This script runs headlessly to triage Gmail and updates Obsidian + macOS Notifications.

# Path setup for cron
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Configuration
GEMINI_BIN="/opt/homebrew/bin/gemini"
OBSIDIAN_BIN="/opt/homebrew/bin/obsidian"
LOG_FILE="/Users/rickbowman/.gemini/tmp/jarvis-triage.log"

# 1. Run Gemini Triage
echo "--- Starting Jarvis triage at $(date) ---" >> "$LOG_FILE"

# Run gemini and capture output
SUMMARY=$($GEMINI_BIN --prompt "Triage my latest Gmail inbox. Summarize any urgent alerts or action items concisely. Archive routine newsletters, promotional items, and shipping notifications. Move condo notices to Home. Provide a clean, markdown summary." --approval-mode=yolo 2>&1)

# Log the summary for debugging if needed
echo "$SUMMARY" >> "$LOG_FILE"

# 2. Process and Save to Obsidian
# Format the summary: remove mechanical logs, keep the core report.
# We expect the SUMMARY to contain the markdown report from Gemini.
REPORT_FILE="Jarvis Summaries/Triage-$(date +'%Y-%m-%d-%H-%M').md"

# 3. Create individual file in Obsidian
# Note: Obsidian must be open for the 'obsidian' command to work via the socket.
$OBSIDIAN_BIN create path="$REPORT_FILE" content="# Triage Summary: $(date +'%Y-%m-%d %H:%M')\n\n$SUMMARY" overwrite open

# 4. macOS Notification
osascript -e "display notification \"Inbox triaged. Report saved to $REPORT_FILE.\" with title \"Jarvis\" subtitle \"Daily Triage Complete\""

echo "--- Triage complete at $(date) ---" >> "$LOG_FILE"
