# Release runbook

Releases of the published `envden` still come from the TypeScript build on `main`. This branch builds the Rust binaries but publishes nothing.

## Rust binaries

The manual `rust-release.yml` workflow builds the eight platform binaries with `cargo build --locked --release -p envden-cli`, smoke-tests each one (`--version`, `--help`, `doctor --json` under a temporary `ENVDEN_HOME`; musl builds run inside Alpine), and uploads the binaries and `SHA256SUMS` as run artifacts. It never tags or publishes. Signing, notarization, GitHub releases and image publication are disabled with `if: false` until a Rust release is approved and each integration is set up.

| Platform | Target |
| --- | --- |
| darwin-x64, darwin-arm64 | `x86_64-apple-darwin`, `aarch64-apple-darwin` |
| linux-x64, linux-arm64 | `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu` |
| linux-x64-musl, linux-arm64-musl | `x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl` |
| windows-x64, windows-arm64 | `x86_64-pc-windows-msvc`, `aarch64-pc-windows-msvc` |

Asset names are `envden-<platform>` (`.exe` on Windows), the same names the install scripts, self-update and the Homebrew and Scoop templates expect.

## Version

The version lives once, in `[workspace.package]` in the root `Cargo.toml`, and must match the TypeScript release it mirrors. Bump it there and refresh `Cargo.lock` with `cargo update -w`.

## Channels

`packaging/homebrew/envden.rb` and `packaging/scoop/envden.json` are templates: `{{VERSION}}` and `{{SHA256_<PLATFORM>}}` come from the release's `SHA256SUMS`. winget manifests in `packaging/winget` are filled by hand for a PR to `microsoft/winget-pkgs`. The install scripts in `packaging/install` download a release asset and check it against `SHA256SUMS` from the same release over HTTPS.

## Container

`packaging/docker/Dockerfile` takes the musl binaries through `--build-context release-artifacts=<dir with envden-linux-*-musl>`:

```sh
docker buildx build -f packaging/docker/Dockerfile --build-context release-artifacts=./dist .
```

The binary is static, so the image needs only `ca-certificates`, Tailscale and the entrypoint. It runs envden and userspace Tailscale as uid/gid 10001. Compose drops capabilities and uses a read-only root, writable state volumes and temporary sockets. Health requires both the hello endpoint and a Running Tailscale backend. `TS_AUTHKEY` is required only when Tailscale needs login.

## macOS signing

When signing is enabled, darwin binaries are signed with a Developer ID certificate under the hardened runtime, notarized and smoke-tested before hashing. A native binary needs no JIT entitlement, so it is signed without `packaging/macos/entitlements.plist`. Every signed release keeps the identifier `dev.envden.cli` and team ID. The secrets are the same as the TypeScript release's: `MACOS_CERTIFICATE_P12`, `MACOS_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`.

## Validation limits

The workflow can't run locally. The eight-target matrix, Windows arm64 runner availability and any publishing credentials need an actual run to confirm.
