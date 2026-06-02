# Golden V1 Fixture

Deterministic release demo:

```text
Open the project. Find the total-calculation bug using repository evidence.
Show the relevant definition and references. Make the smallest safe correction.
Show diagnostics. Run the narrow test. Present proof.
```

The committed fixture intentionally contains the bug. `scripts/run-v1-evals.mjs`
copies it into a temp directory, proves the narrow test fails, applies the
expected one-line correction, and proves the same test passes.
