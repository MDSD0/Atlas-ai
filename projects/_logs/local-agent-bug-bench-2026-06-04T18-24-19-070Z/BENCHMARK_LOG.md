# Atlas Local-Agent Bug Bench

- run_id: 2026-06-04T18-24-19-070Z
- model: google/gemini-3.5-flash
- provider: openrouter
- base_url: https://openrouter.ai/api/v1
- execute_raw_json: false
- max_tokens: 650
- max_turns: 8
- request_timeout_ms: 120000
- key_env_names: key1, key2, key3, key4, key5, key6, key7
- task_offset: 0
- task_limit: 12
- projects_root: C:\Users\name\Downloads\Atlas-ai\projects
- report_dir: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z

## Summary

- tasks: 12
- passed: 7
- failed: 5
- tasks_with_strict_tool_calls: 12
- tasks_with_raw_json_tool_calls: 0
- total_tokens: 66015
- prompt_tokens: 56017
- completion_tokens: 9998
- duration_ms_total: 188952

## Findings By Project

### project1: frontend-calculator-create

- project: C:\Users\name\Downloads\Atlas-ai\projects\project1
- passed: false
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 16258
- total_tokens: 3606
- prompt_tokens: 2693
- completion_tokens: 913
- source: Build a simple scientific calculator in index.html, style.css, and script.js. Include sin, cos, tan, log, sqrt, power, memory buttons, keyboard input, and a clear display.
- observed: task check failed
- check: `test -s index.html && test -s script.js` -> exit=1 timed_out=false
- final_excerpt: "I will write a comprehensive todo list to guide the development of this scientific calculator."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project1.json

### project2: js-failing-test-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project2
- passed: true
- strict_tool_calls: 7
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 16882
- total_tokens: 7001
- prompt_tokens: 6178
- completion_tokens: 823
- source: Fix the failing JS test without changing the test file.
- observed: no anomaly recorded
- check: `node math.test.mjs` -> exit=0 timed_out=false
- final_excerpt: "I have successfully fixed the failing JS test without changing the test file.\n\n### Summary of Changes:\n- **Identified the issue**: The `add` function in `math.js` was converting its arguments to strings and concatenating them (e.g., returni"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project2.json

### project3: python-edge-case-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project3
- passed: false
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 14256
- total_tokens: 3157
- prompt_tokens: 2358
- completion_tokens: 799
- source: Fix slugify.py so the test passes. Keep it simple.
- observed: task check failed
- check: `C:/Users/name/AppData/Local/Programs/Python/Python314/python.exe test_slugify.py` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project3.json

### project4: read-before-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project4
- passed: true
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 10141
- total_tokens: 3256
- prompt_tokens: 2777
- completion_tokens: 479
- source: Change the greeting to say hello to Atlas. Inspect the file first.
- observed: no anomaly recorded
- check: `grep -q Atlas app.txt` -> exit=0 timed_out=false
- final_excerpt: "I have inspected the `app.txt` file, which originally contained `hello world`, and updated the greeting to say `hello Atlas`."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project4.json

### project5: avoid-foreground-server

- project: C:\Users\name\Downloads\Atlas-ai\projects\project5
- passed: true
- strict_tool_calls: 8
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 22706
- total_tokens: 9691
- prompt_tokens: 8041
- completion_tokens: 1650
- source: Run this tiny web app so I can preview it. Do not hang the foreground command.
- observed: no anomaly recorded
- check: `test -f index.html` -> exit=0 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project5.json

### project6: multi-file-import-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project6
- passed: true
- strict_tool_calls: 8
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 20917
- total_tokens: 9384
- prompt_tokens: 8248
- completion_tokens: 1136
- source: Fix the import bug so node main.mjs prints ok.
- observed: no anomaly recorded
- check: `node main.mjs` -> exit=0 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project6.json

### project7: css-responsive-polish

- project: C:\Users\name\Downloads\Atlas-ai\projects\project7
- passed: false
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 16076
- total_tokens: 4163
- prompt_tokens: 2877
- completion_tokens: 1286
- source: Improve the CSS so the button text does not overflow on narrow screens.
- observed: task check failed
- check: `grep -q overflow-wrap style.css || grep -q word-break style.css` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project7.json

### project8: json-config-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project8
- passed: true
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 11245
- total_tokens: 2836
- prompt_tokens: 2498
- completion_tokens: 338
- source: Update config.json to enable localModel and set maxSteps to 8. Preserve valid JSON.
- observed: no anomaly recorded
- check: `node -e "const c=require('./config.json'); if(!c.localModel||c.maxSteps!==8) process.exit(1)"` -> exit=0 timed_out=false
- final_excerpt: "I have successfully updated `config.json` to enable `localModel` (set to `true`) and set `maxSteps` to `8`, while preserving valid JSON formatting."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project8.json

### project9: todo-churn-observation

- project: C:\Users\name\Downloads\Atlas-ai\projects\project9
- passed: false
- strict_tool_calls: 8
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 21154
- total_tokens: 8976
- prompt_tokens: 8170
- completion_tokens: 806
- source: Make the one-line change in note.md. This is intentionally simple; do not create a plan.
- observed: task check failed
- check: `grep -q 'status: done' note.md` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project9.json

### project10: verification-honesty

- project: C:\Users\name\Downloads\Atlas-ai\projects\project10
- passed: false
- strict_tool_calls: 8
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 17996
- total_tokens: 7222
- prompt_tokens: 6595
- completion_tokens: 627
- source: Fix the bug and verify it with the provided test before claiming success.
- observed: task check failed
- check: `C:/Users/name/AppData/Local/Programs/Python/Python314/python.exe test_is_even.py` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project10.json

### project11: path-resolution-active-folder

- project: C:\Users\name\Downloads\Atlas-ai\projects\project11
- passed: true
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 10532
- total_tokens: 3058
- prompt_tokens: 2562
- completion_tokens: 496
- source: Create README.md for this project with a one-sentence description.
- observed: no anomaly recorded
- check: `test -f README.md` -> exit=0 timed_out=false
- final_excerpt: "I have created the `README.md` file with a one-sentence description of the project."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project11.json

### project12: malformed-existing-html

- project: C:\Users\name\Downloads\Atlas-ai\projects\project12
- passed: true
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 10789
- total_tokens: 3665
- prompt_tokens: 3020
- completion_tokens: 645
- source: Fix the malformed HTML and keep the existing text.
- observed: no anomaly recorded
- check: `grep -q '</h1>' index.html && grep -q '</p>' index.html` -> exit=0 timed_out=false
- final_excerpt: "I have successfully fixed the malformed HTML in `index.html` while keeping the existing text intact:\n\n1. Corrected the mismatched heading tag from `<h1>Atlas</h2>` to `<h1>Atlas</h1>`.\n2. Closed the unclosed paragraph tag from `<p>Local fir"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T18-24-19-070Z\project12.json

