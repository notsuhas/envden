# Changesets

Add one with `bunx changeset` for any change a user would notice. Name `@envden/cli` (and `@envden/server` when the server changes); the web app and server are versioned with the CLI.

`bun run release:version` turns the pending changesets into a version bump and `apps/cli/CHANGELOG.md` entries. See `packaging/README.md` for the rest of the release.
