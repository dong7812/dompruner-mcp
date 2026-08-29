# AGENTS.md — AI PR Review Standards

## Must Check (🔴 Critical blockers)
- Unhandled Promise / async-await errors
- Missing input validation at system boundaries
- Hardcoded secrets, tokens, or credentials
- SQL injection / XSS / command injection risks
- Off-by-one errors in loops or array access

## Suggestions (🟡 Non-blocking)
- Functions longer than 50 lines — consider splitting
- Magic numbers without named constants
- Missing error messages that help users understand what went wrong
- Duplicate logic that could be extracted into a helper

## Out of Scope (skip these)
- Code formatting (handled by linter/formatter)
- Import ordering
- Stylistic preferences already established in the codebase
