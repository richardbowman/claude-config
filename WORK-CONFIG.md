# Work-Specific Configuration

Work-specific Claude Code configuration (Bankrate-related skills and scripts) has been moved to a separate private repository:

**Repository**: [`rickbowman-br/br-claude-config`](https://github.com/rickbowman-br/br-claude-config)

**Location**: `~/GitHub/br-claude-config`

## What was moved

- `skills/br-goals` - Bankrate Atlassian Goals management
- `scripts/atlassian-goals` - OKR sync CLI (Google Sheets → Atlassian)
- `scripts/repo-docs` - Repository documentation tools

## Why separate?

Keeping work-specific configuration separate from personal configuration:
- Maintains privacy for work-related tooling
- Makes it easier to share personal config publicly
- Cleaner separation of concerns
- Work repo can remain private in the rickbowman-br organization

## Using work skills

Skills from the work repo can still be referenced when working in Bankrate projects. Claude Code can access skills from multiple repositories.
