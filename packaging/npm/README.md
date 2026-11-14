# envden

Sync whole `.env` files across your machines. Files are encrypted on your device, stored on a server you run, and reached over Tailscale. Comments, key order and blank lines survive.

```sh
npm i -g envden
envden setup
```

Installing downloads the envden binary for your platform from the matching GitHub release and checks it against a SHA-256 hash pinned in this package.

Docs: https://envden.theclau.de/docs
Source: https://github.com/notsuhas/envden (MIT)
