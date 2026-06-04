# CLAUDE.md

Primary architecture doc: `ATLAS.md`. Roadmap: `ATLAS_EXECUTION_PLAN.md`. Read those before non-trivial work.

## Behavioral rules

These bias toward caution over speed. Use judgment on trivial tasks.

### 1. Think before coding

- State assumptions. If uncertain, ask.
- Multiple interpretations → present them, don't pick silently.
- Simpler approach exists → say so. Push back when warranted.
- Unclear → stop, name what's confusing, ask.

### 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" not requested.
- No error handling for impossible scenarios.
- 200 lines that could be 50 → rewrite.

Test: "Would a senior engineer call this overcomplicated?" If yes, simplify.

### 3. Surgical changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor working code.
- Match existing style, even if you'd do it differently.
- Note unrelated dead code, don't delete it.
- Remove imports/vars/functions YOUR change orphaned. Leave pre-existing dead code.

Test: every changed line traces directly to the user's request.

### 4. Goal-driven execution

Define success criteria. Loop until verified.

- "Add validation" → "Write tests for invalid inputs, make them pass."
- "Fix bug" → "Write test that reproduces, make it pass."
- "Refactor X" → "Tests pass before and after."

For multi-step tasks, state a brief plan with verify steps:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

## Atlas-specific

- Lean, minimal code. No frameworks unless the active slice requires them.
- Source-parity hook (`scripts/consult-opensrc.sh`) before non-trivial subsystems. Tiny fixes skip it.
- Native-auth, fail-closed binding, stale-edit rejection, same-file serialization are merge-blockers.
- Repo truth > memory. Always.
- Receipts > model prose. A "done" claim without a receipt is not done.
- Don't build VS Code. Build the minimum agentic-IDE affordances: diff review, accept/reject, dirty/save, diagnostics, changed files, proof panel.
- Don't index the whole 12 GB workspace. Index source reality, show what was skipped.
