#!/usr/bin/env bash
# Usage: ./setup.sh <owner/repo>
# Example: ./setup.sh dong7812/my-project
#
# What this does:
#   1. Registers GEMINI_API_KEY as a GitHub Secret
#   2. Registers GOOGLE_SA_JSON + GOOGLE_SHEET_ID (optional, for review log)
#   3. Uploads GitHub Actions workflow (Gemini review + auto-merge + Sheets log)
#   4. Uploads cowork.sh (Claude Code monitoring loop)
#   5. Creates AGENTS.md (review standards)
#   6. Injects PR workflow rules into CLAUDE.md
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

# ── Google Sheets 로그 (선택) ─────────────────────────────────────────────────

echo
echo "Google Sheets 리뷰 로그 설정 (선택 사항)"
echo "  건너뛰려면 Enter를 누르세요."
echo

if [ -z "${GOOGLE_SA_JSON:-}" ]; then
  echo -n "Google Service Account JSON 파일 경로 (없으면 Enter): "
  read -r SA_JSON_PATH
  if [ -n "$SA_JSON_PATH" ] && [ -f "$SA_JSON_PATH" ]; then
    GOOGLE_SA_JSON=$(cat "$SA_JSON_PATH")
  fi
fi

if [ -z "${GOOGLE_SHEET_ID:-}" ] && [ -n "${GOOGLE_SA_JSON:-}" ]; then
  echo -n "Google Sheet ID (URL의 /d/ 뒤 문자열): "
  read -r GOOGLE_SHEET_ID
fi

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

# ── 1. GitHub Secrets ─────────────────────────────────────────────────────────

echo "→ [1/6] Registering secrets..."
gh secret set GEMINI_API_KEY --repo "$REPO" --body "$GEMINI_API_KEY"
echo "   GEMINI_API_KEY registered."

if [ -n "${GOOGLE_SA_JSON:-}" ]; then
  gh secret set GOOGLE_SA_JSON --repo "$REPO" --body "$GOOGLE_SA_JSON"
  echo "   GOOGLE_SA_JSON registered."
fi

if [ -n "${GOOGLE_SHEET_ID:-}" ]; then
  gh secret set GOOGLE_SHEET_ID --repo "$REPO" --body "$GOOGLE_SHEET_ID"
  echo "   GOOGLE_SHEET_ID registered."
fi

if [ -z "${GOOGLE_SA_JSON:-}" ]; then
  echo "   Google Sheets 로그 건너뜀 (선택 사항)."
fi

# ── 2. GitHub Actions workflow ────────────────────────────────────────────────

echo "→ [2/6] Uploading GitHub Actions workflow..."
upload_file ".github/workflows/ai-pr-review.yml" \
  "$SCRIPT_DIR/workflow.yml" \
  "ci: add AI PR review workflow (Gemini + auto-merge + Sheets log)"

# ── 3. cowork.sh ──────────────────────────────────────────────────────────────

echo "→ [3/6] Uploading cowork.sh..."
upload_file ".github/scripts/cowork.sh" \
  "$SCRIPT_DIR/cowork.sh" \
  "ci: add Claude×Gemini co-work monitoring script"

# ── 4. AGENTS.md ─────────────────────────────────────────────────────────────

echo "→ [4/6] Checking AGENTS.md..."
if gh api "repos/$REPO/contents/AGENTS.md" --silent 2>/dev/null; then
  echo "   Already exists — skipping."
else
  upload_file "AGENTS.md" \
    "$SCRIPT_DIR/AGENTS.md.template" \
    "docs: add AI review standards (AGENTS.md)"
fi

# ── 5. CLAUDE.md — inject PR workflow rules ───────────────────────────────────

echo "→ [5/6] Updating CLAUDE.md with PR workflow rules..."

SNIPPET=$(cat "$SCRIPT_DIR/CLAUDE.md.snippet")
MARKER="## PR 워크플로우 — Claude × Gemini 자동 리뷰"

EXISTING_SHA=$(gh api "repos/$REPO/contents/CLAUDE.md" --jq '.sha' 2>/dev/null || true)
EXISTING_CONTENT=""
if [ -n "$EXISTING_SHA" ]; then
  EXISTING_CONTENT=$(gh api "repos/$REPO/contents/CLAUDE.md" --jq '.content' | base64 -d)
fi

if echo "$EXISTING_CONTENT" | grep -qF "$MARKER"; then
  echo "   Already injected — skipping."
else
  NEW_CONTENT="${EXISTING_CONTENT}

${SNIPPET}"
  printf '%s' "$NEW_CONTENT" > /tmp/_claude_md_tmp.md
  upload_file "CLAUDE.md" \
    /tmp/_claude_md_tmp.md \
    "docs: inject Claude×Gemini PR workflow rules into CLAUDE.md"
  rm -f /tmp/_claude_md_tmp.md
fi

# ── 6. Repo settings: allow auto-merge ───────────────────────────────────────

echo "→ [6/6] Enabling auto-merge on repo..."
gh api --method PATCH "repos/$REPO" \
  --field allow_auto_merge=true \
  --silent 2>/dev/null && echo "   auto-merge enabled." || echo "   (auto-merge 설정 권한 없음 — 수동으로 Settings → Allow auto-merge 활성화)"

# ── Done ──────────────────────────────────────────────────────────────────────

echo
echo "✅ Setup complete for $REPO"
echo
if [ -n "${GOOGLE_SHEET_ID:-}" ]; then
  echo "  PR 리뷰 로그: https://docs.google.com/spreadsheets/d/$GOOGLE_SHEET_ID"
fi
echo "  Claude Code에서 \"PR 올려줘\" 라고 하면 자동으로 진행됩니다."
