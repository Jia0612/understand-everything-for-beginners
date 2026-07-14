# generate-prompt.md — ruleset for producing app-map.json

You are explaining a vibe-coded project to its owner: a person with **zero CS background** who directed an AI to write this code and cannot read it. Your output is a single `app-map.json`. Every string in it must survive one test: *could the owner repeat this sentence to a friend and be correct?*

## Inputs

1. `scan-result.json` — deterministic manifest: detected stack, candidate key files, README head, file list. Trust it for *what exists*; it says nothing about *why*.
2. The candidate key files (read them), plus any other files you need to understand the data flow.
3. The user's requested language: `both` (default — bilingual), `en`, or `zh`. When `both`, **every content value** (`name`, `role`, `impact` items, `how`, `fail`, code notes, `risk`, tradeoff fields, `tourHint`, project fields) is a pair: `{"en": "...", "zh": "..."}`, both sides complete — never leave one language behind, never machine-gloss one from the other; write each language natively. Tool names and code lines stay as-is (React is React in both languages).

## Output shape (schema is frozen — validate-schema.mjs enforces it)

```jsonc
{
  "version": 1,
  "language": "both",                     // "both" (default) | "en" | "zh"
                                          // when "both": every content value below is {"en": "...", "zh": "..."}
  "project": { "name": "", "scenario": "", "pain": "", "now": "" },
  "chain": ["id1", "id2"],                // main data flow, ordered, 4–15 parts
  "nodes": {
    "id1": {
      "lane": "fe",                       // "fe" | "be" | "db" — storage AND cloud services count as db
      "tool": "cronjob / AWS Lambda",     // the actual tech on the node card
      "grade": "routine",                 // "trivial" | "routine" | "consequential"
      "needs": [], "feeds": ["id2"],      // upstream / downstream node ids
      "name": "", "role": "",
      "impact": ["", ""],                 // 2–3 items, user-facing only
      "how": "",                          // ≤3 sentences
      "fail": "",                         // 1 sentence
      "code": [ { "c": "3–8 real lines", "n": "one note per block", "risk": null } ],  // or null
      "tradeoff": { "a": "", "b": "", "cost": "", "when": "" },  // ONLY when consequential, else null
      "tourHint": ""
    }
  },
  "diff": { "changed": [], "affected": [] }   // empty on first generation
}
```

## Granularity: parts, not files

5–15 **parts** per project. A part is something the owner would draw on a whiteboard: "the login screen", "the sync engine", "the database" — never a file, function, or class. If you have more than 15, you are describing the code, not the product; merge until each part earns its box. `chain` is the main data flow through those parts, in order.

## Content rules (distilled from the feynman-explainer skill — these are binding)

**`role` — the specific job in THIS project.** Never a generic analogy, never a category description. "Kicks off an ad-data pull every hour" — not "an alarm clock", not "a scheduling component". If the sentence could describe the same tool in a different project, it is too generic; rewrite.

**Analogies** are allowed only inside `how`, and only when all three hold:
1. the concept is genuinely unfamiliar to a non-programmer,
2. the analogy maps to the component's role *in this specific project*, and
3. it would survive a follow-up question.

From the skill, verbatim — this is the bar:

> Test the analogy before committing: would it survive a follow-up question? If it breaks immediately, a plain one-sentence description beats a forced analogy. Skip analogies entirely for concepts the user already knows.
> Simplify without lying. "A database is where your data lives, organized so you can find things fast" is honest. "A database is just a big spreadsheet" plants a wrong mental model that costs them later.

**`impact` — user-facing consequences only**: money, speed, future flexibility, what breaks, what the owner no longer has to do by hand. Never mechanism. "Visitors will see results in about a second" is impact; "this implements an asynchronous fetch pattern" is not. Order the items by what the owner cares about most.

**Technical names may stay; filler jargon may not.** Keep real names the owner will hear again from engineers or dashboards: `Fetch Layer`, `API`, `Redis`, `PostgreSQL`, `cron`, `SDK`, `React`, file names, table names, function names, and product names. Those are labels for real things. But the sentence around the label must be plain enough that the owner still understands the point if they skip the label.

Every technical term gets a plain-language definition in parentheses on first use *within that node*. (An API is simply an agreed way for two programs to talk.) Terms already defined in an earlier chain node may be reused bare in later ones — the tour reads in chain order.

**The mom test — this rule outranks style.** Before emitting any sentence, ask: *would a smart adult with zero tech exposure understand it on first read?* If not, rewrite. Field-tested failures to avoid (real user feedback, 2026-07-13):

- Never coin insider nouns when an everyday phrase exists. "并行子代理" → "几个 AI 帮手同时干活" / "several AI helpers working at once". "模块简报" → "分工单" / "work sheet". "序列化 / 实例化 / 编排" and their English cousins ("orchestration", "instantiate") are banned outright.
- Keep names like "Fetch Layer" only when they are the actual part name. Do not let them drag in extra jargon. Good: "The Fetch Layer goes to each ad platform and brings back raw numbers." Bad: "The Fetch Layer implements a unified adaptor interface for external data ingestion."
- Replace vague engineering nouns with visible actions:
  - "接口 / interface" → "the same shape of request" or "the same way to ask for data"
  - "适配器 / adaptor" → "one small connector for each platform"
  - "限流 / rate limiting" → "slows calls down so the platform does not block you"
  - "去重 / dedup" → "keeps the same record from being counted twice"
  - "编排 / orchestration" → "decides who does what next"
  - "聚合查询 / aggregate query" → "adds many rows into one chart number"
  - "持久化 / persistence" → "saves it so it is still there later"
  - "上游/下游 / upstream/downstream" → "the part before this / the part waiting for this"
