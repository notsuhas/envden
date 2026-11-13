# TypeScript on Bun, not Go

envden is a TypeScript monorepo (CLI, server, docs site, shared core) built on Bun, which compiles the CLI to a single binary for macOS, Linux and Windows. Go with Tailscale's `tsnet` was the obvious choice, but the maintainer can't read Go and needs to audit the code. Instead of embedding Tailscale, the server listens on localhost (or a unix socket) and sits behind `tailscale serve`. Its identity headers are only a coarse gate; real authentication is device-signed requests (ADR 0003).

Networking sits behind a network adapter (ADR 0004): how the server is reached and how devices find it. v1 ships only the `tailscale` adapter; NetBird, ZeroTier or a generic device-token adapter can be added without touching sync or crypto, because files are end-to-end encrypted and the network layer only gates access to ciphertext.
