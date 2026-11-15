# Release runbook

A stable `vX.Y.Z` tag matching the CLI and server starts the release workflow. It builds and smoke-tests eight binaries, stages a multi-architecture GHCR image, uploads `SHA256SUMS`, then publishes the GitHub release. npm uses trusted publishing; Homebrew and Scoop use the release environment's `ENVDEN_HOMEBREW_TAP_KEY` and `ENVDEN_SCOOP_BUCKET_KEY` deploy keys. `ENVDEN_GHCR_NAMESPACE` selects the image namespace. No npm token is stored.

Only the highest stable release moves GitHub Latest, Docker latest/major/minor tags and the Homebrew and Scoop manifests. Backports retain exact image tags and use npm's `backport` tag. Published releases are immutable. Retries compare rebuilt checksums with the published release and fail if they differ, except for signed macOS binaries (see [macOS signing](#macos-signing)). npm verifies an existing version's pinned hashes. Downstream jobs read published checksums and the published image digest.

After a partial failure, use "Re-run failed jobs" on the original run. Do not delete and re-push a tag or rebuild published binaries with "Re-run all jobs". Two consecutive local builds to the same output path matched, but byte identity across runners or toolchain changes is not guaranteed. If rebuilt hashes differ, re-run only failed jobs from the original run, or release a new version for changed binaries. A draft left by an interrupted upload is completed and published on retry.

## Version bumps

Add a changeset (`bunx changeset`) with each user-facing change. To cut a release, run `bun run release:version`: it applies the pending changesets to `apps/cli` and `apps/server` (versioned together; the site reads the CLI version and deploys from main on its own), writes `apps/cli/CHANGELOG.md`, syncs `packaging/npm/package.json` and the getting-started version output, refreshes `bun.lock` and formats. Run the root checks, web build and three-OS CI before requesting approval to tag.

## macOS signing

When `MACOS_CERTIFICATE_P12` is set, the macOS build jobs sign each darwin binary with a Developer ID certificate under the hardened runtime, notarize it and smoke the signed binary before hashing and upload. When it is empty, they log a notice and ship the ad-hoc signed binary as before. Every signed release keeps the identifier `dev.envden.cli` and team ID, so macOS treats each version as the same app.

A bare CLI binary can't have its notarization ticket stapled, so Gatekeeper checks it online the first time a downloaded copy runs. Homebrew, npm, the install scripts and self-update download without the quarantine flag and never trigger that check.

`packaging/macos/entitlements.plist` grants only `allow-jit`. Without it the binary still runs, but JavaScriptCore drops to its interpreter and `bun:ffi` fails. Bun's guide also lists `allow-unsigned-executable-memory`, `disable-executable-page-protection`, `allow-dyld-environment-variables` and `disable-library-validation`. envden doesn't need them, and the last two would let other code be loaded into envden.

A timestamped signature differs every time a binary is signed, so a rebuilt signed darwin binary never matches the published one. Retries therefore skip the checksum comparison for darwin assets while signing is on and compare the other six. Each signed binary is checked in its own build job instead: `codesign --verify --strict`, an online notarization check and a smoke run. Nothing is uploaded when the release is already published, and Homebrew, npm and Scoop read the published `SHA256SUMS`, which is computed after signing.

Add these as repository secrets, not `release` environment secrets, because the build jobs run outside that environment:

| Secret | Value |
| --- | --- |
| `MACOS_CERTIFICATE_P12` | Developer ID Application certificate and private key, `.p12`, base64 |
| `MACOS_CERTIFICATE_PASSWORD` | Password of that `.p12` |
| `APPLE_API_KEY_P8` | App Store Connect API key, `.p8`, base64 |
| `APPLE_API_KEY_ID` | Key ID of that API key |
| `APPLE_API_ISSUER_ID` | Issuer ID shown above the key list |

1. Certificate (needs the Account Holder role): Xcode → Settings → Accounts → Manage Certificates → + → Developer ID Application. In Keychain Access, under My Certificates, export "Developer ID Application: …" as a `.p12` with a password.
2. API key: App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → +, with the Developer role. Download `AuthKey_<KEY_ID>.p8` (it can be downloaded once) and note the Issuer ID.
3. Store them:

```sh
base64 -i developer-id.p12 | gh secret set MACOS_CERTIFICATE_P12
gh secret set MACOS_CERTIFICATE_PASSWORD
base64 -i AuthKey_<KEY_ID>.p8 | gh secret set APPLE_API_KEY_P8
gh secret set APPLE_API_KEY_ID --body <KEY_ID>
gh secret set APPLE_API_ISSUER_ID --body <ISSUER_ID>
```

Delete the local `.p12` and `.p8` afterwards. If the certificate is set but an API secret is missing, the macOS build jobs fail rather than publish binaries that aren't notarized.

## Manual channels

Homebrew and Scoop are published by the workflow. winget remains manual and may lag a release.

After verifying the release, a maintainer with channel repository access can run:

```sh
bun scripts/release/publish-channels.ts <version> --dry-run
```

Use the version without `v`. Removing `--dry-run` pushes the Homebrew formula and Scoop manifest. Both are normally already current from the workflow; this script is a manual fallback. winget manifests are generated for a manual PR to `microsoft/winget-pkgs`; they are not yet published there. Never run this against an older release when a newer formula exists.

GHCR visibility could not be checked with the available token, which lacks `read:packages`. If the package is private, a maintainer must make it public after an image push. Configure `ENVDEN_TELEMETRY_KEY` only if telemetry is wanted; an empty value disables it.

## Installers and containers

Bootstrap scripts and self-updates check `SHA256SUMS` from the same GitHub release over HTTPS. Integrity rests on GitHub and TLS. npm checks package-pinned hashes; its launcher explains how to finish installation if install scripts were disabled.

Both bootstrap scripts accept `ENVDEN_VERSION=latest` or a stable `vX.Y.Z` tag without leading zeros, `ENVDEN_INSTALL_DIR` for binaries, and `ENVDEN_HOME` for state.

The container runs envden and userspace Tailscale as uid/gid 10001. Compose drops capabilities and uses a read-only root, writable state volumes and temporary sockets. Health requires both the hello endpoint and a Running Tailscale backend. `TS_AUTHKEY` is required only when Tailscale needs login; enable HTTPS certificates and Serve in the tailnet. Update with `docker compose pull && docker compose up -d`.

Docker builds require musl binaries through `--build-context release-artifacts=./release`. CI builds and smokes an x64 musl binary and builds the hardened image without pushing, exercising the pinned apk revisions before tag time.

## Validation limits

The tag workflow cannot be executed locally. Its eight-target smoke matrix, Windows arm64 runner availability and publishing credentials still require confirmation from an actual tag run. Disposable-host installer tests on Windows, macOS, glibc and musl, the editor/tool link-mode matrix, and independent human review of the protocol and implementation remain unvalidated here.

## Rust binaries

The manual `rust-release.yml` workflow builds and smoke-tests the same eight platforms as TypeScript, then uploads binaries and `SHA256SUMS` as run artifacts. It never tags or publishes. Signing, notarization, GitHub releases, npm and image publication are disabled with `if: false` until Rust parity is accepted and each release integration is approved. The TypeScript release workflow is unchanged.
