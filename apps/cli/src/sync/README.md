# Sync API

B2 can call these functions directly. All receive the existing CLI adapters.

- `push(adapters, options)` and `pull(adapters, options)` from `engine.ts`.
- `firstRun(adapters, options)` from `first-run.ts`, with a per-file `choose` callback returning `keep-mine`, `take-server` or `merge`.
- `diff(adapters, options)` from `diff.ts`, returns key names only.
- `resolveConflict(adapters, options)` from `resolve.ts`, with `file` and `choice` (`keep-mine`, `take-server`, `edit`). Edit reads the conflict file after the caller edits it.
- `ISyncOptions` from `model.ts`: `now`, `fetcher`, `cwd`, `all`, `yes`, `interactive`, `confirm` and `report`.
- `createClient` retains `request` and `forVault`; `rpc` provides Hono's typed routes over the same signing layer.

`--yes` confirms clean merges, never checkout approval or conflicts. Sync only uses approved checkouts. Operations are serialized per device home. Results contain counts and paths, never values.

Integration outside B1's owned paths: call `commandNotice(adapters, now, fetcher)` from `notice/command.ts` in the program's pre-action hook and print `repos` to stderr. `status --refresh-cache` already performs the remote refresh; shell adapters already detach that command after 60 seconds. The update check runs in `commandNotice`, respects config and environment opt-outs, and never blocks commands on feed failure.

Aliasing a repo with placed files is refused. Unlink its files before assigning the alias so pulls and pushes cannot disagree about their store identity.
