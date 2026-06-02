import { describe, expect, it } from "vitest";
import { buildMemoryLabReport, MEMORY_LAB_FIXTURE } from "@/modules/ai/memory/memoryLab";

describe("MemoryLab", () => {
  it("keeps LocalRecords default and advanced providers optional", () => {
    const report = buildMemoryLabReport(
      {
        provider: "local_records",
        projectId: "/repo",
        total: 0,
        active: 0,
        stale: 0,
        superseded: 0,
        deleted: 0,
      },
      {
        provider: "simplemem",
        status: "disabled",
        optional: true,
        detail: "disabled",
      },
    );
    expect(report.defaultProvider).toBe("local_records");
    expect(report.fixtureCases).toBe(MEMORY_LAB_FIXTURE.length);
    expect(report.simpleMem.status).toBe("disabled");
    expect(report.mem0.status).toBe("benchmark_only");
    expect(report.measures).toContain("stale_fact_rejection");
  });
});
