import {
  PROOF_ARTIFACTS_PER_RUN,
  PROOF_EVENTS_PER_RUN,
  PROOF_LIST_ITEMS,
  PROOF_PATH_BYTES,
  PROOF_PAYLOAD_BYTES,
  PROOF_RUNS,
  PROOF_SUMMARY_BYTES,
  boundPayload,
  boundText,
  boundTextList,
  proofArtifactId,
  type ProofArtifact,
  type ProofEvent,
  type ProofRun,
  type ProofVerdict,
  type ProofVerdictStatus,
} from "@/modules/ai/proof/contracts";
import type { ProofPersistence } from "@/modules/ai/proof/persistence";
import { redactSensitive } from "@/modules/ai/lib/redact";

const INDEX_KEY = "runs";
const runKey = (runId: string) => `run:${runId}`;

type RunIndexEntry = {
  id: string;
  startedAt: number;
};

export type ProofJournalOptions = {
  clock?: () => number;
  idFactory?: () => string;
  maxRuns?: number;
  maxEventsPerRun?: number;
  maxArtifactsPerRun?: number;
  maxListItems?: number;
  payloadBytes?: number;
  summaryBytes?: number;
  pathBytes?: number;
};

export type StartRunInput = {
  sessionId: string;
  workspaceRoot: string | null;
  startedAt?: number;
};

export type AppendEventInput = {
  kind: string;
  summary: string;
  payload?: unknown;
  startedAt?: number;
  finishedAt?: number | null;
};

export type UpsertArtifactInput = {
  kind: string;
  pathOrCommand: string;
  contentHash: string;
  preview?: string | null;
};

export type FinishRunInput = {
  status: ProofVerdictStatus;
  changedFiles?: readonly string[];
  diagnostics?: readonly string[];
  checks?: readonly string[];
  unresolvedFailures?: readonly string[];
  finishedAt?: number;
};

function defaultId(): string {
  return `r-${crypto.randomUUID()}`;
}

