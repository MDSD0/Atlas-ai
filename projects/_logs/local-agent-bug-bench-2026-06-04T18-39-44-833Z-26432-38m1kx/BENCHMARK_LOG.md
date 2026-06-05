# Atlas Local-Agent Bug Bench

- run_id: 2026-06-04T18-39-44-833Z-26432-38m1kx
- model: openai/gpt-4.1-mini
- provider: openrouter
- base_url: https://openrouter.ai/api/v1
- execute_raw_json: false
- max_tokens: 900
- max_turns: 8
- request_timeout_ms: 120000
- key_env_names: key1, key2, key3, key4, key5, key6, key7
- task_offset: 0
- task_limit: 1
- projects_root: C:\Users\name\Downloads\Atlas-ai\projects
- report_dir: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-39-44-833Z-26432-38m1kx

## Summary

- tasks: 1
- passed: 1
- failed: 0
- tasks_with_strict_tool_calls: 1
- tasks_with_raw_json_tool_calls: 0
- total_tokens: 7941
- prompt_tokens: 6048
- completion_tokens: 1893
- duration_ms_total: 24404

## Findings By Project

### project1: frontend-calculator-create

- project: C:\Users\name\Downloads\Atlas-ai\projects\project1
- passed: true
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 24404
- total_tokens: 7941
- prompt_tokens: 6048
- completion_tokens: 1893
- source: Build a simple scientific calculator in index.html, style.css, and script.js. Include sin, cos, tan, log, sqrt, power, memory buttons, keyboard input, and a clear display.
- observed: malformed tool arguments
- check: `test -s index.html && test -s script.js` -> exit=0 timed_out=false
- final_excerpt: "I have created a simple scientific calculator with the following features:\n- HTML (index.html) with buttons for digits, operators, sin, cos, tan, log, sqrt, power, memory functions, and clear.\n- CSS (style.css) for styling the calculator wi"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-39-44-833Z-26432-38m1kx\project1.json

