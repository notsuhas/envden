# Release runbook

Publishing stops until the maintainer configures these values. Backup seeds never belong in CI.

## Release setup

Done:

- GitHub environment `release` accepts only `v*` tags and holds the secret `ENVDEN_RELEASE_PRIMARY_SEED_HEX`. `ENVDEN_GHCR_NAMESPACE=notsuhas` selects the image namespace; signing trust comes from the CLI built-in keys.
- Both generation-1 public keys are pinned in `apps/cli/src/updates/release-config.ts`. The backup seed was generated offline in `~/envden-release-keys/` on the maintainer's machine; move it to a password manager and delete the folder. It never goes to CI.
- First-release mode is only for an unpublished generation. Delete `ENVDEN_FIRST_RELEASE` after bootstrap; it never resets an existing published sequence.
- Channels: npm name `envden`, Homebrew tap `notsuhas/homebrew-tap` (`brew install notsuhas/tap/envden`), Scoop bucket `notsuhas/scoop-bucket`, winget identifier `notsuhas.envden`.

Still needed:

- Before the next Monday run, create environment `release-resign`, allow deployments only from branch `main`, add secret `ENVDEN_RELEASE_PRIMARY_SEED_HEX` with the same seed as `release`, and require a reviewer. Keep `release` restricted to `v*` tags. A reviewer must approve each weekly run before the feed expires.

- npm: the release workflow's `npm` job publishes with trusted publishing (`npm trust github envden --file release.yml --repo notsuhas/envden --env release`). No token is stored.
- After the first image push, make the GHCR package public.
- `ENVDEN_TELEMETRY_KEY` (repository variable): a PostHog project key. Empty disables telemetry.
- `TS_AUTHKEY` at deployment, never at build time. Enable HTTPS certificates and Serve in the tailnet.
- `ENVDEN_UNSAFE_VERSIONS` optionally adds comma-separated versions to the feed's unsafe list.

## First release order

1. 0.1.0 shipped as an alpha. Outstanding: independent human review of PROTOCOL and its implementation, the editor/tool link-mode compatibility matrix, and installer testing on disposable Windows, macOS, glibc and musl hosts.
2. Match CLI and server versions to the stable vX.Y.Z tag. Run three-OS CI and compiled smoke tests. Test installers on disposable Windows, macOS, glibc and musl hosts.
3. Enable first-release mode and push the approved tag. Verify all eight binaries, SHA256SUMS, release.bin and release-g<n>.bin. GHCR stages amd64/arm64 images by digest using the signed musl binary artifacts, then promotes exact, minor, major and latest tags after feed publication.
4. Remove first-release mode. Independently verify signatures and binaries. Populate package-manager hashes from the verified feed, publish templates through maintainer accounts, and test fresh installation and update.
5. Confirm the weekly job increments seq and refreshes the 30-day expiry. It reuses release binaries and replaces only feeds. Do not manually publish feeds while CI runs.

## Publish package channels

After verifying a release, run from the repository root with `gh` authenticated and Git push access to both channel repositories:

```sh
bun scripts/release/publish-channels.ts <version>
```

Use the version without `v`. Add `--dry-run` to render and print diffs without committing or pushing. The script verifies the generation feed against the CLI built-in primary, checks its version and expiry, derives checksums, validates all CLI targets, pushes only the envden formula and Scoop manifest, and adds a Scoop README if missing. It keeps rendered files in the printed temporary directory, including the npm package with `private: true`. The release workflow publishes npm itself through `scripts/release/npm-package.ts`.

winget manifests go to `packaging/dist/winget/<version>/`. Follow the printed instructions to open the PR in `microsoft/winget-pkgs` yourself. Dry runs keep winget manifests in the temporary directory too.

## Offline backup and rotation

The signer uses @envden/core/protocol codecs and Sign/Verify, verifies the previous primary signature, preserves unsafe entries and increments seq. It refuses revocation/rotation feeds.

Disable automated signing for backup recovery. On an offline machine independently verify the last trusted feed. Using core codecs, preserve unsafe entries, bump seq above every backup-signed feed, set revokePrimary=1 and/or next={primary,backup}, then Sign(backupSeed, "release", body) with signature key=1. Independently verify the output. Transfer only signed bytes for publishing as release-g<n>.bin; never transfer the backup seed to CI. Keep all older generation chain feeds available side by side and publish the new generation feed too. Update the CLI built-in generation and keys only after testing the full rotation chain. The workflow signs one active generation and copies every earlier generation feed from the previous release unchanged. Missing older feeds stop publication.

## Installer and container limits

Bootstrap shell/PowerShell installers verify SHA256SUMS over HTTPS, not the signed feed. State that limit beside published bootstrap commands. Later self-update requires the pinned feed verifier in the CLI. npm downloads its exact package version and checks package-pinned hashes, without runtime dependencies. Its launcher sets ENVDEN_INSTALL_METHOD=npm. Scoop records its marker. The CLI detects Homebrew Cellar and winget paths. If npm install scripts are disabled, its launcher prints the exact `node .../install.js` command needed to finish installation.

The container uses userspace Tailscale, with no TUN device, privileged mode or published host port. Both processes run as uid 10001. Existing root-owned state volumes must be migrated to uid/gid 10001 before upgrading. The shell supervises and shuts down both children. Application and Tailscale state use separate volumes. Update with docker compose pull && docker compose up -d. Base images use multi-arch index digests and apk versions are pinned. Compose drops all capabilities, mounts a read-only root with writable state volumes and temporary sockets, and checks hello and Tailscale status. Docker builds require the downloaded musl release artifacts in `release/`, passed with `--build-context release-artifacts=./release`.

## Release execution coverage

All eight targets have smoke steps on matching hosted runners; musl builds run in Alpine containers on their native architecture. No target is intentionally shipped without execution. The new matrix still needs its first CI run, including Windows arm64 runner availability. Local checks cannot substitute for that run.

The feed publication job uses a shared concurrency group with `queue: max` and `cancel-in-progress: false`; tag builds and weekly runs have separate outer groups. GitHub queues up to 100 pending publication jobs. Never publish feeds outside this job while it runs.

winget manifests are generated locally but are not yet published in `microsoft/winget-pkgs`. Scoop uses bucket name `notsuhas` for `notsuhas/scoop-bucket`.
