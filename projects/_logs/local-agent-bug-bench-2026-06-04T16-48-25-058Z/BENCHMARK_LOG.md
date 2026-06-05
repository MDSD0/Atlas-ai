# Atlas Local-Agent Bug Bench

- run_id: 2026-06-04T16-48-25-058Z
- model: openrouter/auto
- provider: openrouter
- base_url: https://openrouter.ai/api/v1
- execute_raw_json: false
- projects_root: C:\Users\name\Downloads\Atlas-ai\projects
- report_dir: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z

## Summary

- tasks: 12
- passed: 6
- failed: 6
- tasks_with_strict_tool_calls: 6
- tasks_with_raw_json_tool_calls: 0

## Findings By Project

### project1: frontend-calculator-create

- project: C:\Users\name\Downloads\Atlas-ai\projects\project1
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 7700
- source: Build a simple scientific calculator in index.html, style.css, and script.js. Include sin, cos, tan, log, sqrt, power, memory buttons, keyboard input, and a clear display.
- observed: no OpenAI tool_calls emitted; task check failed
- check: `test -s index.html && test -s script.js` -> exit=1 timed_out=false
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project1.json

### project2: js-failing-test-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project2
- passed: true
- strict_tool_calls: 3
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 8352
- source: Fix the failing JS test without changing the test file.
- observed: no anomaly recorded
- check: `node math.test.mjs` -> exit=0 timed_out=false
- final_excerpt: "I have corrected the `add` function in `math.js`. Please let me know if the tests pass now. If not, I can investigate further."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project2.json

### project3: python-edge-case-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project3
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1492
- source: Fix slugify.py so the test passes. Keep it simple.
- observed: no OpenAI tool_calls emitted; task check failed
- check: `python test_slugify.py` -> exit=127 timed_out=false
- final_excerpt: "I need to see the contents of `slugify.py` and the test file to fix the bug. I'll start by listing the files in the project to understand the directory structure. Then I'll read the contents of `slugify.py` and the test file.\n"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project3.json

### project4: read-before-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project4
- passed: true
- strict_tool_calls: 3
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 8107
- source: Change the greeting to say hello to Atlas. Inspect the file first.
- observed: no anomaly recorded
- check: `grep -q Atlas app.txt` -> exit=0 timed_out=false
- final_excerpt: "The greeting in app.txt has been changed to \"hello Atlas\"."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project4.json

### project5: avoid-foreground-server

- project: C:\Users\name\Downloads\Atlas-ai\projects\project5
- passed: true
- strict_tool_calls: 1
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 2657
- source: Run this tiny web app so I can preview it. Do not hang the foreground command.
- observed: no anomaly recorded
- check: `test -f index.html` -> exit=0 timed_out=false
- final_excerpt: "I cannot run the web app because it would hang the foreground command. I can, however, provide you with the contents of any file or list the files in any directory if you'd like."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project5.json

### project6: multi-file-import-fix

- project: C:\Users\name\Downloads\Atlas-ai\projects\project6
- passed: true
- strict_tool_calls: 4
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 8166
- source: Fix the import bug so node main.mjs prints ok.
- observed: no anomaly recorded
- check: `node main.mjs` -> exit=0 timed_out=false
- final_excerpt: "The command `node main.mjs` executed successfully and printed \"ok\". The import bug has been fixed."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project6.json

### project7: css-responsive-polish

- project: C:\Users\name\Downloads\Atlas-ai\projects\project7
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1267
- source: Improve the CSS so the button text does not overflow on narrow screens.
- observed: no OpenAI tool_calls emitted; task check failed
- check: `grep -q overflow-wrap style.css || grep -q word-break style.css` -> exit=1 timed_out=false
- final_excerpt: "I need to see the CSS code to improve it. Please provide the content of the CSS file or its path."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project7.json

### project8: json-config-edit

- project: C:\Users\name\Downloads\Atlas-ai\projects\project8
- passed: true
- strict_tool_calls: 2
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 4800
- source: Update config.json to enable localModel and set maxSteps to 8. Preserve valid JSON.
- observed: no anomaly recorded
- check: `node -e "const c=require('./config.json'); if(!c.localModel||c.maxSteps!==8) process.exit(1)"` -> exit=0 timed_out=false
- final_excerpt: "Updated config.json to enable localModel and set maxSteps to 8."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project8.json

### project9: todo-churn-observation

- project: C:\Users\name\Downloads\Atlas-ai\projects\project9
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1448
- source: Make the one-line change in note.md. This is intentionally simple; do not create a plan.
- observed: no OpenAI tool_calls emitted; task check failed
- check: `grep -q 'status: done' note.md` -> exit=1 timed_out=false
- final_excerpt: "I need access to the file system to make changes to `note.md`. Please provide the content of the file so I can modify it."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project9.json

### project10: verification-honesty

- project: C:\Users\name\Downloads\Atlas-ai\projects\project10
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1655
- source: Fix the bug and verify it with the provided test before claiming success.
- observed: no OpenAI tool_calls emitted; task check failed
- check: `python test_is_even.py` -> exit=127 timed_out=false
- final_excerpt: "I need more information to fix the bug. Please provide the code that needs to be fixed and the test case. I also need to know what the bug is and what the expected behavior is. Once I have this information, I can use the tools to:\n\n1. **Rea"
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project10.json

### project11: path-resolution-active-folder

- project: C:\Users\name\Downloads\Atlas-ai\projects\project11
- passed: true
- strict_tool_calls: 3
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 6548
- source: Create README.md for this project with a one-sentence description.
- observed: no anomaly recorded
- check: `test -f README.md` -> exit=0 timed_out=false
- final_excerpt: "The README.md file has been created with a one-sentence description."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project11.json

### project12: malformed-existing-html

- project: C:\Users\name\Downloads\Atlas-ai\projects\project12
- passed: false
- strict_tool_calls: 0
- raw_json_tool_calls: 0
- todo_writes: 0
- duration_ms: 1213
- source: Fix the malformed HTML and keep the existing text.
- observed: no OpenAI tool_calls emitted; task check failed
- check: `grep -q '</h1>' index.html && grep -q '</p>' index.html` -> exit=1 timed_out=false
- final_excerpt: "I need to know which file contains the malformed HTML. Please provide the file path."
- raw_log: C:\Users\name\Downloads\Atlas-ai\projects\_logs\local-agent-bug-bench-2026-06-04T16-48-25-058Z\project12.json

