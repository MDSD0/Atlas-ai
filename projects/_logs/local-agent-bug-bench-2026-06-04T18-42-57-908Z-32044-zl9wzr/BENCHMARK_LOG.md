# Atlas Local-Agent Bug Bench

- run_id: 2026-06-04T18-42-57-908Z-32044-zl9wzr
- model: openai/gpt-4.1-mini
- provider: openrouter
- base_url: https://openrouter.ai/api/v1
- execute_raw_json: false
- max_tokens: 900
- max_turns: 8
- request_timeout_ms: 120000
- key_env_names: key1, key2, key3, key4, key5, key6, key7
- task_offset: 8
- task_limit: 1
- projects_root: C:\Users\name\Downloads\Atlas-ai\projects
- report_dir: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-42-57-908Z-32044-zl9wzr

## Summary

- tasks: 1
- passed: 1
- failed: 0
- tasks_with_strict_tool_calls: 1
- tasks_with_raw_json_tool_calls: 0
- total_tokens: 1998
- prompt_tokens: 1924
- completion_tokens: 74
- duration_ms_total: 5013

## Findings By Project

### project9: todo-churn-observation

- project: C:\Users\name\Downloads\Atlas-ai\projects\project9
- passed: true
- strict_tool_calls: 3
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 5013
- total_tokens: 1998
- prompt_tokens: 1924
- completion_tokens: 74
- source: Make the one-line change in note.md: change status from draft to done. This is intentionally simple; do not create a plan.
- observed: no anomaly recorded
- check: `grep -q 'status: done' note.md` -> exit=0 timed_out=false
- final_excerpt: "The status in note.md has been changed from draft to done."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-42-57-908Z-32044-zl9wzr\project9.json

