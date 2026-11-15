# Changesets

Add one with `bunx changeset` for any change a user would notice. Name `@envden/cli` (and `@envden/server` when the server changes); the server is versioned with the CLI. Web-only changes need no changeset; they deploy when merged to main.

`bun run release:version` turns the pending changesets into a version bump and `apps/cli/CHANGELOG.md` entries. See `docs/releasing.md` for the rest of the release.
