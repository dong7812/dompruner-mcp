#!/usr/bin/env bash
# Usage: ./setup.sh <owner/repo>
# Example: ./setup.sh dong7812/my-project
#
# What this does:
#   1. Registers GEMINI_API_KEY as a GitHub Secret
#   2. Uploads GitHub Actions workflow (Gemini review + auto-merge)
#   3. Uploads cowork.sh (Claude Code monitoring loop)
#   4. Creates AGENTS.md (review standards)
#   5. Injects PR workflow rules into CLAUDE.md
#
# After setup, just say "PR 올려줘" to Claude Code — it handles everything.

set -euo pipefail

REPO="${1:?Usage: $0 <owner/repo>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Preflight checks ──────────────────────────────────────────────────────────

command -v gh &>/dev/null || { echo "Error: gh CLI not found. Install: https://cli.github.com" >&2; exit 1; }
gh auth status &>/dev/null || { echo "Error: not logged in. Run: gh auth login" >&2; exit 1; }
gh api "repos/$REPO" --silent 2>/dev/null || { echo "Error: repo '$REPO' not found or no access." >&2; exit 1; }

# ── Gemini API key ────────────────────────────────────────────────────────────

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo -n "Gemini API Key (from aistudio.google.com): "
  read -rs GEMINI_API_KEY
  echo
fi
[ -n "$GEMINI_API_KEY" ] || { echo "Error: GEMINI_API_KEY is required." >&2; exit 1; }

echo "Setting up AI PR Review for: $REPO"
echo

# ── Helper: upload a file to GitHub via Contents API ─────────────────────────

upload_file() {
  local remote_path="$1"
  local local_file="$2"
  local commit_msg="$3"

  local content
  content=$(base64 < "$local_file")

  local existing_sha
  existing_sha=$(gh api "repos/$REPO/contents/$remote_path" --jq '.sha' 2>/dev/null || true)

  if [ -n "$existing_sha" ]; then
    gh api --method PUT "repos/$REPO/contents/$remote_path" \
      --field message="$commit_msg (update)" \
      --field content="$content" \
      --field sha="$existing_sha" \
      --silent
    echo "   Updated: $remote_path"
  else
    gh api --method PUT "repos/$REPO/contents/$remote_path" \
      --field message="$commit_msg" \
      --field content="$content" \
      --silent
    echo "   Created: $remote_path"
  fi
}

# ── 1. GitHub Secret ──────────────────────────────────────────────────────────

echo "→ [1/5] Registering GEMINI_API_KEY secret..."
gh secret set GEMINI_API_KEY --repo "$REPO" --body "$GEMINI_API_KEY"
echo "   Done."

# ── 2. GitHub Actions workflow ────────────────────────────────────────────────

echo "→ [2/5] Uploading GitHub Actions workflow..."
upload_file ".github/workflows/ai-pr-review.yml" \
  "$SCRIPT_DIR/workflow.yml" \
  "ci: add AI PR review workflow (Gemini + auto-merge)"

# ── 3. cowork.sh ──────────────────────────────────────────────────────────────

echo "→ [3/5] Uploading cowork.sh..."
upload_file ".github/scripts/cowork.sh" \
  "$SCRIPT_DIR/cowork.sh" \
  "ci: add Claude×Gemini co-work monitoring script"

# Make it executable via a commit (GitHub doesn't set mode via API, so we patch it)
gh api --method PATCH "repos/$REPO/contents/.github/scripts/cowork.sh" \
  --field executable=true \
  --silent 2>/dev/null || true

# ── 4. AGENTS.md ─────────────────────────────────────────────────────────────

echo "→ [4/5] Checking AGENTS.md..."
if gh api "repos/$REPO/contents/AGENTS.md" --silent 2>/dev/null; then
  echo "   Already exists — skipping."
else
  upload_file "AGENTS.md" \
    "$SCRIPT_DIR/AGENTS.md.template" \
    "docs: add AI review standards (AGENTS.md)"
fi

# ── 5. CLAUDE.md — inject PR workflow rules ───────────────────────────────────

echo "→ [5/5] Updating CLAUDE.md with PR workflow rules..."

SNIPPET=$(cat "$SCRIPT_DIR/CLAUDE.md.snippet")
MARKER="## PR 워크플로우 — Claude × Gemini 자동 리뷰"

# Fetch existing CLAUDE.md if present
EXISTING_SHA=$(gh api "repos/$REPO/contents/CLAUDE.md" --jq '.sha' 2>/dev/null || true)
EXISTING_CONTENT=""
if [ -n "$EXISTING_SHA" ]; then
  EXISTING_CONTENT=$(gh api "repos/$REPO/contents/CLAUDE.md" --jq '.content' | base64 -d)
fi

# Only inject if the marker is not already there
if echo "$EXISTING_CONTENT" | grep -qF "$MARKER"; then
  echo "   Already injected — skipping."
else
  NEW_CONTENT="${EXISTING_CONTENT}

${SNIPPET}"

  printf '%s' "$NEW_CONTENT" > /tmp/_claude_md_tmp.md
  upload_file "CLAUDE.md" \
    /tmp/_claude_md_tmp.md \
    "docs: inject Claude×Gemini PR workflow rules into CLAUDE.md"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

echo
echo "✅ Setup complete for $REPO"
echo
echo "Usage:"
echo "  Open this repo in Claude Code and say \"PR 올려줘\""
echo "  Claude Code will write code → open PR → co-work with Gemini → auto-merge"
