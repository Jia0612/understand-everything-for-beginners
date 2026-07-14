# Build Spec: "Understand My App" — a plain-language app explainer for zero-CS vibe coders

You are building this project from scratch. Read this whole file before writing any code. The `feynman-explainer` skill is installed and applies to this session: explain consequential decisions before acting, in plain language.

## 1. What this product is

A tool that turns a vibe-coded project into an interactive diagram the owner can actually understand. The user is a vibe coder with **zero CS background**: they direct AI to write code but cannot read it. The product answers, for every part of their app:

1. What tools it uses — strictly organized as **Frontend / Backend / Database** (storage and cloud services all count as Database)
2. Why it was designed this way — "how this affects you" BEFORE "how it works"
3. Where it sits in the data flow (shown by highlighting on the canvas, never as text)
4. What the tradeoff was — chose A over B, the cost, and when to switch

Reference product: **Understand Anything** (github.com/Egonex-AI/Understand-Anything, MIT). Clone it and study it before starting. We inherit its skeleton and reject its granularity:

- **Copy**: the four-part architecture (plugin pipeline → static JSON → React dashboard → CLI local server); the `.claude-plugin/` packaging; the CLI approach in its `understand-dashboard` skill; the deterministic scan scripts (`scan-project.mjs`, `extract-import-map.mjs`); the design tokens (listed in §6).
- **Reject**: file/function/class node granularity (we use 5–15 "parts" per project); the FilterPanel and node-type toggles (our low node count makes them unnecessary); the persona switcher (we are hard-fixed to non-technical); the CodeViewer that loads whole source files (we embed curated snippets in the JSON); force-directed layout (we use fixed lanes, §5).

## 2. Repo layout

```
understand-my-app/
  plugin/                      # Claude Code plugin (first adapter)
    .claude-plugin/            # plugin.json, marketplace.json — copy UA's structure
    skills/explain-my-app/     # SKILL.md entry + pipeline scripts
      SKILL.md
      scan-project.mjs         # deterministic, no LLM
      generate-prompt.md       # the content-generation ruleset (see §4)
      validate-schema.mjs
  packages/
    core/                      # app-map.json schema (zod) + shared types
    dashboard/                 # React + Vite + Tailwind v4
  cli/                         # npx understand-my-app → serve dashboard + JSON locally
  docs/
    prototype.html             # the approved HTML demo — source of truth for UI, copy tone, interactions
    app-map.example.json       # the demo ad-pipeline data extracted from the prototype
```

Environment-agnostic core: everything except `plugin/.claude-plugin/` must be runnable by any agent (Codex, Cursor, Gemini CLI). Adapters for other environments come later; do not block on them, but do not bake Claude-specific assumptions into `packages/` or `cli/`.

## 3. The data contract: app-map.json

This schema is frozen. Implement it in `packages/core` with zod validation.

```jsonc
{
  "version": 1,
  "language": "en",                       // "en" | "zh" — content language of this file
  "project": {
    "name": "",
    "scenario": "",                       // business context. From README/user input ONLY.
    "pain": "",                           // the pain before. From README/user input ONLY.
    "now": ""                             // what it does now
  },
  "chain": ["id1", "id2"],                // main data flow, ordered, 4–15 parts
  "nodes": {
    "id1": {
      "lane": "fe",                       // "fe" | "be" | "db"  (storage/cloud = db)
      "tool": "cronjob / AWS Lambda",     // the actual tech, shown on the node card
      "grade": "routine",                 // "trivial" | "routine" | "consequential"
      "needs": [],                        // upstream ids
      "feeds": ["id2"],                   // downstream ids
      "name": "",
      "role": "",                         // its specific job in THIS project. One sentence.
      "impact": ["", ""],                 // user-facing consequences. 2–3 items.
      "how": "",                          // ≤3 sentences, jargon defined in parentheses
      "fail": "",                         // 1 sentence: what happens when it breaks
      "code": [                           // null if the part is configured, not coded
        { "c": "3–8 real lines", "n": "one plain-language note per block", "risk": null }
      ],                                  // risk: string only for lines that call external
                                          // APIs, write to storage, or are hard to reverse
      "tradeoff": {                       // ONLY when grade = consequential, else null
        "a": "what was chosen",
        "b": "what was not",
        "cost": "",
        "when": ""                        // the action signal: when to switch
      },
      "tourHint": ""                      // one line for the guided tour
    }
  },
  "diff": { "changed": [], "affected": [] }   // node ids; empty on first generation
}
```

