#!/usr/bin/env bash
# Claude Code + Gemini co-work loop
#
# Usage (Claude Code runs this after creating a PR):
#   ./cowork.sh <pr-number> [max-iterations]
#
# Flow:
#   1. Wait for Gemini review comment
#   2. If APPROVE  → done (GitHub Action already merged)
#   3. If REQUEST_CHANGES → print issues for Claude Code to address → exit 2
#      (Claude Code reads output, pushes fix, then runs cowork.sh again)

set -euo pipefail

PR_NUM="${1:?Usage: $0 <pr-number> [max-iterations]}"
MAX_ITER="${2:-5}"
POLL_INTERVAL=20   # seconds between polls
POLL_MAX=30        # max polls per iteration (~10 min)

echo "🤝 Claude Code × Gemini co-work started"
echo "   PR #$PR_NUM  |  max $MAX_ITER fix iterations"
echo

for ITER in $(seq 1 "$MAX_ITER"); do
  echo "── Iteration $ITER/$MAX_ITER ──────────────────────────────"

  # Check if already merged
  STATE=$(gh pr view "$PR_NUM" --json state --jq '.state')
  if [ "$STATE" = "MERGED" ]; then
    echo "✅ PR #$PR_NUM merged. Done."
    exit 0
  fi
  if [ "$STATE" = "CLOSED" ]; then
    echo "PR #$PR_NUM was closed." >&2
    exit 1
  fi

  echo "⏳ Waiting for Gemini review..."

  # Poll for Gemini verdict comment
  VERDICT=""
  REVIEW_BODY=""
  for _ in $(seq 1 "$POLL_MAX"); do
    sleep "$POLL_INTERVAL"

    # Re-check merge state
    STATE=$(gh pr view "$PR_NUM" --json state --jq '.state')
    if [ "$STATE" = "MERGED" ]; then
      echo "✅ PR #$PR_NUM merged. Done."
      exit 0
    fi

    # Look for the verdict marker in the latest bot comment
    REVIEW_BODY=$(gh pr view "$PR_NUM" --json comments \
      --jq '[.comments[] | select(.author.login == "github-actions[bot]") | .body] | last // ""')

    if echo "$REVIEW_BODY" | grep -q "<!-- gemini-verdict:"; then
      VERDICT=$(echo "$REVIEW_BODY" | grep -o '<!-- gemini-verdict: [A-Z_]* -->' | grep -o '[A-Z_]*' | head -1)
      break
    fi
  done

  if [ -z "$VERDICT" ]; then
    echo "⚠️  No Gemini review received after $((POLL_MAX * POLL_INTERVAL))s." >&2
    echo "   Trigger manually: gh workflow run ai-pr-review.yml -f pr_number=$PR_NUM" >&2
    exit 1
  fi

  echo "Gemini verdict: $VERDICT"
  echo

  if [ "$VERDICT" = "APPROVE" ]; then
    echo "✅ Gemini approved — auto-merge triggered by GitHub Action"
    # Wait briefly for the merge to complete
    sleep 10
    STATE=$(gh pr view "$PR_NUM" --json state --jq '.state')
    if [ "$STATE" = "MERGED" ]; then
      echo "✅ PR #$PR_NUM merged. Done."
    else
      echo "Merge may still be processing. Check: gh pr view $PR_NUM"
    fi
    exit 0
  fi

  # REQUEST_CHANGES: print review for Claude Code to read and fix
  echo "🔄 Gemini requested changes:"
  echo "────────────────────────────"
  echo "$REVIEW_BODY" | sed 's/<!-- gemini-verdict:.*//'
  echo "────────────────────────────"
  echo
  echo "COWORK_ACTION: fix-and-push"
  echo "Claude Code: read the review above, fix the issues, then git push."
  echo "After pushing, run: $0 $PR_NUM $((MAX_ITER - ITER))"
  echo

  # Exit with code 2 = Claude Code needs to fix and re-run
  exit 2
done

echo "Max iterations ($MAX_ITER) reached without merge." >&2
exit 1
