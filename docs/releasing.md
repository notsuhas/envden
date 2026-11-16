# Release runbook (Go)

Releases are published from `main`. This branch builds the same artifacts natively but publishes nothing: CI's `compile` job runs `go/scripts/build-all.sh` and uploads the eight binaries as the `envden-go` workflow artifact, and the `container` job builds and smokes the server image without pushing it. Turning publishing on for these binaries follows the steps below.

## Artifacts

`go/scripts/build-all.sh [target...]` writes `go/dist/envden-<target>` for `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`, `linux-x64-musl`, `linux-arm64-musl`, `windows-x64` and `windows-arm64` (`.exe` on Windows). The names match the reference release, so the install scripts, Homebrew formula, Scoop manifest and self-update find them unchanged. Builds are static (`CGO_ENABLED=0`, `-trimpath`), so the musl targets are the same Go build with a different asset name. `ENVDEN_TELEMETRY_KEY` is baked in at build time; empty disables telemetry.

A release uploads the binaries and a `SHA256SUMS` file computed after any signing. Bootstrap scripts and self-updates check `SHA256SUMS` from the same GitHub release over HTTPS; integrity rests on GitHub and TLS. Published releases are immutable: after a partial failure, re-run only the failed jobs, never re-push a tag.

## macOS signing

With `MACOS_CERTIFICATE_P12` and the App Store Connect API secrets set (listed in `.env.example`), sign each darwin binary under the hardened runtime with identifier `dev.envden.cli`, notarize it and smoke the signed binary before hashing. A Go binary needs no JIT, so `packaging/macos/entitlements.plist` (which grants `allow-jit` for the Bun build) can be dropped for these binaries. A bare binary can't have its ticket stapled, so Gatekeeper checks it online the first time a quarantined copy runs; Homebrew, the install scripts and self-update download without the quarantine flag. A timestamped signature differs every time, so retries compare checksums only for the unsigned assets.

## Channels

- **Homebrew** (`packaging/homebrew/envden.rb`) and **Scoop** (`packaging/scoop/envden.json`) are templates filled with the version and the `SHA256SUMS` values, then pushed with the `ENVDEN_HOMEBREW_TAP_KEY` and `ENVDEN_SCOOP_BUCKET_KEY` deploy keys. Only the highest stable release moves them.
- **winget** manifests in `packaging/winget` are filled by hand for a PR to `microsoft/winget-pkgs`.
- **Install scripts** (`packaging/install`) accept `ENVDEN_VERSION=latest` or a stable `vX.Y.Z`, `ENVDEN_INSTALL_DIR` for the binary and `ENVDEN_HOME` for state.
- npm packaging is not part of this branch.

## Container

`packaging/docker/Dockerfile` copies the musl binary for the target architecture from a `release-artifacts` build context (`--build-context release-artifacts=./go/dist`), next to Tailscale from its pinned image. The Go binary is static, so the image needs only `ca-certificates`. It runs envden and userspace Tailscale as uid/gid 10001; `packaging/docker/compose.yml` drops capabilities and uses a read-only root, writable state volumes and temporary sockets. Health requires both the hello endpoint and a Running Tailscale backend. Images are tagged by exact version, minor and major, under `ENVDEN_GHCR_NAMESPACE`.

## Validation limits

Signing, notarization and publishing are not exercised on this branch. The cross-compiled binaries are smoke-tested only for the CI runner's platform and inside the Alpine image.
