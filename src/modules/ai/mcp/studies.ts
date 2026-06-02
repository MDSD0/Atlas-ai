export const MCP_CONNECTOR_STUDIES = [
  {
    id: "github",
    disposition: "study_only",
    enabledByDefault: false,
    source: "github/github-mcp-server:docs/server-configuration.md",
    recommendation:
      "Adopt only with explicit tool selection, read-only mode where possible, exclusions for write tools, and credentials supplied outside persisted Atlas config.",
  },
  {
    id: "playwright",
    disposition: "study_only",
    enabledByDefault: false,
    source: "microsoft/playwright-mcp:README.md",
    recommendation:
      "Prefer CLI plus scoped skills for coding-agent throughput. Adopt MCP only when persistent browser state and rich iterative introspection justify the larger context surface.",
  },
] as const;
