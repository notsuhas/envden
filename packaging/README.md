# Release runbook

A stable `vX.Y.Z` tag matching the CLI and server starts the release workflow. It builds and smoke-tests eight binaries, stages a multi-architecture GHCR image, uploads `SHA256SUMS`, then publishes the GitHub release. npm uses trusted publishing; Homebrew uses the release environment's `ENVDEN_HOMEBREW_TAP_KEY` deploy key. `ENVDEN_GHCR_NAMESPACE` selects the image namespace. No npm token is stored.

Only the highest stable release moves GitHub Latest, Docker latest/major/minor tags and the Homebrew formula. Backports retain exact image tags and use npm's `backport` tag. Release creation, asset uploads, npm publication and unchanged formula pushes can be retried.

## Version bumps

Update `apps/{cli,server,web}/package.json` and `packaging/npm/package.json`, then run `bun install` to refresh `bun.lock`. `apps/web/src/lib/site.ts` derives `ENVDEN_VERSION` from the web manifest. Update the getting-started version output; its test rejects stale examples. Run the root checks, web build and three-OS CI before requesting approval to tag.

## Manual channels

Scoop and winget are published manually and may lag a release.

After verifying the release, a maintainer with channel repository access can run:

```sh
bun scripts/release/publish-channels.ts <version> --dry-run
```

Use the version without `v`. Removing `--dry-run` pushes the Homebrew formula and Scoop manifest. Homebrew is normally already current from the workflow. winget manifests are generated for a manual PR to `microsoft/winget-pkgs`; they are not yet published there. Never run this against an older release when a newer formula exists.

GHCR visibility could not be checked with the available token, which lacks `read:packages`. If the package is private, a maintainer must make it public after an image push. Configure `ENVDEN_TELEMETRY_KEY` only if telemetry is wanted; an empty value disables it.

## Installers and containers

Bootstrap scripts and self-updates check `SHA256SUMS` from the same GitHub release over HTTPS. Integrity rests on GitHub and TLS. npm checks package-pinned hashes; its launcher explains how to finish installation if install scripts were disabled.

Both bootstrap scripts accept `ENVDEN_VERSION=latest` or a stable `vX.Y.Z` tag without leading zeros, `ENVDEN_INSTALL_DIR` for binaries, and `ENVDEN_HOME` for state.

The container runs envden and userspace Tailscale as uid/gid 10001. Migrate older root-owned volumes before upgrading. Compose drops capabilities and uses a read-only root, writable state volumes and temporary sockets. Health requires both the hello endpoint and a Running Tailscale backend. `TS_AUTHKEY` is required only when Tailscale needs login; enable HTTPS certificates and Serve in the tailnet. Update with `docker compose pull && docker compose up -d`.

Docker builds require musl binaries through `--build-context release-artifacts=./release`. CI builds and smokes an x64 musl binary and builds the hardened image without pushing, exercising the pinned apk revisions before tag time.

## Validation limits

The tag workflow cannot be executed locally. Its eight-target smoke matrix, Windows arm64 runner availability and publishing credentials still require confirmation from an actual tag run. Disposable-host installer tests on Windows, macOS, glibc and musl, the editor/tool link-mode matrix, and independent human review of the protocol and implementation remain unvalidated here.
