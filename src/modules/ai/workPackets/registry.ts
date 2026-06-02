import {
  WORK_PACKETS_PER_PROJECT,
  type CreateWorkPacketInput,
  type WorkPacket,
} from "@/modules/ai/workPackets/contracts";
import { resumeCapsule } from "@/modules/ai/workPackets/compiler";
import type { WorkPacketPersistence } from "@/modules/ai/workPackets/persistence";

const projectKey = (projectId: string) => `project:${projectId}`;
const packetKey = (packetId: string) => `packet:${packetId}`;

export type WorkPacketRegistryOptions = {
  clock?: () => number;
  idFactory?: () => string;
  maxPacketsPerProject?: number;
};

function defaultId(): string {
  return `wp-${crypto.randomUUID()}`;
}

function normalizeId(id: string, label: string): string {
  const normalized = id.trim();
  if (!normalized) throw new Error(`work packet ${label} cannot be empty`);
  return normalized;
}

export class WorkPacketRegistry {
  private readonly clock: () => number;
  private readonly idFactory: () => string;
  private readonly maxPacketsPerProject: number;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly persistence: WorkPacketPersistence,
    options: WorkPacketRegistryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? defaultId;
    this.maxPacketsPerProject =
      options.maxPacketsPerProject ?? WORK_PACKETS_PER_PROJECT;
  }

  create(input: CreateWorkPacketInput): Promise<WorkPacket> {
    return this.mutate(async () => {
      const projectId = normalizeId(input.projectId, "project id");
      const timestamp = this.clock();
      const packet: WorkPacket = {
        ...input,
        projectId,
        sessionId: normalizeId(input.sessionId, "session id"),
        id: normalizeId(this.idFactory(), "id"),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const previous =
        (await this.persistence.get<string[]>(projectKey(projectId))) ?? [];
      const ids = [packet.id, ...previous.filter((id) => id !== packet.id)];
      const retained = ids.slice(0, this.maxPacketsPerProject);
      await this.persistence.set(packetKey(packet.id), packet);
      await this.persistence.set(projectKey(projectId), retained);
      for (const removed of ids.slice(this.maxPacketsPerProject)) {
        await this.persistence.delete(packetKey(removed));
      }
      await this.persistence.save();
      return packet;
    });
  }

  async list(projectId: string): Promise<WorkPacket[]> {
    await this.writes;
    const normalized = normalizeId(projectId, "project id");
    const ids =
      (await this.persistence.get<string[]>(projectKey(normalized))) ?? [];
    const packets = await Promise.all(
      ids.map((id) => this.persistence.get<WorkPacket>(packetKey(id))),
    );
    return packets.filter(
      (packet): packet is WorkPacket =>
        packet !== undefined && packet.projectId === normalized,
    );
  }

  async get(projectId: string, packetId: string): Promise<WorkPacket | null> {
    await this.writes;
    const packet = await this.persistence.get<WorkPacket>(
      packetKey(normalizeId(packetId, "id")),
    );
    return packet?.projectId === normalizeId(projectId, "project id")
      ? packet
      : null;
  }

  async latestActive(projectId: string): Promise<WorkPacket | null> {
    return (
      (await this.list(projectId)).find((packet) => packet.status === "active") ??
      null
    );
  }

  async resume(projectId: string, packetId?: string) {
    const packet = packetId
      ? await this.get(projectId, packetId)
      : await this.latestActive(projectId);
    return packet ? resumeCapsule(packet) : null;
  }

  delete(projectId: string, packetId: string): Promise<boolean> {
    return this.mutate(async () => {
      const normalized = normalizeId(projectId, "project id");
      const packet = await this.persistence.get<WorkPacket>(
        packetKey(normalizeId(packetId, "id")),
      );
      if (!packet || packet.projectId !== normalized) return false;
      const ids =
        (await this.persistence.get<string[]>(projectKey(normalized))) ?? [];
      await this.persistence.set(
        projectKey(normalized),
        ids.filter((id) => id !== packet.id),
      );
      await this.persistence.delete(packetKey(packet.id));
      await this.persistence.save();
      return true;
    });
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writes.then(operation, operation);
    this.writes = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
