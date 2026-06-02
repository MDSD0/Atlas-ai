export const WORK_PACKET_STORE_PATH = "atlas-ai-work-packets.json";
export const WORK_PACKETS_PER_PROJECT = 100;
export const WORK_PACKET_TEXT_BYTES = 2_048;
export const WORK_PACKET_PATH_BYTES = 4_096;
export const WORK_PACKET_LIST_ITEMS = 50;
export const WORK_PACKET_CONTEXT_BYTES = 8_192;

export const WORK_PACKET_REPO_TRUTH_RULE =
  "A work packet is an advisory handoff, not repository truth. Refresh current repository evidence before editing; current source files and fresh verification override the packet.";

export type WorkPacketStatus = "active" | "blocked" | "complete";

export type WorkPacket = {
  id: string;
  projectId: string;
  sessionId: string;
  originalGoal: string;
  acceptedInterpretation: string;
  status: WorkPacketStatus;
  filesChanged: string[];
  decisionsMade: string[];
  unresolvedBlockers: string[];
  testsRun: string[];
  failingTests: string[];
  proofRunIds: string[];
  nextSuggestedAction: string;
  createdAt: number;
  updatedAt: number;
};

export type CreateWorkPacketInput = Omit<
  WorkPacket,
  "id" | "createdAt" | "updatedAt"
>;

export type WorkPacketResumeCapsule = {
  packetId: string;
  projectId: string;
  status: WorkPacketStatus;
  tokenEstimate: number;
  repoTruthRule: string;
  markdown: string;
};
