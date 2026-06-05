# Atlas Local-Agent Bug Bench

- run_id: 2026-06-04T18-34-47-310Z-32432-17ffcc
- model: google/gemini-3.5-flash
- provider: openrouter
- base_url: https://openrouter.ai/api/v1
- execute_raw_json: false
- max_tokens: 650
- max_turns: 8
- request_timeout_ms: 120000
- key_env_names: key1, key2, key3, key4, key5, key6, key7
- task_offset: 8
- task_limit: 1
- projects_root: C:\Users\name\Downloads\Atlas-ai\projects
- report_dir: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-34-47-310Z-32432-17ffcc

## Summary

- tasks: 1
- passed: 0
- failed: 1
- tasks_with_strict_tool_calls: 1
- tasks_with_raw_json_tool_calls: 0
- total_tokens: 3203
- prompt_tokens: 2556
- completion_tokens: 647
- duration_ms_total: 9454

## Findings By Project

### project9: todo-churn-observation

- project: C:\Users\name\Downloads\Atlas-ai\projects\project9
- passed: false
- strict_tool_calls: 3
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 9454
- total_tokens: 3203
- prompt_tokens: 2556
- completion_tokens: 647
- source: Make the one-line change in note.md. This is intentionally simple; do not create a plan.
- observed: task check failed
- check: `grep -q 'status: done' note.md` -> exit=1 timed_out=false
- final_excerpt: "I have successfully made the one-line change in `note.md`, updating the status from `draft` to `complete`."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-34-47-310Z-32432-17ffcc\project9.json

