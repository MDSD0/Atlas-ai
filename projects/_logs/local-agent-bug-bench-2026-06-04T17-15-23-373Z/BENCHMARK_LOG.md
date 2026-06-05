# Atlas Local-Agent Bug Bench

- run_id: 2026-06-04T17-15-23-373Z
- model: gpt-4.1-mini
- provider: openai
- base_url: https://api.openai.com/v1
- execute_raw_json: false
- projects_root: C:\Users\name\Downloads\Atlas-ai\projects
- report_dir: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z

## Summary

- tasks: 12
- passed: 1
- failed: 11
- tasks_with_strict_tool_calls: 0
- tasks_with_raw_json_tool_calls: 0

## Findings By Project

### project1: frontend-calculator-create

- project: C:\Users\name\Downloads\Atlas-ai\projects\project1
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1914
- source: Build a simple scientific calculator in index.html, style.css, and script.js. Include sin, cos, tan, log, sqrt, power, memory buttons, keyboard input, and a clear display.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `test -s index.html && test -s script.js` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project1.json

### project2: js-failing-test-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project2
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 658
- source: Fix the failing JS test without changing the test file.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `node math.test.mjs` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project2.json

### project3: python-edge-case-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project3
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 508
- source: Fix slugify.py so the test passes. Keep it simple.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `python test_slugify.py` -> exit=127 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project3.json

### project4: read-before-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project4
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 512
- source: Change the greeting to say hello to Atlas. Inspect the file first.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `grep -q Atlas app.txt` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project4.json

### project5: avoid-foreground-server

- project: C:\Users\name\Downloads\Atlas-ai\projects\project5
- passed: true
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 520
- source: Run this tiny web app so I can preview it. Do not hang the foreground command.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; provider error
- check: `test -f index.html` -> exit=0 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project5.json

### project6: multi-file-import-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project6
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 515
- source: Fix the import bug so node main.mjs prints ok.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `node main.mjs` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project6.json

### project7: css-responsive-polish

- project: C:\Users\name\Downloads\Atlas-ai\projects\project7
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 385
- source: Improve the CSS so the button text does not overflow on narrow screens.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `grep -q overflow-wrap style.css || grep -q word-break style.css` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project7.json

### project8: json-config-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project8
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 396
- source: Update config.json to enable localModel and set maxSteps to 8. Preserve valid JSON.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `node -e "const c=require('./config.json'); if(!c.localModel||c.maxSteps!==8) process.exit(1)"` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project8.json

### project9: todo-churn-observation

- project: C:\Users\name\Downloads\Atlas-ai\projects\project9
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 352
- source: Make the one-line change in note.md. This is intentionally simple; do not create a plan.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `grep -q 'status: done' note.md` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project9.json

### project10: verification-honesty

- project: C:\Users\name\Downloads\Atlas-ai\projects\project10
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 428
- source: Fix the bug and verify it with the provided test before claiming success.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `python test_is_even.py` -> exit=127 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project10.json

### project11: path-resolution-active-folder

- project: C:\Users\name\Downloads\Atlas-ai\projects\project11
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 480
- source: Create README.md for this project with a one-sentence description.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `test -f README.md` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project11.json

### project12: malformed-existing-html

- project: C:\Users\name\Downloads\Atlas-ai\projects\project12
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 492
- source: Fix the malformed HTML and keep the existing text.
- provider_error: "Error: 429 {\n    \"error\": {\n        \"message\": \"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.\",\n        \"type\": \"insufficient_quota\",\n        \"param\": null,\n        \"code\": \"insufficient_quota\"\n    }\n}\n"
- observed: no OpenAI tool_calls emitted; task check failed; provider error
- check: `grep -q '</h1>' index.html && grep -q '</p>' index.html` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T17-15-23-373Z\project12.json

