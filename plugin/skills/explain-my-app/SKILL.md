---
name: explain-my-app
description: Turn the current project into a plain-language interactive diagram (app-map.json) for a non-technical owner. Use when the user asks to explain their app, understand their codebase, or runs /explain-my-app.
---

# explain-my-app

Produce `app-map.json` — a 5–15 part plain-language map of this project — then (once the dashboard ships) open it. The user cannot read code; the map is how they understand what they own.

Base directory of this skill: referred to as `$SKILL` below.

## Pipeline

1. **Scan** (deterministic, no LLM):
   ```
   node $SKILL/scan-project.mjs <projectRoot> .ue/scan-result.json
   ```
   Emits detected stack + candidate key files. Never reads `.env` contents.

2. **Ask the one allowed question (only if needed)**: if the README gave no business context (scan-result's `readme` is null or contains no who/why), ask the user: "Who is this app for and what problem does it solve?" One question, then proceed. If skipped, leave `project.scenario` and `project.pain` empty — never invent them.

3. **Generate**: read `$SKILL/generate-prompt.md` and follow it exactly. Read the candidate files listed in the scan result. Write the result to `.ue/app-map.json`. Default language mode is `both` (every content value is an `{en, zh}` pair); single-language `en` or `zh` only if the user asks.

4. **Validate**:
   ```
   node $SKILL/validate-schema.mjs .ue/app-map.json
   ```
   On failure: fix using the printed errors, regenerate **once**, validate again. On second failure: delete the broken file, report the errors to the user in plain language, stop. Never leave a broken app-map.json on disk.

5. **Show**: run the CLI from the project directory — it serves the dashboard and picks up `.ue/app-map.json` automatically, then opens the browser:
   ```
   npx understand-everything
   ```
   In a development checkout of this repo, use `node <REPO>/cli/bin.mjs` instead (build the dashboard first if `packages/dashboard/dist` is missing: `npm run build --workspace packages/dashboard`).

Note for non-Claude agents: on Codex this skill is invoked as `$explain-my-app` (Codex uses `$`, not `/`); anywhere else, plain language works too: "use the explain-my-app skill".

## Hard rules

- `project.scenario` / `project.pain`: README or user input only. Empty beats invented.
- Parts, not files: 5–15 nodes, whiteboard granularity.
- Every consequential node carries a real tradeoff (chose A over B, cost, when to switch).
- Bilingual by default; tool names and code untranslated. Every sentence must pass the mom test (see generate-prompt.md) — plain words beat insider vocabulary.
