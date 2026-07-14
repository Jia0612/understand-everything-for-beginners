# Explain My App — adapter for OpenAI Codex (and any non-Claude coding agent)

This product does not call any LLM API itself. The analysis is done by whatever
AI coding agent you already use. This file is the instruction set that lets
**OpenAI Codex CLI** (or Cursor, Gemini CLI, etc.) run the same pipeline that
the Claude Code plugin runs.

## For Codex users — install as a custom prompt

Copy this file to `~/.codex/prompts/explain-my-app.md`, then run
`/explain-my-app` inside Codex from your project directory.
(Any other agent: just paste the Instructions section below into the chat.)

## Instructions (agent-facing, environment-neutral)

You are producing `app-map.json` — a 5–15 part plain-language map of the
current project, for an owner who cannot read code. `<REPO>` below is the
directory where understand-everything is installed.

1. **Scan** (deterministic script, no AI):
   ```
   node <REPO>/plugin/skills/explain-my-app/scan-project.mjs . .ue/scan-result.json
   ```
   It detects the tech stack and lists candidate key files. It never reads
   `.env` contents.

2. **Business context**: if the README gave no who-is-this-for/why, ask the
   user exactly one question: "Who is this app for and what problem does it
   solve?" If skipped, leave `project.scenario` and `project.pain` empty —
   never invent them.

3. **Generate**: read `<REPO>/plugin/skills/explain-my-app/generate-prompt.md`
   and follow it exactly (granularity, plain-language rules, bilingual
   `{en, zh}` pairs by default, tradeoffs for consequential parts). Read the
   candidate files from the scan result. Write `.ue/app-map.json`.

4. **Validate**:
   ```
   node <REPO>/plugin/skills/explain-my-app/validate-schema.mjs .ue/app-map.json
   ```
   On failure: fix using the printed errors, regenerate once, validate again.
   On second failure: delete the broken file and report the errors in plain
   language. Never leave a broken app-map.json on disk.

5. **Show**: paste the JSON into `<REPO>/docs/prototype.html` using
   ```
   node <REPO>/scripts/paste-into-prototype.mjs <REPO>/docs/prototype.html .ue/app-map.json
   ```
   (this escapes `</` sequences safely), then open the page in a browser.

## Why this works everywhere

The three pipeline pieces (scan script, generation ruleset, validator) are
plain Node.js and Markdown with zero Claude-specific assumptions. Only the
thin wrappers differ per platform: `plugin/` for Claude Code, this file for
Codex. Adding another platform = writing another file like this one.
