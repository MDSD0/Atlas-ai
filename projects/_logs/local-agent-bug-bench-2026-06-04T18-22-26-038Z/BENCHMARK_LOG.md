# Atlas Local-Agent Bug Bench

- run_id: 2026-06-04T18-22-26-038Z
- model: gemini-3.5-flash
- provider: gemini
- base_url: https://generativelanguage.googleapis.com/v1beta/openai
- execute_raw_json: false
- max_tokens: 650
- max_turns: 5
- request_timeout_ms: 90000
- key_env_names: g1, g2, g3, g4, g5
- task_offset: 0
- task_limit: 12
- projects_root: C:\Users\name\Downloads\Atlas-ai\projects
- report_dir: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z

## Summary

- tasks: 12
- passed: 3
- failed: 9
- tasks_with_strict_tool_calls: 6
- tasks_with_raw_json_tool_calls: 0
- total_tokens: 27586
- prompt_tokens: 23105
- completion_tokens: 756
- duration_ms_total: 59181

## Findings By Project

### project1: frontend-calculator-create

- project: C:\Users\name\Downloads\Atlas-ai\projects\project1
- passed: false
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 12179
- total_tokens: 4912
- prompt_tokens: 3480
- completion_tokens: 96
- source: Build a simple scientific calculator in index.html, style.css, and script.js. Include sin, cos, tan, log, sqrt, power, memory buttons, keyboard input, and a clear display.
- observed: task check failed
- check: `test -s index.html && test -s script.js` -> exit=1 timed_out=false
- final_excerpt: "` or `^`, it appends `^` or `^(`.\n- When you click `log`, it appends"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project1.json

### project2: js-failing-test-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project2
- passed: false
- strict_tool_calls: 5
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 7481
- total_tokens: 4133
- prompt_tokens: 3681
- completion_tokens: 224
- source: Fix the failing JS test without changing the test file.
- observed: task check failed
- check: `node math.test.mjs` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project2.json

### project3: python-edge-case-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project3
- passed: false
- strict_tool_calls: 6
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 9241
- total_tokens: 5410
- prompt_tokens: 4467
- completion_tokens: 121
- source: Fix slugify.py so the test passes. Keep it simple.
- observed: task check failed
- check: `python test_slugify.py` -> exit=127 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project3.json

### project4: read-before-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project4
- passed: true
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 7598
- total_tokens: 4093
- prompt_tokens: 3664
- completion_tokens: 118
- source: Change the greeting to say hello to Atlas. Inspect the file first.
- observed: no anomaly recorded
- check: `grep -q Atlas app.txt` -> exit=0 timed_out=false
- final_excerpt: "I have inspected the project directory and found the file `app.txt` containing the greeting `\"hello world\"`. I updated the content of `app.txt` to say `\"hello Atlas\"`."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project4.json

### project5: avoid-foreground-server

- project: C:\Users\name\Downloads\Atlas-ai\projects\project5
- passed: true
- strict_tool_calls: 5
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 8207
- total_tokens: 4356
- prompt_tokens: 3909
- completion_tokens: 89
- source: Run this tiny web app so I can preview it. Do not hang the foreground command.
- observed: no anomaly recorded
- check: `test -f index.html` -> exit=0 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project5.json

### project6: multi-file-import-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project6
- passed: true
- strict_tool_calls: 5
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 7803
- total_tokens: 4682
- prompt_tokens: 3904
- completion_tokens: 108
- source: Fix the import bug so node main.mjs prints ok.
- observed: no anomaly recorded
- check: `node main.mjs` -> exit=0 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project6.json

### project7: css-responsive-polish

- project: C:\Users\name\Downloads\Atlas-ai\projects\project7
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1100
- total_tokens: 0
- prompt_tokens: 0
- completion_tokens: 0
- source: Improve the CSS so the button text does not overflow on narrow screens.
- provider_error: "Error: 429 key=g1 [{\n  \"error\": {\n    \"code\": 429,\n    \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-3.5-flash\\nPlease retry in 39.588816961s.\",\n    \"status\": \"RESOURCE"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `grep -q overflow-wrap style.css || grep -q word-break style.css` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project7.json

### project8: json-config-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project8
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1044
- total_tokens: 0
- prompt_tokens: 0
- completion_tokens: 0
- source: Update config.json to enable localModel and set maxSteps to 8. Preserve valid JSON.
- provider_error: "Error: 429 key=g2 [{\n  \"error\": {\n    \"code\": 429,\n    \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-3.5-flash\\nPlease retry in 38.559010682s.\",\n    \"status\": \"RESOURCE"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `node -e "const c=require('./config.json'); if(!c.localModel||c.maxSteps!==8) process.exit(1)"` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project8.json

### project9: todo-churn-observation

- project: C:\Users\name\Downloads\Atlas-ai\projects\project9
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1014
- total_tokens: 0
- prompt_tokens: 0
- completion_tokens: 0
- source: Make the one-line change in note.md. This is intentionally simple; do not create a plan.
- provider_error: "Error: 429 key=g3 [{\n  \"error\": {\n    \"code\": 429,\n    \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-3.5-flash\\nPlease retry in 37.510784813s.\",\n    \"status\": \"RESOURCE"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `grep -q 'status: done' note.md` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project9.json

### project10: verification-honesty

- project: C:\Users\name\Downloads\Atlas-ai\projects\project10
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1274
- total_tokens: 0
- prompt_tokens: 0
- completion_tokens: 0
- source: Fix the bug and verify it with the provided test before claiming success.
- provider_error: "Error: 429 key=g4 [{\n  \"error\": {\n    \"code\": 429,\n    \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-3.5-flash\\nPlease retry in 36.225676043s.\",\n    \"status\": \"RESOURCE"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `python test_is_even.py` -> exit=127 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project10.json

### project11: path-resolution-active-folder

- project: C:\Users\name\Downloads\Atlas-ai\projects\project11
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1108
- total_tokens: 0
- prompt_tokens: 0
- completion_tokens: 0
- source: Create README.md for this project with a one-sentence description.
- provider_error: "Error: 429 key=g5 [{\n  \"error\": {\n    \"code\": 429,\n    \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-3.5-flash\\nPlease retry in 35.109895359s.\",\n    \"status\": \"RESOURCE"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `test -f README.md` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project11.json

### project12: malformed-existing-html

- project: C:\Users\name\Downloads\Atlas-ai\projects\project12
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1132
- total_tokens: 0
- prompt_tokens: 0
- completion_tokens: 0
- source: Fix the malformed HTML and keep the existing text.
- provider_error: "Error: 429 key=g1 [{\n  \"error\": {\n    \"code\": 429,\n    \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-3.5-flash\\nPlease retry in 33.999760293s.\",\n    \"status\": \"RESOURCE"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `grep -q '</h1>' index.html && grep -q '</p>' index.html` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-22-26-038Z\project12.json

