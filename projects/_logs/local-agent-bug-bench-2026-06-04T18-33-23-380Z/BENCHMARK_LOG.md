# Atlas Local-Agent Bug Bench

- run_id: 2026-06-04T18-33-23-380Z
- model: google/gemini-3.5-flash
- provider: openrouter
- base_url: https://openrouter.ai/api/v1
- execute_raw_json: false
- max_tokens: 650
- max_turns: 8
- request_timeout_ms: 120000
- key_env_names: key1, key2, key3, key4, key5, key6, key7
- task_offset: 0
- task_limit: 1
- projects_root: C:\Users\name\Downloads\Atlas-ai\projects
- report_dir: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-33-23-380Z

## Summary

- tasks: 1
- passed: 0
- failed: 1
- tasks_with_strict_tool_calls: 1
- tasks_with_raw_json_tool_calls: 0
- total_tokens: 2318
- prompt_tokens: 1558
- completion_tokens: 760
- duration_ms_total: 13354

## Findings By Project

### project1: frontend-calculator-create

- project: C:\Users\name\Downloads\Atlas-ai\projects\project1
- passed: false
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 13354
- total_tokens: 2318
- prompt_tokens: 1558
- completion_tokens: 760
- source: Build a simple scientific calculator in index.html, style.css, and script.js. Include sin, cos, tan, log, sqrt, power, memory buttons, keyboard input, and a clear display.
- observed: task check failed
- check: `test -s index.html && test -s script.js` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-33-23-380Z\project1.json

