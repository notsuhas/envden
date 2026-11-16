<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/header/graph.svg?title=envden&subtitle=Your+.env+files%2C+on+every+machine%2C+encrypted+end+to+end&align=left&theme=emerald&mode=dark" />
    <img alt="envden" src="https://shieldcn.dev/header/graph.svg?title=envden&subtitle=Your+.env+files%2C+on+every+machine%2C+encrypted+end+to+end&align=left&theme=emerald&mode=light" />
  </picture>
</p>

<p align="center">
  <a href="https://github.com/notsuhas/envden/releases"><img alt="Latest release" src="https://shieldcn.dev/github/release/notsuhas/envden.svg?variant=secondary" /></a>
  <a href="https://github.com/notsuhas/envden/actions/workflows/go.yml"><img alt="CI status" src="https://shieldcn.dev/github/ci/notsuhas/envden.svg?variant=secondary" /></a>
  <a href="LICENSE"><img alt="License" src="https://shieldcn.dev/github/license/notsuhas/envden.svg?variant=secondary" /></a>
  <a href="https://github.com/notsuhas/envden/stargazers"><img alt="GitHub stars" src="https://shieldcn.dev/github/stars/notsuhas/envden.svg?variant=secondary" /></a>
  <a href="https://github.com/notsuhas/envden/commits/main"><img alt="Last commit" src="https://shieldcn.dev/github/last-commit/notsuhas/envden.svg?variant=secondary" /></a>
  <a href="docs/PROTOCOL.md"><img alt="End-to-end encrypted" src="https://shieldcn.dev/badge/encryption-end--to--end-green.svg?variant=secondary&logo=ri:LockLine" /></a>
</p>

envden keeps the `.env` files in your repos the same on every machine you work on. It syncs whole files, byte for byte, so comments, order and blank lines survive. Everything is encrypted on your devices before it leaves them, and it syncs through a small server you run yourself on your Tailscale network.

> **Alpha.** Commands and file formats may still change.

Docs: [envden.theclau.de/docs](https://envden.theclau.de/docs)

## Install

```sh
# macOS and Linux
curl -fsSL https://envden.theclau.de/install.sh | sh

# Windows (PowerShell)
irm https://envden.theclau.de/install.ps1 | iex

# Homebrew
brew install notsuhas/tap/envden

# Scoop
scoop bucket add notsuhas https://github.com/notsuhas/scoop-bucket
scoop install notsuhas/envden
```

The server is the same binary (`envden serve`), or the image `ghcr.io/notsuhas/envden:0`. Binaries and checksums are on the [releases page](https://github.com/notsuhas/envden/releases).

## Quick start

**On a home server (Docker):**

```sh
docker run -d --name envden --restart unless-stopped \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /tmp:uid=10001,gid=10001,mode=1777 \
  --tmpfs /var/run/tailscale:uid=10001,gid=10001,mode=0700 \
  -e TS_AUTHKEY="tskey-auth-..." \
  -v envden-data:/data \
  -v tailscale-state:/var/lib/tailscale \
  ghcr.io/notsuhas/envden:0
docker logs envden   # prints a one-time setup token
```

Replace `tskey-auth-...` with a Tailscale auth key. The server joins your tailnet as `envden`, at `https://envden.<tailnet>.ts.net`.

**On your first laptop:**

```sh
envden setup --server https://envden.<tailnet>.ts.net   # paste the setup token, choose a master password, print the recovery kit
```

No home server? `envden setup --host-server` runs the server on this laptop instead, with no token to paste.

**On every other device:**

```sh
envden device add     # on a device that's already set up: shows a pairing code
envden join <server>  # on the new device: type the code
```

**Day to day:**

```sh
envden status         # what's out of sync (key names only, never values)
envden pull           # get changes from your other devices
envden push           # send your changes
envden ui             # the same in a local browser dashboard
```

Every command and flag is in the [CLI reference](https://envden.theclau.de/docs/cli).

## How it works

- Your env files live in `~/.envden/store`, and each checkout links to its file, so every clone and worktree shares one copy.
- Nothing syncs in the background. `push` and `pull` merge edits per key and leave real conflicts for you.
- The server stores only ciphertext and opaque IDs. A master password and a recovery kit protect the vault.
- `envden agent install` lets coding agents check status while you keep the passwords and approvals.

## Security

The server can't read your files or add devices on its own. It can refuse service or ignore unlock expiry, and a lost device keeps whatever it already pulled. See [Security](https://envden.theclau.de/docs/security) for the model, [DESIGN.md](docs/DESIGN.md#threat-model) for the threat model and [PROTOCOL.md](docs/PROTOCOL.md) for the cryptography. To report a vulnerability, see [SECURITY.md](docs/SECURITY.md).

## This branch

This branch is the Go implementation. The TypeScript reference, the parity harness and the website are on `main`; both implementations share one protocol and must behave the same (see [docs/ports/go.md](docs/ports/go.md)).

## Building from source

Needs Go 1.26.

```sh
cd go
go build -o dist/envden ./cmd/envden   # one binary, CLI and server
./scripts/build-all.sh                 # the eight release platforms, into go/dist
```

The server image is built from [packaging/docker/Dockerfile](packaging/docker/Dockerfile) with the musl binaries, and releases are described in [docs/releasing.md](docs/releasing.md).

## Repository layout

| Path | Contents |
|---|---|
| `go/cmd/envden` | The `envden` binary |
| `go/cli` | The commands |
| `go/server` | The sync server (`net/http` on SQLite) |
| `go/core` | Protocol, crypto, chain validation, merge, adapter interfaces |
| `go/adapters/<kind>/<impl>` | Git, file placement, keychain, shell, Tailscale, SQLite |
| `go/testing` | Contract tests and fakes for adapters |
| `packaging/` | Docker image, install scripts, Homebrew, Scoop and winget templates |
| `docs/` | Design and decisions, protocol spec, terms, adapter guide, release runbook |

## Contributing

Read [AGENTS.md](AGENTS.md) first; its rules apply to people and agents alike. Turn on the pre-commit hook once:

```sh
git config core.hooksPath .githooks
```

```sh
cd go
gofmt -l . && go vet ./... && golangci-lint run ./...
go test ./...
```

Adding an adapter: see [docs/adapters.md](docs/adapters.md).

## License

[MIT](LICENSE)
