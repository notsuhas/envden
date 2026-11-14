# Release runbook

Publishing stops until the maintainer configures these values. Backup seeds never belong in CI.

## Release setup

Done:

- GitHub environment `release` accepts only `v*` tags and holds the secret `ENVDEN_RELEASE_PRIMARY_SEED_HEX`. Repository variables `ENVDEN_RELEASE_PRIMARY_PUBLIC_HEX`, `ENVDEN_RELEASE_GENERATION=1` and `ENVDEN_GHCR_NAMESPACE=notsuhas` are set.
- Both generation-1 public keys are pinned in `apps/cli/src/updates/release-config.ts`. The backup seed was generated offline in `~/envden-release-keys/` on the maintainer's machine; move it to a password manager and delete the folder. It never goes to CI.
- `ENVDEN_FIRST_RELEASE=1` is set. Delete it right after the first release publishes; later runs need the previous signed feed.
- Channels: npm name `envden`, Homebrew tap `notsuhas/homebrew-tap` (`brew install notsuhas/tap/envden`), Scoop bucket `notsuhas/scoop-bucket`, winget identifier `notsuhas.envden`.

Still needed:

- npm: the release workflow's `npm` job publishes with trusted publishing (`npm trust github envden --file release.yml --repo notsuhas/envden --env release`). No token is stored.
- After the first image push, make the GHCR package public.
- `ENVDEN_TELEMETRY_KEY` (repository variable): a PostHog project key. Empty disables telemetry.
- `TS_AUTHKEY` at deployment, never at build time. Enable HTTPS certificates and Serve in the tailnet.
- `ENVDEN_UNSAFE_VERSIONS` optionally adds comma-separated versions to the feed's unsafe list.

## First release order

1. 0.1.0 ships as an alpha. PROTOCOL and the implementation were reviewed by AI reviewers only; get an independent human review before calling it stable. Finish DESIGN's editor/tool link-mode matrix.
2. Match CLI and server versions to the stable vX.Y.Z tag. Run three-OS CI and compiled smoke tests. Test installers on disposable Windows, macOS, glibc and musl hosts.
3. Enable first-release mode and push the approved tag. Verify all eight binaries, SHA256SUMS, release.bin and release-g<n>.bin. GHCR receives amd64/arm64 images tagged exact, minor and major version.
4. Remove first-release mode. Independently verify signatures and binaries. Populate package-manager hashes from the verified feed, publish templates through maintainer accounts, and test fresh installation and update.
5. Confirm the weekly job increments seq and refreshes the 30-day expiry. It reuses release binaries and replaces only feeds. Do not manually publish feeds while CI runs.

## Publish package channels

After verifying a release, run from the repository root with `gh` authenticated and Git push access to both channel repositories:

```sh
bun scripts/release/publish-channels.ts <version>
```

Use the version without `v`. Add `--dry-run` to render and print diffs without committing or pushing. The script downloads `SHA256SUMS`, validates all CLI targets, pushes only the envden formula and Scoop manifest, and adds a Scoop README if missing. It keeps rendered files in the printed temporary directory, including the npm package with `private: true`. The release workflow publishes npm itself through `scripts/release/npm-package.ts`.

winget manifests go to `packaging/dist/winget/<version>/`. Follow the printed instructions to open the PR in `microsoft/winget-pkgs` yourself. Dry runs keep winget manifests in the temporary directory too.

## Offline backup and rotation

The signer uses @envden/core/protocol codecs and Sign/Verify, verifies the previous primary signature, preserves unsafe entries and increments seq. It refuses revocation/rotation feeds.

Disable automated signing for backup recovery. On an offline machine independently verify the last trusted feed. Using core codecs, preserve unsafe entries, bump seq above every backup-signed feed, set revokePrimary=1 and/or next={primary,backup}, then Sign(backupSeed, "release", body) with signature key=1. Independently verify the output. Transfer only signed bytes for publishing as release-g<n>.bin; never transfer the backup seed to CI. Keep all older generation chain feeds available side by side and publish the new generation feed too. Update CI generation and primary only after testing the full rotation chain. The workflow handles one active generation; carrying forward older chain assets on every new release is a maintainer-managed step during rotation.

## Installer and container limits

Bootstrap shell/PowerShell installers verify SHA256SUMS over HTTPS, not the signed feed. State that limit beside published bootstrap commands. Later self-update requires the pinned feed verifier in the CLI. npm downloads its exact package version and checks package-pinned hashes, without runtime dependencies. Its launcher sets ENVDEN_INSTALL_METHOD=npm. Scoop records its marker. Homebrew and winget cannot safely write per-user state during installation; set ENVDEN_INSTALL_METHOD=brew/winget or provide manual manager instructions if no marker exists.

The container uses userspace Tailscale, with no TUN device, privileged mode or published host port. Root manages tailscaled and volume ownership; envden runs as uid 10001. The shell supervises and shuts down both children. Application and Tailscale state use separate volumes. Update with docker compose pull && docker compose up -d. Review and pin base-image digests before production.