## 4. Generation pipeline (the product's core — build and validate this FIRST)

`/explain-my-app` in Claude Code runs:

1. **Scan** (deterministic, no LLM): read package.json / requirements / config files / directory tree; emit a manifest of detected stack + candidate key files. Port UA's scan scripts.
2. **Generate**: the agent reads the manifest + key source files and produces `app-map.json` following `generate-prompt.md`.
3. **Validate**: zod check. On failure, retry generation once with the validation errors appended. On second failure, abort with a readable message — never write a broken JSON.
4. **Diff** (P1, after M5): compare against the previous app-map.json, fill `diff.changed` / `diff.affected`.

`generate-prompt.md` must encode these content rules (they are distilled from the attached feynman-explainer SKILL.md — embed that file's relevant sections rather than paraphrasing loosely):

- `role` states the component's specific job in THIS project. Never a generic analogy. ("Kicks off an ad-data pull every hour" — not "an alarm clock".)
- Analogies are allowed only inside `how`, only for concepts genuinely unfamiliar to a non-programmer, and only if they map to the component's role in this specific project and survive a follow-up question. A plain sentence beats a forced analogy.
- `impact` items are user-facing only: money, speed, future flexibility, what breaks. Never mechanism.
- Every technical term gets a plain-language definition in parentheses on first use.
- `grade` gates content: `trivial` parts get role + how only; `routine` adds impact + fail; `consequential` adds the tradeoff block. Grading measures product consequence, not code complexity, but `tradeoff` is **system-design only**: architecture, storage, services, runtime shape, security boundary, reliability, speed, cost, or hard-to-reverse build choices. Prompt wording, `.md` instruction rules, writing style, approval workflow, chapter structure, labels, and visual tone stay `routine` unless they directly control how the system runs.
- `code` snippets are cut at generation time: 3–8 lines that ARE the component, one note per block (per-block, not per-line). `risk` flags external API calls, storage writes, and hard-to-reverse operations, with the consequence stated ("this line spends your API quota").
- `project.scenario` and `project.pain` come from the README or explicit user input ONLY. If absent, ask the user one question: "Who is this app for and what problem does it solve?" If they skip, leave the fields empty. **Never invent business context** — it is the one section the user can personally verify, and fabricating it poisons trust in everything else.
- Write all strings in the language the user requested (en default, zh supported).

**Milestone M1 (do this before any dashboard work)**: run steps 1–3 manually against one real vibe-coded repo the user provides, paste the resulting JSON into `docs/prototype.html` (replace its DEMO object), and have the user judge the content quality. The generation prompt will need several iterations; that loop is cheapest before the real frontend exists.

## 5. Dashboard

React + Vite + TypeScript + Tailwind v4 + zustand. No React Flow needed — our layout is deterministic (below). Port `docs/prototype.html` faithfully; it is the approved spec for layout, interactions, copy tone, and visual style. Component split mirrors UA: `GraphView` (canvas), `NodeInfo` (right panel), `TourBar`, `OnboardingModal`.

**Layout is rule-based, not force-directed:**
- Three horizontal lanes: Frontend (top) / Backend (middle) / Database (bottom).
- Node x = its index in `chain` × fixed spacing. Node y = its lane's center.
- Edges connect consecutive chain nodes: straight line within a lane, cubic bezier across lanes. Arrowheads always.

**UI trinity — never add a fourth region:** header (brand · project chip · search · EN/中文 pill · tour button) + full-bleed canvas + one 350px right panel. Details and the tour live inside the panel; nothing opens as a blocking modal except onboarding.

**Right panel, fixed section order** (six sections is the ceiling):
1. Name + badges (tool · lane · "Stop N of M") + `role` line with gold left border
2. "How this design affects you" (impact bullets)
3. "How it works" + a muted "When it breaks:" line
4. Dependencies: "It needs / Waiting on it" as clickable chips that jump to that node
5. "Core code (N lines)" — collapsed by default; expanded shows code blocks, each with its note and optional amber risk strip. If `code` is null: "No code here — this part is configured, not written."
6. "The tradeoff" — only rendered for consequential nodes: chose A over B / cost / when to switch

**Onboarding + tour:**
- First load: modal with language picker (English default, 中文), optional GitHub URL field (wire the field; the analyze path can stub to "run /explain-my-app in your agent" until the web pipeline exists), and "Explore the demo project".
- After the modal: canvas dimmed to ~15%, only the tour button lit and pulsing.
- Tour step 0 = project summary (scenario → pain → now) with an always-pulsing Next; steps 1..N walk the chain in order, each step selects the node and applies upstream/downstream highlight (upstream blue #4a7c9b, downstream gold, legend bottom-left). Any node click or search input also wakes the canvas.

**i18n:** en/zh UI string tables; default en. Node content language comes from the loaded app-map.json.

## 6. Design tokens (frozen — from UA, MIT)

Background #0a0a0a, surface #111111, elevated #1a1a1a, panel #141414. Accent #d4a574 (bright #e8c49a), warn #d4a030. Text #f5f0eb / #a39787 / #6b5f53. Borders rgba(212,165,116,.12/.25). Lanes: fe #7ba4c9, be #5a9e6f, db #c9a06c. Upstream highlight #4a7c9b. Fonts: DM Serif Display (headings), Inter (body), JetBrains Mono (code/tool badges). 3%-opacity SVG noise overlay on body. Exact CSS lives in the prototype — copy it.

## 7. CLI

`npx understand-my-app` in a project directory: serve `packages/dashboard` build + the local `app-map.json`, open the browser. Port UA's `understand-dashboard` approach. A few dozen lines; no config.

## 8. Build order and acceptance

1. **M1 — Generation quality loop**: scan script + generate-prompt.md + manual run on a real repo → JSON pasted into prototype → user approves content. *Nothing else starts until this passes.*
2. **M2 — Schema + validation**: packages/core zod schema, validate + one retry.
3. **M3 — Dashboard**: port prototype to React, load external app-map.json, auto layout, i18n. Acceptance: demo JSON and an M1-generated JSON both render correctly with 4 and with 12 nodes.
4. **M4 — CLI**: one command serves everything locally.
5. **M5 — Plugin packaging**: `.claude-plugin/` manifest, `/explain-my-app` triggers scan→generate→validate→open dashboard end to end.
6. **M6 — Diff**: regenerate after an AI edit, changed/affected nodes highlighted red/amber on the canvas (reuse UA's diff color tokens).

## 9. Out of scope (do not build now)

Web version with hosted analysis, accounts, Supabase persistence, languages beyond en/zh, adapters beyond Claude Code (keep the core agnostic so they cost little later), mindmaps or any second canvas view, persona switching, whole-file code viewing.

## 10. Change log (user-approved amendments to this spec)

- **2026-07-13** Product name is **Understand Everything** (not "Understand My App"). Onboarding GitHub field must not say "Your" — any repo can be analyzed.
- **2026-07-13** §3 amended: content values may be bilingual pairs `{"en": "...", "zh": "..."}`; `language` gains `"both"`, which is now the **default** generation mode (user decision: instant EN/中文 switching on one file, both languages written natively in one pass).
- **2026-07-13** §4 amended: generate-prompt.md carries a "mom test" anti-jargon section with banned insider vocabulary (first M1 review verdict: too much jargon).
- **2026-07-13** §9 amended: an OpenAI/Codex adapter is IN scope (user decision) — implemented as `adapters/codex/explain-my-app.md`, a thin instruction file; core stays agnostic, no API integration (the product never calls LLM APIs directly).

- **2026-07-13 (second review round)** §3: code blocks gain optional `lines` — per-line Feynman translations, one entry per code line, required for new generations (generate-prompt.md). §5: onboarding modal slimmed to title + language + one start button (GitHub field and demo/analyze buttons removed, user decision); right panel is drag-resizable 280–640px. §6: all component colors routed through CSS variables; theme candidates `paper` and `ink` selectable via ?theme= (docs/theme-proposals.html holds the rationale; default remains the original gold until the user picks).

- **2026-07-13 (final)** §6 superseded: user picked palette F "Graphite Lime" (bg #121212, accent #a3e635, all-Inter type) as the DEFAULT dashboard theme. Original gold tokens remain available via ?theme=gold; paper/ink kept as candidates. All colors flow through the CSS variable tables in packages/dashboard/src/tokens.css.

## 11. Working style for this session

Explain consequential choices before implementing (feynman-explainer applies). When a decision could reasonably go two ways, present the options with what the user gains and gives up, and let them pick. Keep every explanation shorter than the code it explains.
