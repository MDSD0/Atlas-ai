
## Design note: smart plan replan (deferred, agent-loop)

User decision on comment-on-plan: do NOT blind-incorporate per-line comments
(users put comments anywhere / all in the header, so line attachment is
unreliable and would desync plan text from comments). Instead, smart replan:

- Collect all comments regardless of where they were placed.
- Preserve completed and in-progress plan items (never discard done work).
- Regenerate only the not-yet-started tail of the plan, with the comments as
  steering constraints, keeping stable item identity where possible.
- Show the user a plan-diff (kept items vs revised/new items) so the change is
  visible, not a silent regeneration.

Status: design only. Touches the agent loop + needs a textual-plan-with-comments
UI (todos are currently a flat list, no comment field). Build deliberately after
GUI verification; not part of the safe UI-polish batch.
