# Atlas Claude-fix verification

> Superseded for proof receipts and composer attachments by Corrective Slice C23 later on 2026-07-03. See `source_pack.md` for the implemented fixes and verification results.

Date: 2026-07-03  
Scope: current uncommitted source changes versus `6e9a664`, with source-level verification and the full Vitest suite. Per request, no UI review and no Cargo check were used as evidence.

## Verdict

Claude did substantial work, but it did **not** fix everything.

- **396/396 ordinary TypeScript tests pass**; four paid/real-provider benchmark suites remain skipped by default.
- Several original critical/high findings have credible implementation fixes.
- The user's two concrete regressions are still present: proof receipts can be replaced by a later `Unverified` turn, and composer drag/drop is absent.
- Code Reality itself is effectively unchanged and remains a heuristic symbol/tag graph, not correctness proof.
- Major product gaps—dead worktree surface, basic synchronous subagents, whole-file review, no browser verification, full-context lane, and weak evidence semantics—remain.

Revised source-only rating: **5.8/10**, up from 4.1/10. Still a no-go for claiming a production-grade autonomous coding harness.

## The concrete receipt bug: confirmed unfixed

The receipt strip says it hides pure-chat turns, but production makes that impossible:

1. Every turn records `run_start` and `prompt_submit` before the model does anything (`src/modules/ai/lib/transport.ts`).
2. Finishing records `verdict` and `run_finish` (`src/modules/ai/proof/recorder.ts`).
3. Every lifecycle record increments `eventCount`.
4. `shouldShowReceipt` shows any summary whose `eventCount > 0` (`src/modules/ai/components/ReceiptStrip.tsx`).
5. The proof store keeps only one `latestBySession` summary (`src/modules/ai/store/proofStore.ts`). A new conversational turn replaces the previous verified run.
6. A no-tool turn receives `unverified`, so the UI changes from the previous verified result to `Unverified · 4 actions` even though nothing verification-relevant happened.

The passing receipt test is misleading: it constructs a supposedly pure-chat summary with `eventCount: 0`, a state the real lifecycle does not produce.

The status is also gameable. `isRecognizedCheck` accepts any successful command containing standalone words such as `test`, `spec`, `lint`, `build`, or `compile`. `echo test` can therefore earn `Verified`; the receipt proves that a regex-matching command exited zero, not that the change is correct or even that a test runner executed.

Code Reality and proof receipts are separate systems. Reality does not drive the receipt verdict, and the only Reality change in this patch is an authorization-call signature update.

## Attachments: partial, with drag/drop missing

Current behavior from source:

- The tiny pre-send image thumbnail still exists (`size-4`, 16 px) in the composer chip row.
- File picker attachment works for images and the allow-listed text/code extensions.
- Clipboard paste now collects pasted files and creates chips.
- Images are converted to data URLs and sent to the model as AI SDK `file` parts.
- Small text/code files are embedded verbatim inside the user text as `<file>` blocks.

What does not work or is unsafe:

- There is no `onDrop`, `onDragOver`, or `dataTransfer.files` handler in the AI composer. Dragging onto the textbox does nothing. No tracked revision contains such a handler.
- PDF/DOCX and other actual document formats are not in the picker accept list and have no parser. A pasted small binary document may be decoded as garbage text; a workspace binary is silently skipped.
- Text files over 200 KB are silently discarded.
- Images have no byte, dimension, or count limit before whole-file base64 conversion, message persistence, and provider submission.
- Duplicate attachments are not deduplicated.
- After send, `AiChat.RenderedPart` handles text, reasoning, and tool parts only. It returns `null` for file/image parts, so an image-only user message can appear blank in transcript even though the model receives it.
- The composer clears all chips immediately after the fire-and-forget send call; a synchronous submission failure has no recovery path for the attachments.

## Original high-severity finding status

| Finding | Status | Verification |
| --- | --- | --- |
| F-01 Full-access security claim | **Partial / still risky** | Copy now admits unrestricted disk access and native file APIs accept it. Secret-path checks still do not constrain shell commands or descendants, so the shell can read/exfiltrate secrets. This is disclosure, not sandboxing. |
| F-02 run can drift into another project | **Credibly fixed** | Transport freezes `getProjectContext()` per run; a targeted regression test passes. |
| F-03 global multi-session state | **Mostly fixed** | Agent metadata, approval mode, and responder are session-keyed with multi-session tests. Source explicitly admits inactive-chat message tails are not persisted until revisit/eviction. |
| F-04 Gemini boolean-literal schema failure | **Fixed at schema level** | Literal-true schemas became booleans with runtime true checks; all advertised tool schemas pass the compatibility test. No new paid all-tools provider canary was run. |
| F-05 green benchmarks despite failure | **Improved, not a release gate** | Main paid benches now assert provider health and minimum result rates. They are still skipped in the ordinary 396-test run, and the calculator judge remains structurally weak. |
| F-06 fake persistent shell | **Implemented, with new edge risks** | A real long-lived shell and framed commands now exist. However, persistent output buffers grow without a cap until completion; timeout paths return uncapped buffered output. A noisy/hung command can consume large memory. The `cmd.exe` fallback is also fed PowerShell framing syntax. |
| F-07 background leaks/tree cleanup | **Substantially fixed** | Job objects/process groups, cleanup, TTL, and caps were added. |
| F-08 blocking async runtime | **Fixed** | Blocking shell operations moved to `spawn_blocking`. |
| F-09 voice network path | **Fixed in source** | Whisper uses the Tauri proxy fetch and now surfaces user errors. |
| F-10 decorative skills | **Partial** | Allowed-tool restrictions and lifecycle reminders are wired. Fixtures remain unused, every enabled skill is globally injected, restrictions apply to the whole run rather than a scoped skill invocation, and hooks are prompt reminders rather than executable/enforcing hooks. |
| F-11 MCP timeout side effects | **Partial** | Abort/timeout reaches native code and closes the connection promptly. Already-dispatched external side effects cannot be cancelled; the native client mutex also serializes calls while held across the tool await. |
| F-12 plaintext retention controls | **Partial** | Export and clear-all controls were added. Plaintext persistence, no expiry/size quota, no project privacy mode, and no at-rest protection remain. |

## Still-unfixed product claims

- **Code Reality:** still name/tag extraction plus heuristic weighted graph relations. It does not resolve true call/dependency semantics or prove behavior.
- **Worktrees:** native implementation remains unreachable from the agent and ordinary product flow.
- **Subagents:** still one synchronous, read-only summary call; no parallel orchestration, steering, resume, persistent child, or worktree isolation.
- **Verification:** proof classification is based on tool activity and command-name regexes, not behavioral evidence tied to a claim.
- **Per-hunk review:** still whole-file accept/reject.
- **Browser verification:** still no agent browser/screenshot/DOM verification loop.
- **Efficiency:** every run still selects the one `full` lane and loads all optional context families. The prior 20K–33K input-token behavior for tiny tasks was not architecturally addressed.
- **Inactive-session durability:** current source documents that a background chat's message tail may not reach disk until that session is revisited or flushed.

## Bottom line

This is a meaningful repair pass, not proof that Atlas's claims are now true. The low-level runtime is better. The evidence UX, attachments, Code Reality semantics, orchestration depth, and several differentiating claims are still unfinished or overstated.
