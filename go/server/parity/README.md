The reference corpus records 417 requests from the existing server tests, including the SQLite snapshot before each request and every table after it. Keys and tokens are synthetic test data.

From the repository root, regenerate it without changing TypeScript:

```sh
bun test --preload ./go/server/parity/capture.js ./apps/server/src
bun go/server/parity/pack.js
```

The Go replay uses httptest and compares status, response headers, body, and every database table. Random charge receipt IDs and generated OPAQUE login state are normalized. OPAQUE start responses are checked for message shape and length, since their bytes are random. Storage faults and outstanding body reservations used by the TS tests are recorded and replayed.

Streaming requests pass through the capture wrapper unchanged. Go tests separately cover body limits, deadlines, cancellation, and reservation scopes. The full-handler mutex requested for this port serializes stalled bodies; it does not reproduce Bun's overlapping body reads.

To compare actual Bun and Go listeners, including malformed HTTP headers:

```sh
cd go
export GOMODCACHE=$PWD/../.cache/gomod GOCACHE=$PWD/../.cache/gobuild GOFLAGS=-modcacherw
ENVDEN_TS_PARITY=1 go test ./server -run TestBunNetworkParity -v
```

The socket test compares 21 raw requests, including default 404s, wrong methods, HEAD, URL dot segments, oversized declared bodies, and invalid or conflicting Content-Length headers. It ignores Date. Bun is needed only for this opt-in test and corpus generation.
