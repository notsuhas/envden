# One server per vault, no peer-to-peer

Each vault has exactly one authoritative server at a time. Devices push and pull only through it, never directly with each other. Peer-to-peer (Syncthing-style) was rejected because every device could then hold a divergent version with no source of truth, making conflicts hard to reason about. Users without a home lab run the server on one of their own devices and can move it later with `envden server move`, which copies the ciphertext and repoints devices.
