# digest-session

Analyze the current session and write a curated digest to `~/.claude/projects/-Users-lucille/memory/session-history/`.

## What to extract

Look at everything that happened in this conversation and pull out only what would matter in a future session:

- **Decisions made** — architectural choices, direction changes, things explicitly accepted or rejected and why
- **New workflows discovered** — scripts, commands, sequences that worked and are reusable
- **Gotchas encountered** — bugs hit, wrong assumptions corrected, surprising behavior from APIs/tools/files
- **Files created or significantly modified** — path + what it does (not a line-by-line summary)
- **Open threads** — things explicitly deferred, things that need follow-up, partial work left intentionally incomplete

Skip anything already covered in MEMORY.md or its linked files. Don't summarize routine operations (read this file, ran that command) unless the result was surprising.

## Output format

Write a single file to `/Users/lucille/.claude/projects/-Users-lucille/memory/session-history/` named `YYYY-MM-DD-<slug>.md` where slug is 2-4 kebab-case words describing the session topic.

Use this structure:

```markdown
# Session: <topic> — <date>

## Context
One sentence on what this session was about.

## Key Decisions
- <decision>: <why>

## Workflows & Commands
```bash
# <what this does>
<command>
```

## Gotchas
- <thing that bit us>: <what's actually true>

## Files Changed
- `path/to/file` — <what it does / what changed>

## Open Threads
- <deferred item or follow-up needed>
```

Omit any section that has nothing worth recording. Keep entries terse — one line each unless the why requires more.

After writing the file, output the filename and a 2-line summary of what was captured.

## Arguments
$ARGUMENTS
