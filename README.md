# Understand Everything

Turn any vibe-coded project into an interactive plain-language diagram. Every part of the app, organized as **Frontend / Backend / Database**, explained in words the owner can repeat to a friend: what it does, why it was chosen, what the tradeoff was — bilingual (English / 中文), switchable instantly.

No API keys, no hosted service: the analysis runs inside the AI coding agent you already use; the dashboard runs locally in your browser.

## Install

### Claude Code

```
/plugin marketplace add Jia0612/understand-everything-for-beginners
/plugin install understand-everything
```

Then, inside any project: `/explain-my-app` — it scans the project, writes the plain-language map to `.ue/app-map.json`, validates it, and opens the dashboard.

### OpenAI Codex / Gemini CLI / OpenCode

```bash
curl -fsSL https://raw.githubusercontent.com/Jia0612/understand-everything-for-beginners/main/install.sh | bash -s codex
```

Restart your CLI, then invoke with `$explain-my-app` (Codex uses `$` instead of `/`), or just ask: "use the explain-my-app skill".

### VS Code + GitHub Copilot

Auto-discovered via `.copilot-plugin/plugin.json` when this repo is cloned and opened. For personal (all-projects) install: `./install.sh vscode`.

### View an existing map

In any project that already has `.ue/app-map.json`:

```bash
npx understand-everything
```

## 中文速览

把 vibe code 出来的项目变成一张能点的「人话地图」:每个零件讲清它干什么、为什么选它、代价是什么、什么时候该换。分析由你已在用的 AI 编程工具完成,不烧额外 API。装好后在项目里说一句 `/explain-my-app`(Codex 里是 `$explain-my-app`)即可。

## Repo layout

- `plugin/` — the skill: deterministic scanner, generation ruleset, schema gate
- `packages/core` — the app-map.json contract (zod)
- `packages/dashboard` — the local dashboard (React + Vite)
- `cli/` — `npx understand-everything`, a zero-config local server
- `adapters/` — notes for non-Claude agents
- `docs/` — approved prototype + example maps

Skeleton and multi-platform packaging follow [Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) (MIT). License: MIT.
