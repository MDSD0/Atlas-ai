import { ProofJournal } from "@/modules/ai/proof/journal";
import { TauriProofPersistence } from "@/modules/ai/proof/persistence";

export * from "@/modules/ai/proof/contracts";
export * from "@/modules/ai/proof/journal";
export * from "@/modules/ai/proof/persistence";
export * from "@/modules/ai/proof/runtime";

export const proofJournal = new ProofJournal(new TauriProofPersistence());
