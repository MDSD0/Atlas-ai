import {
  SKILL_PACKAGES,
  type InstallSkillInput,
  type LocalSkillPackage,
  validateSkillInput,
} from "@/modules/ai/skills/contracts";
import type { SkillPersistence } from "@/modules/ai/skills/persistence";

const SKILLS_KEY = "packages";

export type SkillRegistryOptions = {
  clock?: () => number;
  idFactory?: () => string;
  maxPackages?: number;
};

function defaultId(): string {
  return `skill-${crypto.randomUUID()}`;
}

export class SkillRegistry {
  private readonly clock: () => number;
  private readonly idFactory: () => string;
  private readonly maxPackages: number;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly persistence: SkillPersistence,
    options: SkillRegistryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? defaultId;
    this.maxPackages = options.maxPackages ?? SKILL_PACKAGES;
  }

  install(input: InstallSkillInput): Promise<LocalSkillPackage> {
    return this.mutate(async () => {
      const validated = validateSkillInput(input);
      const packages = await this.listUnlocked();
      if (packages.some((skill) => skill.name === validated.name)) {
        throw new Error(`skill name already exists: ${validated.name}`);
      }
      const timestamp = this.clock();
      const skill: LocalSkillPackage = {
        id: this.idFactory(),
        ...validated,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await this.persist([skill, ...packages].slice(0, this.maxPackages));
      return skill;
    });
  }

  async list(): Promise<LocalSkillPackage[]> {
    await this.writes;
    return this.listUnlocked();
  }

  async inspect(id: string): Promise<LocalSkillPackage | null> {
    return (await this.list()).find((skill) => skill.id === id) ?? null;
  }

  async enabled(): Promise<LocalSkillPackage[]> {
    return (await this.list()).filter((skill) => skill.enabled);
  }

  setEnabled(id: string, enabled: boolean): Promise<boolean> {
    return this.mutate(async () => {
      const packages = await this.listUnlocked();
      const skill = packages.find((item) => item.id === id);
      if (!skill) return false;
      skill.enabled = enabled;
      skill.updatedAt = this.clock();
      await this.persist(packages);
      return true;
    });
  }

  remove(id: string): Promise<boolean> {
    return this.mutate(async () => {
      const packages = await this.listUnlocked();
      const next = packages.filter((skill) => skill.id !== id);
      if (next.length === packages.length) return false;
      await this.persist(next);
      return true;
    });
  }

  private async listUnlocked(): Promise<LocalSkillPackage[]> {
    return (await this.persistence.get<LocalSkillPackage[]>(SKILLS_KEY)) ?? [];
  }

  private async persist(packages: LocalSkillPackage[]): Promise<void> {
    await this.persistence.set(SKILLS_KEY, packages);
    await this.persistence.save();
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
