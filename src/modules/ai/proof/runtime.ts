import {
  RunRecorder,
  type ApprovalRecord,
} from "@/modules/ai/proof/recorder";

export const PROOF_RECORDER_SESSIONS = 100;

/**
 * Keeps the latest recorder per chat session available to UI-only follow-ups.
 * Tool approval responses can arrive after a model stream closes, so the
 * latest recorder intentionally remains addressable until a newer run replaces
 * it or the session is explicitly cleared.
 */
export class ProofRunRegistry {
  private readonly latestBySession = new Map<string, RunRecorder>();

  constructor(private readonly maxSessions = PROOF_RECORDER_SESSIONS) {}

  register(recorder: RunRecorder): void {
    const sessionId = recorder.summary().sessionId;
    this.latestBySession.delete(sessionId);
    this.latestBySession.set(sessionId, recorder);
    while (this.latestBySession.size > this.maxSessions) {
      const oldest = this.latestBySession.keys().next().value as
        | string
        | undefined;
      if (!oldest) break;
      this.latestBySession.delete(oldest);
    }
  }

  latest(sessionId: string): RunRecorder | null {
    return this.latestBySession.get(sessionId) ?? null;
  }

  clearSession(sessionId: string): void {
    this.latestBySession.delete(sessionId);
  }

  async recordApproval(
    sessionId: string,
    record: ApprovalRecord,
  ): Promise<boolean> {
    const recorder = this.latest(sessionId);
    if (!recorder) return false;
    await recorder.recordApproval(record);
    return true;
  }
}

export const proofRunRegistry = new ProofRunRegistry();
