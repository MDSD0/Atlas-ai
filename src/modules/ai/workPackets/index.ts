import {
  WORK_PACKET_REPO_TRUTH_RULE,
  type WorkPacket,
} from "@/modules/ai/workPackets/contracts";
import {
  renderWorkPacketMarkdown,
  resumeCapsule,
  suggestedWorkPacketPath,
} from "@/modules/ai/workPackets/compiler";
import { TauriWorkPacketPersistence } from "@/modules/ai/workPackets/persistence";
import { WorkPacketRegistry } from "@/modules/ai/workPackets/registry";

export * from "@/modules/ai/workPackets/compiler";
export * from "@/modules/ai/workPackets/contracts";
export * from "@/modules/ai/workPackets/persistence";
export * from "@/modules/ai/workPackets/registry";

export const workPacketRegistry = new WorkPacketRegistry(
  new TauriWorkPacketPersistence(),
);

export function inspectableWorkPacket(packet: WorkPacket) {
  return {
    packet,
    markdown: renderWorkPacketMarkdown(packet),
    suggestedPath: suggestedWorkPacketPath(packet),
  };
}

export async function buildActiveWorkPacketContext(
  projectId: string | null,
): Promise<string | null> {
  if (!projectId) return null;
  try {
    const packet = await workPacketRegistry.latestActive(projectId);
    if (!packet) return null;
    const capsule = resumeCapsule(packet);
    return [
      `<atlas_work_packet id="${packet.id}" status="${packet.status}">`,
      WORK_PACKET_REPO_TRUTH_RULE,
      capsule.markdown,
      "</atlas_work_packet>",
    ].join("\n");
  } catch {
    return null;
  }
}
