# Atlas Local-Agent Bug Bench

- run_id: 2026-06-04T18-45-30-960Z-30908-q20nxb
- model: qwen2.5-coder:7b
- provider: ollama
- base_url: http://localhost:11434/v1
- execute_raw_json: false
- max_tokens: 650
- max_turns: 6
- request_timeout_ms: 120000
- key_env_names: none
- task_offset: 0
- task_limit: 12
- projects_root: C:\Users\name\Downloads\Atlas-ai\projects
- report_dir: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb

## Summary

- tasks: 12
- passed: 1
- failed: 11
- tasks_with_strict_tool_calls: 0
- tasks_with_raw_json_tool_calls: 12
- total_tokens: 7607
- prompt_tokens: 7350
- completion_tokens: 257
- duration_ms_total: 14903

## Findings By Project

### project1: frontend-calculator-create

- project: C:\Users\name\Downloads\Atlas-ai\projects\project1
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 6962
- total_tokens: 651
- prompt_tokens: 635
- completion_tokens: 16
- source: Build a simple scientific calculator in index.html, style.css, and script.js. Include sin, cos, tan, log, sqrt, power, memory buttons, keyboard input, and a clear display.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted; task check failed
- check: `test -s index.html && test -s script.js` -> exit=1 timed_out=false
- final_excerpt: "{\"name\": \"list_directory\", \"arguments\": {\"path\": \"\"}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project1.json

### project2: js-failing-test-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project2
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 704
- total_tokens: 625
- prompt_tokens: 606
- completion_tokens: 19
- source: Fix the failing JS test without changing the test file.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted; task check failed
- check: `node math.test.mjs` -> exit=1 timed_out=false
- final_excerpt: "{\"name\": \"read_file\", \"arguments\": {\"path\": \"tests/test.js\"}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project2.json

### project3: python-edge-case-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project3
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 714
- total_tokens: 627
- prompt_tokens: 608
- completion_tokens: 19
- source: Fix slugify.py so the test passes. Keep it simple.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted; task check failed
- check: `C:/Users/name/AppData/Local/Programs/Python/Python314/python.exe test_slugify.py` -> exit=1 timed_out=false
- final_excerpt: "{\"name\": \"read_file\", \"arguments\": {\"path\": \"slugify.py\"}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project3.json

### project4: read-before-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project4
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 659
- total_tokens: 629
- prompt_tokens: 610
- completion_tokens: 19
- source: Change the greeting to say hello to Atlas. Inspect the file first.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted; task check failed
- check: `grep -q Atlas app.txt` -> exit=1 timed_out=false
- final_excerpt: "{\"name\": \"read_file\", \"arguments\": {\"path\": \"greeting.txt\"}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project4.json

### project5: avoid-foreground-server

- project: C:\Users\name\Downloads\Atlas-ai\projects\project5
- passed: true
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 1081
- total_tokens: 654
- prompt_tokens: 613
- completion_tokens: 41
- source: Run this tiny web app so I can preview it. Do not hang the foreground command.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted
- check: `test -f index.html` -> exit=0 timed_out=false
- final_excerpt: "{\"name\": \"serve_preview\", \"arguments\": {\"command\": \"npm start\", \"url\": \"http://localhost:3000\", \"wait_ms\": 1000}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project5.json

### project6: multi-file-import-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project6
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 679
- total_tokens: 626
- prompt_tokens: 607
- completion_tokens: 19
- source: Fix the import bug so node main.mjs prints ok.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted; task check failed
- check: `node main.mjs` -> exit=1 timed_out=false
- final_excerpt: "{\"name\": \"read_file\", \"arguments\": {\"path\": \"main.mjs\"}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project6.json

### project7: css-responsive-polish

- project: C:\Users\name\Downloads\Atlas-ai\projects\project7
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 618
- total_tokens: 628
- prompt_tokens: 610
- completion_tokens: 18
- source: Improve the CSS so the button text does not overflow on narrow screens.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted; task check failed
- check: `grep -q overflow-wrap style.css || grep -q word-break style.css` -> exit=1 timed_out=false
- final_excerpt: "{\"name\": \"read_file\", \"arguments\": {\"path\": \"styles.css\"}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project7.json

### project8: json-config-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project8
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 654
- total_tokens: 632
- prompt_tokens: 614
- completion_tokens: 18
- source: Update config.json to enable localModel and set maxSteps to 8. Preserve valid JSON.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted; task check failed
- check: `node -e "const c=require('./config.json'); if(!c.localModel||c.maxSteps!==8) process.exit(1)"` -> exit=1 timed_out=false
- final_excerpt: "{\"name\": \"read_file\", \"arguments\": {\"path\": \"config.json\"}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project8.json

### project9: todo-churn-observation

- project: C:\Users\name\Downloads\Atlas-ai\projects\project9
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 612
- total_tokens: 640
- prompt_tokens: 622
- completion_tokens: 18
- source: Make the one-line change in note.md: change status from draft to done. This is intentionally simple; do not create a plan.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted; task check failed
- check: `grep -q 'status: done' note.md` -> exit=1 timed_out=false
- final_excerpt: "{\"name\": \"read_file\", \"arguments\": {\"path\": \"note.md\"}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project9.json

### project10: verification-honesty

- project: C:\Users\name\Downloads\Atlas-ai\projects\project10
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 642
- total_tokens: 626
- prompt_tokens: 610
- completion_tokens: 16
- source: Fix the bug and verify it with the provided test before claiming success.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted; task check failed
- check: `C:/Users/name/AppData/Local/Programs/Python/Python314/python.exe test_is_even.py` -> exit=1 timed_out=false
- final_excerpt: "{\"name\": \"list_directory\", \"arguments\": {\"path\": \"\"}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project10.json

### project11: path-resolution-active-folder

- project: C:\Users\name\Downloads\Atlas-ai\projects\project11
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 959
- total_tokens: 645
- prompt_tokens: 609
- completion_tokens: 36
- source: Create README.md for this project with a one-sentence description.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted; task check failed
- check: `test -f README.md` -> exit=1 timed_out=false
- final_excerpt: "{\"name\": \"write_file\", \"arguments\": {\"path\": \"README.md\", \"content\": \"# Project 11\\nA local-first project for Atlas AI.\"}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project11.json

### project12: malformed-existing-html

- project: C:\Users\name\Downloads\Atlas-ai\projects\project12
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 1
- todo_writes: 0
- duration_ms: 619
- total_tokens: 624
- prompt_tokens: 606
- completion_tokens: 18
- source: Fix the malformed HTML and keep the existing text.
- observed: raw JSON tool call emitted in assistant content; strict tool harness would not execute; no OpenAI tool_calls emitted; task check failed
- check: `grep -q '</h1>' index.html && grep -q '</p>' index.html` -> exit=1 timed_out=false
- final_excerpt: "{\"name\": \"read_file\", \"arguments\": {\"path\": \"index.html\"}}"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb\project12.json