- Node `name`s are the worst place for jargon — they're the first thing seen on the canvas. Name parts the way the owner would point at them on a whiteboard.
- If a technical word must stay (Redis, cron, API, Fetch Layer), keep it, define it in parentheses when needed, and make the *rest* of the sentence carry the meaning — the reader should get the point even if they skip the term.
- Prefer verbs over nouns: "把各章拼成一个网页" beats "执行组装流程".

**`how`**: ≤3 sentences, mechanism explained in plain words, jargon rule applies. **`fail`**: exactly the one sentence the owner needs — what visibly happens when this part breaks, and whether it cascades. Users assume code either works or explodes; knowing there's a plan for failure is how they stay confident.

**`grade` gates content** — grade measures *product consequence*, not code complexity:
- `trivial`: role + how only (impact `[]`, fail `""`, tradeoff null)
- `routine`: adds impact + fail
- `consequential`: adds the tradeoff block — required. A part is consequential **only when a real system-design choice was made**: architecture, storage, external services, build strategy, runtime shape, data ownership, security boundary, or anything expensive to reverse or with ongoing operating cost. From the skill: *"any case where two experienced engineers could reasonably recommend different approaches."*

  **Tradeoff is for system design only (user rule, 2026-07-13).** Do not write a tradeoff just because the author made a deliberate choice. A rule in a Markdown file, a content convention, a prompt instruction, or a workflow preference can be important, but it is not automatically a system-design tradeoff.

  Use this matrix before setting `grade: "consequential"`:

  - **Always consider tradeoff:** database choice, cache choice, queue/background job choice, hosted service vs self-hosted, local-only vs cloud, browser-only vs server, one shared engine vs generated code at runtime, parallel processing vs sequential processing, plugin architecture vs one hard-coded flow, storing user data vs recomputing it, public API vs private/internal API.
  - **Usually no tradeoff:** `.md` instruction files, prompt wording, writing style, course chapter structure, labels/copy, visual tone, onboarding wording, "ask approval first vs just build" product behavior, content quality rules, naming conventions, folder organization that does not affect runtime behavior.
  - **Conditional:** a Markdown/config file may get a tradeoff only if it *controls how the system runs*, not merely what it says. Example yes: a config chooses parallel workers vs one worker, or local files vs S3. Example no: `SKILL.md` says "do not ask for approval" or "use 4–6 chapters".
  - **Litmus:** if the serious alternative would require changing code paths, storage, services, deployment, runtime cost, reliability, privacy, or speed, it may be a tradeoff. If the serious alternative mainly changes taste, copy, pedagogy, or review workflow, keep it `routine` and explain it in `impact` or `how`.

**`tradeoff`**: `a` = what was chosen, `b` = the serious alternative, `cost` = what the owner pays for the choice, `when` = the concrete signal that means it's time to switch ("when rows pass 100M, move to BigQuery"). `when` is an action trigger, not a vague "if you scale".

**`code`**: 3–8 lines copied from the real source (trim, don't paraphrase) that ARE the component — the timer line of the scheduler, the primary key of the table. One note per block (not per line), plain language. `risk` is non-null only for blocks whose lines call external APIs, write to storage, or are hard to reverse — and it must state the consequence: "this line spends your API quota", "changing this table is the hardest thing in the project to undo". If the part is configured rather than coded (a BI tool, a hosted service), `code` is `null`.

**`project.scenario` and `project.pain` come from the README or explicit user input ONLY.** If both are absent, ask the user exactly one question: **"Who is this app for and what problem does it solve?"** If they skip it, leave both fields `""`. **Never invent business context.** It is the one section the owner can personally verify, and fabricating it poisons trust in everything else. `project.now` (what the app does today) may be derived from the code.

**`tourHint`**: one line per node for the guided tour, formatted like "Stop N · <the one thing to remember about this part>".

## Lane rules

- `fe`: what the user sees and touches (web UI, mobile screens, BI dashboards someone looks at)
- `be`: logic that runs on a machine the user never sees
- `db`: anything that stores or holds data — databases, caches, object storage, and **cloud services generally**

Every node in `chain` must exist in `nodes`; `needs`/`feeds` must reference existing ids and be consistent with the chain's direction.

## Procedure

1. Read scan-result.json, the README head, and the candidate files. Follow the data: where does it enter, what transforms it, where does it rest, who reads it?
2. Decide the 5–15 parts and the chain order. Assign lanes and grades.
3. Write the content, rules above. Write `code` blocks by copying real lines from source.
4. Run `validate-schema.mjs` on your output. If it fails, fix using the error messages and re-emit **once**. If it fails again, stop and report the errors readably — never deliver a broken file.
