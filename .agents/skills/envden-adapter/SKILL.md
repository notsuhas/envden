---
name: envden-adapter
description: Add or change an envden adapter (network, repo, storage, keychain, placement, shell, or a new kind). Use when asked to write an adapter, support a new backend such as NetBird, Jujutsu, S3 or 1Password, or change an adapter interface.
---

# Writing an envden adapter

Read `docs/adapters.md` first and follow its checklist in order. Read `AGENTS.md` for the code rules.

## Steps

1. Pick the kind. If the integration answers a question no existing kind covers, add the interface to `packages/core/src/adapters`, then the contract suite and fake to `packages/testing`, before any implementation.
2. Read the interface and its contract suite in `packages/testing/src/<kind>/contract.ts`.
3. Create the package, then link it:

   ```sh
   bun scripts/new-adapter.ts <kind> <impl>
   bun install
   ```

4. Implement `src/adapter.ts` until `src/__tests__/contract.test.ts` passes. Copy the structure of `packages/adapters/placement/fs`.
5. Wire it in `apps/cli/src/adapters.ts` or `apps/server/src/adapters.ts`, and add the package to that app's `package.json`.
6. Run the checks:

   ```sh
   ./node_modules/.bin/vp check --fix
   bun test
   ./node_modules/.bin/fallow
   ```

## Rules that are easy to break

- Never branch on which adapter is in use. Add a capability to the interface and read that.
- An adapter imports only `@envden/core`, plus `@envden/testing` in tests.
- Errors are `EnvdenError` with fixed message text and the underlying error in `cause`. No env file contents, keys, tokens or passwords in a message, log line or error field.
- Fail closed: when a check can't be made, refuse.
- Tests use temp directories and injected runners. They never touch the real keychain, the user's home or a real tailnet.
- Don't make crypto, sync or merge pluggable.
