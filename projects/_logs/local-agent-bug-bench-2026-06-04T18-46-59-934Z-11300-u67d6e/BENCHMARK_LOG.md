# Atlas Local-Agent Bug Bench

- run_id: 2026-06-04T18-46-59-934Z-11300-u67d6e
- model: llama-3.3-70b-versatile
- provider: groq
- base_url: https://api.groq.com/openai/v1
- execute_raw_json: false
- max_tokens: 650
- max_turns: 6
- request_timeout_ms: 120000
- key_env_names: gq1, gq2, gq3, gq4, gq5, gq6, gq7, gq8
- task_offset: 1
- task_limit: 1
- projects_root: C:\Users\name\Downloads\Atlas-ai\projects
- report_dir: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-46-59-934Z-11300-u67d6e

## Summary

- tasks: 1
- passed: 1
- failed: 0
- tasks_with_strict_tool_calls: 1
- tasks_with_raw_json_tool_calls: 0
- total_tokens: 4415
- prompt_tokens: 4147
- completion_tokens: 268
- duration_ms_total: 3505

## Findings By Project

### project2: js-failing-test-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project2
- passed: true
- strict_tool_calls: 7
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 3505
- total_tokens: 4415
- prompt_tokens: 4147
- completion_tokens: 268
- source: Fix the failing JS test without changing the test file.
- observed: no anomaly recorded
- check: `node math.test.mjs` -> exit=0 timed_out=false
- final_excerpt: "The failing JS test has been fixed by changing the `add` function in `math.js` to correctly add numbers instead of concatenating strings."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-46-59-934Z-11300-u67d6e\project2.json

