# envden

Sync whole `.env` files across your own machines, end-to-end encrypted, through a server you host.

Work in progress. Start with [docs/DESIGN.md](docs/DESIGN.md) and [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Development

```sh
bun install
bun run check    # format, lint and type check (Vite+)
bun test
bun run fallow   # unused code, cycles, duplication
```
