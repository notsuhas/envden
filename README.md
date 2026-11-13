<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/header/graph.svg?title=envden&subtitle=Your+.env+files%2C+on+every+machine%2C+encrypted+end+to+end&align=left&theme=emerald&mode=dark" />
    <img alt="envden" src="https://shieldcn.dev/header/graph.svg?title=envden&subtitle=Your+.env+files%2C+on+every+machine%2C+encrypted+end+to+end&align=left&theme=emerald&mode=light" />
  </picture>
</p>

<p align="center">
  <img alt="Status: pre-release" src="https://shieldcn.dev/badge/status-pre--release-orange.svg?variant=secondary" />
  <a href="https://github.com/notsuhas/envden/actions/workflows/ci.yml"><img alt="CI status" src="https://shieldcn.dev/github/ci/notsuhas/envden.svg?variant=secondary" /></a>
  <a href="LICENSE"><img alt="License" src="https://shieldcn.dev/github/license/notsuhas/envden.svg?variant=secondary" /></a>
  <a href="https://github.com/notsuhas/envden/stargazers"><img alt="GitHub stars" src="https://shieldcn.dev/github/stars/notsuhas/envden.svg?variant=secondary" /></a>
  <a href="https://github.com/notsuhas/envden/commits/main"><img alt="Last commit" src="https://shieldcn.dev/github/last-commit/notsuhas/envden.svg?variant=secondary" /></a>
  <a href="docs/PROTOCOL.md"><img alt="End-to-end encrypted" src="https://shieldcn.dev/badge/encryption-end--to--end-green.svg?variant=secondary&logo=ri:LockLine" /></a>
</p>

envden keeps the `.env` files in your repos the same on every machine you work on. It syncs whole files, byte for byte, so comments, order and blank lines survive. Everything is encrypted on your devices before it leaves them, and it syncs through a small server you run yourself on your Tailscale network.

> **Alpha.** v0.1.0 is the first release. Commands and file formats may still change.

## Why

Secrets managers store keys, not files, so the layout and comments of a `.env` get lost. Hosted file-sync tools put your secrets on someone else's server. envden is for one person with several machines who wants their env files to just follow them, without trusting a third party.

## How it works

- **One store per device.** Your env files live in `~/.envden/store`. Each checkout gets a symlink to its file, so every clone and worktree of a repo shares one copy.
- **Explicit sync.** `envden push` and `envden pull`. Nothing syncs in the background. Edits made on two machines are merged per key; real conflicts are left for you to resolve.
- **A server you host.** One Docker container on a home server, or `envden serve` on a laptop. It only ever sees ciphertext and opaque IDs.
- **End-to-end encryption.** Each device has its own keys. A master password and a printed recovery kit protect the vault, and devices stay unlocked for a period you choose.
- **A heads-up in your shell.** An optional line in your shell config tells you when a repo you `cd` into is out of sync.
- **Works with coding agents.** `envden agent install` adds a skill so agents can check status, while you stay the one typing passwords and approving checkouts.

## Install

```sh
# macOS and Linux
curl -fsSL https://raw.githubusercontent.com/notsuhas/envden/main/packaging/install/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/notsuhas/envden/main/packaging/install/install.ps1 | iex

# Homebrew
brew install notsuhas/tap/envden

# Scoop
scoop bucket add envden https://github.com/notsuhas/scoop-bucket
scoop install envden
```

The server is the same binary (`envden serve`), or the image `ghcr.io/notsuhas/envden`. Binaries and checksums are on the [releases page](https://github.com/notsuhas/envden/releases).

## Quick start

**On a home server (Docker):**

```sh
export TS_AUTHKEY=tskey-...                            # a Tailscale auth key for the server
docker compose -f packaging/docker/compose.yml up -d
docker compose -f packaging/docker/compose.yml logs envden   # prints a one-time setup token
```

**On your first laptop:**

```sh
envden setup          # paste the setup token, choose a master password, print the recovery kit
```

Setup finds your repos, asks which ones may receive env files, links them and pushes. No home server? `envden setup --host-server` runs the server on this laptop instead.

**On every other device:**

```sh
envden device add     # on a device that's already set up: shows a pairing code
envden join <server>  # on the new device: type the code
```

You can also join with the recovery kit and master password instead of a pairing code.

**Day to day:**

```sh
envden status         # what's out of sync (key names only, never values)
envden pull           # get changes from your other devices
envden push           # send your changes
envden resolve        # handle a conflict
```

## Commands

| Command | What it does |
|---|---|
| `setup` | Create a vault and set up this device |
| `join <server>` | Add this device with a pairing code or the recovery kit |
| `push` / `pull` | Send or fetch changes |
| `status` / `diff` | Show what differs, by key name |
| `resolve` | Keep yours, take the server's, or edit a conflict |
| `track` / `untrack` | Start or stop managing a checkout's env files |
| `local-only <file>` | Keep a file deliberately different in one checkout |
| `device add / ls / rm` | Pair, list and remove devices |
| `vault` | Rotate keys, replace the recovery kit, change or reset the password |
| `server move / switch / repair` | Move to a new server, or repair one restored from a backup |
| `serve` | Run the server |
| `update` | Update envden |
| `doctor` | Check keychain, symlinks, Tailscale and the shell line |

Run `envden <command> --help` for flags.

## Security

The server is not trusted with your data: it can't read your files or add devices on its own. It can refuse service or skip unlock expiry, and a lost device keeps whatever it already pulled. The full model, including what envden can't protect against, is in [DESIGN.md § Threat model](docs/DESIGN.md#threat-model), and the exact cryptography is in [PROTOCOL.md](docs/PROTOCOL.md). Crypto comes from audited libraries (`@noble/*`, `@serenity-kit/opaque`, `@hpke/*`, `hash-wasm`); nothing is hand-rolled.

## Building from source

For contributors. Needs [Bun](https://bun.sh) 1.4.

```sh
bun install
bun run --cwd apps/cli build   # writes apps/cli/dist/envden
```

`envden serve` is the same binary. The server image is built from [apps/server/Dockerfile](apps/server/Dockerfile), and releases are described in [packaging/README.md](packaging/README.md).

## Repository layout

| Path | Contents |
|---|---|
| `apps/cli` | The `envden` command |
| `apps/server` | The sync server (Hono on SQLite) |
| `apps/web` | Website and docs (Next.js, Fumadocs) |
| `packages/core` | Protocol, crypto, chain validation, merge, adapter interfaces |
| `packages/adapters/<kind>/<impl>` | Git, file placement, keychain, shell, Tailscale, SQLite |
| `packages/testing` | Contract tests and fakes for adapters |
| `docs/` | Design, protocol spec, decisions, adapter guide |

## Contributing

Read [AGENTS.md](AGENTS.md) first; its rules apply to people and agents alike and most are enforced by lint.

```sh
bun run check    # format, lint and type check (Vite+)
bun test
bun run fallow   # unused code, cycles, duplication, complexity
```

Adding an adapter: see [docs/adapters.md](docs/adapters.md) or run `bun run new-adapter <kind> <impl>`.

## License

[MIT](LICENSE)