export class ProofJournal {
  private readonly clock: () => number;
  private readonly idFactory: () => string;
  private readonly maxRuns: number;
  private readonly maxEventsPerRun: number;
  private readonly maxArtifactsPerRun: number;
  private readonly maxListItems: number;
  private readonly payloadBytes: number;
  private readonly summaryBytes: number;
  private readonly pathBytes: number;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly persistence: ProofPersistence,
    options: ProofJournalOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? defaultId;
    this.maxRuns = options.maxRuns ?? PROOF_RUNS;
    this.maxEventsPerRun = options.maxEventsPerRun ?? PROOF_EVENTS_PER_RUN;
    this.maxArtifactsPerRun =
      options.maxArtifactsPerRun ?? PROOF_ARTIFACTS_PER_RUN;
    this.maxListItems = options.maxListItems ?? PROOF_LIST_ITEMS;
    this.payloadBytes = options.payloadBytes ?? PROOF_PAYLOAD_BYTES;
    this.summaryBytes = options.summaryBytes ?? PROOF_SUMMARY_BYTES;
    this.pathBytes = options.pathBytes ?? PROOF_PATH_BYTES;
  }

  startRun(input: StartRunInput): Promise<ProofRun> {
    return this.mutate(async () => {
      const startedAt = input.startedAt ?? this.clock();
      const run: ProofRun = {
        id: this.idFactory(),
        sessionId: input.sessionId,
        workspaceRoot: input.workspaceRoot,
        startedAt,
        finishedAt: null,
        status: "running",
        nextSequence: 1,
        events: [],
        eventsDropped: 0,
        artifacts: [],
        artifactsDropped: 0,
        verdict: null,
      };
      const previous = (await this.persistence.get<RunIndexEntry[]>(INDEX_KEY)) ?? [];
      const next = [
        { id: run.id, startedAt },
        ...previous.filter((item) => item.id !== run.id),
      ];
      const retained = next.slice(0, this.maxRuns);
      const removed = next.slice(this.maxRuns);
      await this.persistence.set(runKey(run.id), run);
      await this.persistence.set(INDEX_KEY, retained);
      for (const item of removed) {
        await this.persistence.delete(runKey(item.id));
      }
      await this.persistence.save();
      return run;
    });
  }

  appendEvent(runId: string, input: AppendEventInput): Promise<ProofEvent> {
    return this.appendEventForRun(runId, input, false);
  }

  /**
   * Append a bounded follow-up to the latest run after its model stream closes.
   * This is intentionally narrow: user approval responses can arrive after a
   * tool-call stream has finished, but still belong in the durable timeline.
   */
  appendFollowUpEvent(
    runId: string,
    input: AppendEventInput,
  ): Promise<ProofEvent> {
    return this.appendEventForRun(runId, input, true);
  }

  private appendEventForRun(
    runId: string,
    input: AppendEventInput,
    allowFinished: boolean,
  ): Promise<ProofEvent> {
    return this.mutate(async () => {
      const run = allowFinished
        ? await this.requireRun(runId)
        : await this.requireRunningRun(runId);
      const sequence = run.nextSequence++;
      const event: ProofEvent = {
        id: `${runId}:event:${sequence}`,
        runId,
        sequence,
        kind: input.kind,
        startedAt: input.startedAt ?? this.clock(),
        finishedAt: input.finishedAt ?? null,
        summary: boundText(redactSensitive(input.summary), this.summaryBytes),
        boundedPayload:
          input.payload === undefined
            ? null
            : boundPayload(input.payload, this.payloadBytes),
      };
      if (run.events.length >= this.maxEventsPerRun) {
        run.events.shift();
        run.eventsDropped += 1;
      }
      run.events.push(event);
      await this.persistRun(run);
      return event;
    });
  }

  upsertArtifact(
    runId: string,
    input: UpsertArtifactInput,
  ): Promise<ProofArtifact> {
    return this.mutate(async () => {
      const run = await this.requireRunningRun(runId);
      const artifact: ProofArtifact = {
        id: await proofArtifactId(runId, input.kind, input.pathOrCommand),
        runId,
        kind: input.kind,
        pathOrCommand: boundText(
          redactSensitive(input.pathOrCommand),
          this.pathBytes,
        ),
        contentHash: input.contentHash,
        boundedPreview:
          input.preview == null
            ? null
            : boundText(redactSensitive(input.preview), this.payloadBytes),
      };
      const index = run.artifacts.findIndex((item) => item.id === artifact.id);
      if (index !== -1) {
        run.artifacts[index] = artifact;
      } else {
        if (run.artifacts.length >= this.maxArtifactsPerRun) {
          run.artifacts.shift();
          run.artifactsDropped += 1;
        }
        run.artifacts.push(artifact);
      }
      await this.persistRun(run);
      return artifact;
    });
  }

  finishRun(runId: string, input: FinishRunInput): Promise<ProofVerdict> {
    return this.mutate(async () => {
      const run = await this.requireRunningRun(runId);
      const verdict: ProofVerdict = {
        runId,
        status: input.status,
        changedFiles: boundTextList(
          input.changedFiles ?? [],
          this.maxListItems,
          this.pathBytes,
        ),
        diagnostics: boundTextList(
          input.diagnostics ?? [],
          this.maxListItems,
          this.payloadBytes,
        ),
        checks: boundTextList(
          input.checks ?? [],
          this.maxListItems,
          this.payloadBytes,
        ),
        unresolvedFailures: boundTextList(
          input.unresolvedFailures ?? [],
          this.maxListItems,
          this.payloadBytes,
        ),
      };
      run.finishedAt = input.finishedAt ?? this.clock();
      run.status = input.status;
      run.verdict = verdict;
      await this.persistRun(run);
      return verdict;
    });
  }

  async getRun(runId: string): Promise<ProofRun | null> {
    await this.writes;
    return (await this.persistence.get<ProofRun>(runKey(runId))) ?? null;
  }

  async restore(): Promise<ProofRun[]> {
    await this.writes;
    const index = (await this.persistence.get<RunIndexEntry[]>(INDEX_KEY)) ?? [];
    const runs = await Promise.all(
      index.map((item) => this.persistence.get<ProofRun>(runKey(item.id))),
    );
    return runs.filter((run): run is ProofRun => run !== undefined);
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writes.then(operation, operation);
    this.writes = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async requireRunningRun(runId: string): Promise<ProofRun> {
    const run = await this.requireRun(runId);
    if (run.status !== "running") {
      throw new Error(`proof run is already finished: ${runId}`);
    }
    return run;
  }

  private async requireRun(runId: string): Promise<ProofRun> {
    const run = await this.persistence.get<ProofRun>(runKey(runId));
    if (!run) throw new Error(`proof run not found: ${runId}`);
    return run;
  }

  private async persistRun(run: ProofRun): Promise<void> {
    await this.persistence.set(runKey(run.id), run);
    await this.persistence.save();
  }
}
