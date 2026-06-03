# Test Fixtures

Tiny deterministic repositories for Atlas acceptance tests. Each is small enough to
reason about and snapshot. Copy a pristine fixture into a temp dir with the harness
(`src-tauri/tests/common`) rather than mutating these trees in place.

Release reference: `RELEASE_QUALIFICATION.md`.

## Status

| Fixture | Status | First used by |
| --- | --- | --- |
| `simple-ts` | ready | Phase 1 read/edit, Phase 3 graph, Phase 4 LSP |
| `stale-edit` | ready | Phase 1 stale-edit rejection (S3) |
| `ignore-heavy` | ready | Phase 1 search, Phase 3 ignore policy |
| `symlink-escape` | deferred | Phase 1 native fs auth (built with Slice 1.1; symlinks created at runtime, not committed) |
| `proof-failure` | deferred | Phase 2/5 proof receipts |
| `mixed-stack` | ready | Phase 3 multi-language inventory and projection |
| `mcp-stdio` | ready | Corrective C4 RMCP initialize, tool call, reuse, and close |
| `lsp-missing` | deferred | Phase 4 graceful LSP degradation |
| `memory-stale` | ready | Phase 6 memory invalidation |
| `golden-v1` | ready | Phase 10 deterministic release demo |

Deferred fixtures are created with the slice that first needs them, so their shape
matches a designed test instead of a guess.
