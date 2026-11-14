# Release runbook

Publishing stops until the maintainer configures these values.

## Release setup

Done:

- GitHub environment `release` accepts only `v*` tags. `ENVDEN_GHCR_NAMESPACE=notsuhas` selects the image namespace.
- Channels: npm name `envden`, Homebrew tap `notsuhas/homebrew-tap` (`brew install notsuhas/tap/envden`), Scoop bucket `notsuhas/scoop-bucket`, winget identifier `notsuhas.envden`.

Still needed:

- Homebrew and Scoop are published by hand after each release with `publish-channels.ts` (below); winget submission is manual too.
- npm: the release workflow's `npm` job publishes with trusted publishing (`npm trust github envden --file release.yml --repo notsuhas/envden --env release`). No token is stored.
- After the first image push, make the GHCR package public.
- `ENVDEN_TELEMETRY_KEY` (repository variable): a PostHog project key. Empty disables telemetry.
- `TS_AUTHKEY` at deployment, never at build time. Enable HTTPS certificates and Serve in the tailnet.

## First release order

1. 0.1.0 shipped as an alpha. Outstanding: independent human review of PROTOCOL and its implementation, the editor/tool link-mode compatibility matrix, and installer testing on disposable Windows, macOS, glibc and musl hosts.
2. Match CLI and server versions to the stable vX.Y.Z tag. Run three-OS CI and compiled smoke tests. Test installers on disposable Windows, macOS, glibc and musl hosts.
3. Push the approved tag. Verify all eight binaries and SHA256SUMS. GHCR stages amd64/arm64 images by digest using the musl binary artifacts, then promotes exact, minor, major and latest tags after release publication.
4. Independently verify binaries and checksums. Publish package channels through maintainer accounts, and test fresh installation and update.

## Publish package channels

After verifying a release, run from the repository root with `gh` authenticated and Git push access to both channel repositories:

```sh
bun scripts/release/publish-channels.ts <version>
```

Use the version without `v`. Add `--dry-run` to render and print diffs without committing or pushing. The script downloads SHA256SUMS from the requested tag, validates all CLI targets, pushes only the envden formula and Scoop manifest, and adds a Scoop README if missing. It keeps rendered files in the printed temporary directory, including the npm package with `private: true`. The release workflow publishes npm itself through `scripts/release/npm-package.ts`.

winget manifests go to `packaging/dist/winget/<version>/`. Follow the printed instructions to open the PR in `microsoft/winget-pkgs` yourself. Dry runs keep winget manifests in the temporary directory too.

## Installer and container limits

Bootstrap shell/PowerShell installers and later self-updates verify SHA256SUMS from the same release. Integrity rests on GitHub and TLS. npm downloads its exact package version and checks package-pinned hashes, without runtime dependencies. Its launcher sets ENVDEN_INSTALL_METHOD=npm. Scoop records its marker. The CLI detects Homebrew Cellar and winget paths. If npm install scripts are disabled, its launcher prints the exact `node .../install.js` command needed to finish installation.

The container uses userspace Tailscale, with no TUN device, privileged mode or published host port. Both processes run as uid 10001. Existing root-owned state volumes must be migrated to uid/gid 10001 before upgrading. The shell supervises and shuts down both children. Application and Tailscale state use separate volumes. Update with docker compose pull && docker compose up -d. Base images use multi-arch index digests and apk versions are pinned. Compose drops all capabilities, mounts a read-only root with writable state volumes and temporary sockets, and checks hello and Tailscale status. Docker builds require the downloaded musl release artifacts in `release/`, passed with `--build-context release-artifacts=./release`.

## Release execution coverage

All eight targets have smoke steps on matching hosted runners; musl builds run in Alpine containers on their native architecture. No target is intentionally shipped without execution. The new matrix still needs its first CI run, including Windows arm64 runner availability. Local checks cannot substitute for that run.

winget manifests are generated locally but are not yet published in `microsoft/winget-pkgs`. Scoop uses bucket name `notsuhas` for `notsuhas/scoop-bucket`.
