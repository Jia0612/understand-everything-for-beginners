#!/usr/bin/env bash
# Understand Everything installer (macOS / Linux) — for non-Claude agents.
# Claude Code users don't need this: use /plugin marketplace add instead.
#
# Usage:
#   ./install.sh <platform>            Install skills for <platform>
#   ./install.sh --uninstall <plat>    Remove the links for <plat>
#   ./install.sh --update              Pull the latest repo
#   ./install.sh --help
#
# Curl-pipe usage (after the repo is public):
#   curl -fsSL https://raw.githubusercontent.com/Jia0612/understand-everything-for-beginners/main/install.sh | bash -s codex
#
# Environment:
#   UE_REPO_URL  Override clone source (URL or local path)
#   UE_DIR       Override clone destination (default: $HOME/.understand-everything/repo)
#
# 结构参考 Understand-Anything (MIT) 的 install.sh,按本项目简化。

set -euo pipefail

REPO_URL="${UE_REPO_URL:-https://github.com/Jia0612/understand-everything-for-beginners.git}"
REPO_DIR="${UE_DIR:-$HOME/.understand-everything/repo}"
SKILL_NAME="explain-my-app"

# 平台表:平台名|技能目录(每个技能一个快捷方式链进去)
platforms_table() {
  cat <<EOF
codex|$HOME/.agents/skills
gemini|$HOME/.agents/skills
opencode|$HOME/.agents/skills
vscode|$HOME/.copilot/skills
copilot|$HOME/.copilot/skills
cursor|$HOME/.cursor/skills
EOF
}

platform_ids() { platforms_table | cut -d'|' -f1 | tr '\n' ' '; }

resolve_target() {
  local row
  row="$(platforms_table | awk -F'|' -v id="$1" '$1==id {print $2; exit}')"
  if [[ -z "$row" ]]; then
    printf 'Unknown platform: %s\nSupported: %s\n' "$1" "$(platform_ids)" >&2
    exit 1
  fi
  printf '%s\n' "$row"
}

ensure_repo() {
  if [[ -d "$REPO_DIR/.git" ]]; then
    return
  fi
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone --depth 1 "$REPO_URL" "$REPO_DIR"
}

install_for() {
  local target
  target="$(resolve_target "$1")"
  ensure_repo
  local skill_src="$REPO_DIR/plugin/skills/$SKILL_NAME"
  if [[ ! -f "$skill_src/SKILL.md" ]]; then
    printf 'install.sh: skill not found at %s\n' "$skill_src" >&2
    exit 1
  fi
  mkdir -p "$target"
  ln -sfn "$skill_src" "$target/$SKILL_NAME"
  printf 'Installed: %s -> %s\n' "$target/$SKILL_NAME" "$skill_src"
  printf 'Restart your CLI/IDE. Invoke with /%s ($%s on Codex), or just ask in plain language.\n' "$SKILL_NAME" "$SKILL_NAME"
}

uninstall_for() {
  local target
  target="$(resolve_target "$1")"
  rm -f "$target/$SKILL_NAME"
  printf 'Removed %s/%s (the cloned repo at %s is untouched)\n' "$target" "$SKILL_NAME" "$REPO_DIR"
}

case "${1:-}" in
  --help|'')
    sed -n '2,20p' "$0"; exit 0 ;;
  --update)
    ensure_repo; git -C "$REPO_DIR" pull --ff-only; exit 0 ;;
  --uninstall)
    [[ -n "${2:-}" ]] || { printf 'Usage: install.sh --uninstall <platform>\n' >&2; exit 1; }
    uninstall_for "$2" ;;
  *)
    install_for "$1" ;;
esac
