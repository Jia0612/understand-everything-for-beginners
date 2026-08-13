---
name: understand-everything-for-beginners
description: Turn a codebase into a bilingual, plain-language interactive system map for beginners and non-technical owners. Use when the user asks to understand, explain, map, or learn a local project or GitHub repository.
license: MIT
metadata:
  author: Jia0612
  version: "1.0"
---

# Understand Everything for Beginners

Create an interactive system map of the user's target project.

Requirements: Node.js 18+ and filesystem access. Remote repositories also require Git and network access.

Before doing any work, read `plugin/skills/explain-my-app/SKILL.md` completely and follow its pipeline. Resolve all paths in that file relative to `plugin/skills/explain-my-app/`.

Use platform-neutral equivalents for file reading, shell execution, browser opening, and user questions. If the current client cannot execute commands or write files, explain that limitation and give the user the local installation command from `README.md`.
