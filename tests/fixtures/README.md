# Test Fixtures

Tiny deterministic repositories for Atlas acceptance tests. Each is small enough to
reason about and snapshot. Copy a pristine fixture into a temp dir with the harness
(`src-tauri/tests/common`) rather than mutating these trees in place.

Plan reference: `ATLAS_EXECUTION_PLAN.md` section 7.2.

## Status

| Fixture | Status | First used by |
| --- | --- | --- |
| `simple-ts` | ready | Phase 1 read/edit, Phase 3 graph, Phase 4 LSP |
| `stale-edit` | ready | Phase 1 stale-edit rejection (S3) |
| `ignore-heavy` | ready | Phase 1 search, Phase 3 ignore policy |
| `symlink-escape` | deferred | Phase 1 native fs auth (built with Slice 1.1; symlinks created at runtime, not committed) |
| `proof-failure` | deferred | Phase 2/5 proof receipts |
| `mixed-stack` | deferred | Phase 3 multi-language inventory |
| `lsp-missing` | deferred | Phase 4 graceful LSP degradation |
| `memory-stale` | deferred | Phase 6 memory invalidation |

Deferred fixtures are created with the slice that first needs them, so their shape
matches a designed test instead of a guess.
