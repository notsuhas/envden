# Release runbook

A stable `vX.Y.Z` tag matching the CLI and server starts the release workflow. It builds and smoke-tests six binaries (macOS and Linux, arm64 and x64, with glibc and musl builds for Linux), stages a multi-architecture GHCR image, uploads `SHA256SUMS`, then publishes the GitHub release. Homebrew uses the release environment's `ENVDEN_HOMEBREW_TAP_KEY` deploy key. `ENVDEN_GHCR_NAMESPACE` selects the image namespace.

Only the highest stable release moves GitHub Latest, Docker latest/major/minor tags and the Homebrew formula. Backports retain exact image tags. Published releases are immutable. Retries compare rebuilt checksums with the published release and fail if they differ, except for signed macOS binaries (see [macOS signing](#macos-signing)). Downstream jobs read published checksums and the published image digest.

After a partial failure, use "Re-run failed jobs" on the original run. Do not delete and re-push a tag or rebuild published binaries with "Re-run all jobs". Two consecutive local builds to the same output path matched, but byte identity across runners or toolchain changes is not guaranteed. If rebuilt hashes differ, re-run only failed jobs from the original run, or release a new version for changed binaries. A draft left by an interrupted upload is completed and published on retry.

## Version bumps

Add a changeset (`bunx changeset`) with each user-facing change. To cut a release, run `bun run release:version`: it applies the pending changesets to `apps/cli` and `apps/server` (versioned together; the site reads the CLI version and deploys from main on its own), writes `apps/cli/CHANGELOG.md`, syncs the getting-started version output, refreshes `bun.lock` and formats. Run the root checks, web build and CI before requesting approval to tag.

## macOS signing

When `MACOS_CERTIFICATE_P12` is set, the macOS build jobs sign each darwin binary with a Developer ID certificate under the hardened runtime, notarize it and smoke the signed binary before hashing and upload. When it is empty, they log a notice and ship the ad-hoc signed binary as before. Every signed release keeps the identifier `dev.envden.cli` and team ID, so macOS treats each version as the same app.

A bare CLI binary can't have its notarization ticket stapled, so Gatekeeper checks it online the first time a downloaded copy runs. Homebrew, the install script and self-update download without the quarantine flag and never trigger that check.

`packaging/macos/entitlements.plist` grants only `allow-jit`. Without it the binary still runs, but JavaScriptCore drops to its interpreter and `bun:ffi` fails. Bun's guide also lists `allow-unsigned-executable-memory`, `disable-executable-page-protection`, `allow-dyld-environment-variables` and `disable-library-validation`. envden doesn't need them, and the last two would let other code be loaded into envden.

A timestamped signature differs every time a binary is signed, so a rebuilt signed darwin binary never matches the published one. Retries therefore skip the checksum comparison for darwin assets while signing is on and compare the other four. Each signed binary is checked in its own build job instead: `codesign --verify --strict`, an online notarization check and a smoke run. Nothing is uploaded when the release is already published, and Homebrew reads the published `SHA256SUMS`, which is computed after signing.

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

## Manual Homebrew publishing

The workflow publishes the Homebrew formula. If that job fails, a maintainer with tap access can run this after verifying the release:

```sh
bun scripts/release/publish-channels.ts <version> --dry-run
```

Use the version without `v`. Removing `--dry-run` pushes the formula. Never run this against an older release when a newer formula exists.

GHCR visibility could not be checked with the available token, which lacks `read:packages`. If the package is private, a maintainer must make it public after an image push. Configure `ENVDEN_TELEMETRY_KEY` only if telemetry is wanted; an empty value disables it.

## Installers and containers

The install script and self-updates check `SHA256SUMS` from the same GitHub release over HTTPS. Integrity rests on GitHub and TLS.

The install script accepts `ENVDEN_VERSION=latest` or a stable `vX.Y.Z` tag without leading zeros, `ENVDEN_INSTALL_DIR` for binaries, and `ENVDEN_HOME` for state.

The container runs envden and userspace Tailscale as uid/gid 10001. Compose drops capabilities and uses a read-only root, writable state volumes and temporary sockets. Health requires both the hello endpoint and a Running Tailscale backend. `TS_AUTHKEY` is required only when Tailscale needs login; enable HTTPS certificates and Serve in the tailnet. Update with `docker compose pull && docker compose up -d`.

Docker builds require musl binaries through `--build-context release-artifacts=./release`. CI builds and smokes an x64 musl binary and builds the hardened image without pushing, exercising the pinned apk revisions before tag time.

## Validation limits

The tag workflow cannot be executed locally. Its six-target smoke matrix and publishing credentials still require confirmation from an actual tag run. Disposable-host installer tests on macOS, glibc and musl, the editor/tool link-mode matrix, and independent human review of the protocol and implementation remain unvalidated here.
