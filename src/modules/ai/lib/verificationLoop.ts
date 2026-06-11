import { isRecognizedCheck } from "../proof/recorder";

/**
 * Verification loop (diff-as-feedback) — the one orchestration improvement the
 * evidence supports ("Is Grep All You Need?": orchestration > retriever; Simple
 * Strands: diffs/errors as primary feedback). When the agent runs a *real*
 * check (test/build/typecheck/lint) and it FAILS, the tool result carries a
 * directive so the model iterates on the failure instead of declaring the task
 * done. Weak models especially tend to stop at a red check; this keeps the loop
 * closed until the check exits 0. The step budget is the backstop against
 * infinite retries.
 *
 * Returns the directive string when the command is a recognized verification
 * that failed, otherwise null (no annotation for non-checks or passing checks).
 */
export function verificationRecovery(
  command: string,
  exitCode: number | null,
): string | null {
  if (exitCode === null || exitCode === 0) return null;
  if (!isRecognizedCheck(command)) return null;
  return (
    "VERIFICATION FAILED — this is a real test/build/lint/typecheck and it did " +
    "not pass. Read the error above, fix the root cause in the source, and " +
    "re-run this exact check. Do not finish or report success until it exits 0."
  );
}

export function commandFailureRecovery(
  command: string,
  exitCode: number | null,
  stderr: string,
): string | null {
  if (exitCode === null || exitCode === 0) return null;
  const verification = verificationRecovery(command, exitCode);
  if (verification) return verification;
  if (/The token '&&' is not a valid statement separator/i.test(stderr)) {
    return (
      "COMMAND FAILED - this shell rejected '&&'. Run the failed steps again " +
      "using separate bash_run calls or a shell-appropriate separator, then " +
      "continue only after the required install/build step exits 0."
    );
  }
  return (
    `COMMAND FAILED - exit ${exitCode}. Do not treat this step as complete. ` +
    "Read stdout/stderr, fix the root cause or rerun with the correct command, " +
    "and do not start a preview or claim success until the prerequisite command exits 0."
  );
}

/**
 * Interactive programs that read stdin (e.g. a Python `input()` REPL) always
 * die with EOF under the agent shell — there is no stdin to give them. That
 * exit is NOT a build failure, but models read the nonzero exit as one and
 * burn steps "fixing" working code. Annotate the result so the model verifies
 * another way (import check, unit test, --help) instead of rewriting the app.
 */
export function interactiveEofHint(
  exitCode: number | null,
  stderr: string,
): string | null {
  if (exitCode === null || exitCode === 0) return null;
  if (!/EOFError|EOF when reading a line/.test(stderr)) return null;
  return (
    "NOTE: the program ran and then hit EOF reading stdin — the agent shell is " +
    "non-interactive, so any input()/readline prompt fails this way. This is " +
    "not a build or code failure. Verify the code another way (run its tests, " +
    "import it, or use a non-interactive flag) and tell the user the command " +
    "to run it interactively in their own terminal."
  );
}
