import { describe, expect, it } from "vitest";
import { MCP_CONNECTOR_STUDIES } from "@/modules/ai/mcp/studies";

describe("MCP connector studies", () => {
  it("keeps GitHub and Playwright study-only and disabled by default", () => {
    expect(MCP_CONNECTOR_STUDIES.map(({ id, disposition, enabledByDefault }) => ({
      id, disposition, enabledByDefault,
    }))).toEqual([
      { id: "github", disposition: "study_only", enabledByDefault: false },
      { id: "playwright", disposition: "study_only", enabledByDefault: false },
    ]);
  });
});
