# Atlas Local-Agent Bug Bench

- run_id: 2026-06-04T16-49-31-951Z
- model: openai/gpt-4.1-mini
- provider: openrouter
- base_url: https://openrouter.ai/api/v1
- execute_raw_json: false
- projects_root: C:\Users\name\Downloads\Atlas-ai\projects
- report_dir: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z

## Summary

- tasks: 12
- passed: 5
- failed: 7
- tasks_with_strict_tool_calls: 12
- tasks_with_raw_json_tool_calls: 0

## Findings By Project

### project1: frontend-calculator-create

- project: C:\Users\name\Downloads\Atlas-ai\projects\project1
- passed: true
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 56455
- source: Build a simple scientific calculator in index.html, style.css, and script.js. Include sin, cos, tan, log, sqrt, power, memory buttons, keyboard input, and a clear display.
- observed: malformed tool arguments
- check: `test -s index.html && test -s script.js` -> exit=0 timed_out=false
- final_excerpt: "Created a simple scientific calculator with sin, cos, tan, log, sqrt, power, memory buttons, keyboard input, and clear display. The files created/updated are:\n\n- index.html: Calculator layout and buttons\n- style.css: Styling for the calcula"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project1.json

### project2: js-failing-test-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project2
- passed: true
- strict_tool_calls: 6
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 8971
- source: Fix the failing JS test without changing the test file.
- observed: no anomaly recorded
- check: `node math.test.mjs` -> exit=0 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project2.json

### project3: python-edge-case-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project3
- passed: false
- strict_tool_calls: 6
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 8756
- source: Fix slugify.py so the test passes. Keep it simple.
- observed: task check failed
- check: `python test_slugify.py` -> exit=127 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project3.json

### project4: read-before-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project4
- passed: false
- strict_tool_calls: 6
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 7914
- source: Change the greeting to say hello to Atlas. Inspect the file first.
- observed: task check failed
- check: `grep -q Atlas app.txt` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project4.json

### project5: avoid-foreground-server

- project: C:\Users\name\Downloads\Atlas-ai\projects\project5
- passed: true
- strict_tool_calls: 6
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 15404
- source: Run this tiny web app so I can preview it. Do not hang the foreground command.
- observed: no anomaly recorded
- check: `test -f index.html` -> exit=0 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project5.json

### project6: multi-file-import-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project6
- passed: false
- strict_tool_calls: 6
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 7970
- source: Fix the import bug so node main.mjs prints ok.
- observed: task check failed
- check: `node main.mjs` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project6.json

### project7: css-responsive-polish

- project: C:\Users\name\Downloads\Atlas-ai\projects\project7
- passed: false
- strict_tool_calls: 6
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 10127
- source: Improve the CSS so the button text does not overflow on narrow screens.
- observed: task check failed
- check: `grep -q overflow-wrap style.css || grep -q word-break style.css` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project7.json

### project8: json-config-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project8
- passed: true
- strict_tool_calls: 3
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 6129
- source: Update config.json to enable localModel and set maxSteps to 8. Preserve valid JSON.
- observed: no anomaly recorded
- check: `node -e "const c=require('./config.json'); if(!c.localModel||c.maxSteps!==8) process.exit(1)"` -> exit=0 timed_out=false
- final_excerpt: "Updated config.json to enable localModel (set to true) and set maxSteps to 8."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project8.json

### project9: todo-churn-observation

- project: C:\Users\name\Downloads\Atlas-ai\projects\project9
- passed: false
- strict_tool_calls: 6
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 7295
- source: Make the one-line change in note.md. This is intentionally simple; do not create a plan.
- observed: task check failed
- check: `grep -q 'status: done' note.md` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project9.json

### project10: verification-honesty

- project: C:\Users\name\Downloads\Atlas-ai\projects\project10
- passed: false
- strict_tool_calls: 6
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 10808
- source: Fix the bug and verify it with the provided test before claiming success.
- observed: task check failed
- check: `python test_is_even.py` -> exit=127 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project10.json

### project11: path-resolution-active-folder

- project: C:\Users\name\Downloads\Atlas-ai\projects\project11
- passed: false
- strict_tool_calls: 6
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 7918
- source: Create README.md for this project with a one-sentence description.
- observed: task check failed
- check: `test -f README.md` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project11.json

### project12: malformed-existing-html

- project: C:\Users\name\Downloads\Atlas-ai\projects\project12
- passed: true
- strict_tool_calls: 5
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 8876
- source: Fix the malformed HTML and keep the existing text.
- observed: no anomaly recorded
- check: `grep -q '</h1>' index.html && grep -q '</p>' index.html` -> exit=0 timed_out=false
- final_excerpt: "I fixed the malformed HTML in the file index.html by correcting the closing tag for the h1 element and adding a closing p tag. The existing text was preserved. The corrected HTML is now well-formed."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-49-31-951Z\project12.json

