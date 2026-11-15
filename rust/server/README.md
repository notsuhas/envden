# Rust server

The CLI calls `envden_server::serve(IServeOptions { ..Default::default() }).await`.
It returns `Result<RunningServer, envden_core::errors::EnvdenError>`.

`IServeOptions` accepts `data_dir: Option<PathBuf>`, `port: Option<u16>`,
`min_client: Option<String>`, `setup_token: Option<String>`, `restored: bool`,
`now: Option<Arc<dyn Fn() -> u64 + Send + Sync>>`,
`scheduler: Option<Arc<dyn IScheduler>>`, and `status_page: Option<String>`.
Time is Unix milliseconds. The scheduler has `after` and `every`, each returning
an owned cancellation closure. Defaults are the home server directory, port
4280, minimum client 0.0.0, the system clock and Tokio timers.

`RunningServer` exposes `url: String` and `storage: Arc<dyn IStorageAdapter>`.
Call `running.shutdown().await` with a mutable binding. Shutdown cancels pruning,
waits for HTTP shutdown and closes storage; repeated calls succeed. The caller
handles SIGINT/SIGTERM. The standalone `envden-serve` binary does that itself.
Setup/repair tokens and the listening URL print during `serve`.

For tests, `create_app(IAppOptions, Arc<Mutex<IStatusState>>) -> Result<Router>`
uses the injected storage, clock, keys, versions and status state. All adapter
construction stays in `src/adapters.rs`.

## Verification limits

Gate 2 is not complete. Thirty-four Rust tests cover identity, status, request
signatures, body capacity/hash, body reservations, lifecycle and restored startup.
The remaining TypeScript server suites still need to be ported. Focused runs of
TypeScript clients exercised setup, recovery join, push/pull, pairing, password
operations, move and repair against the Rust server.

The full hybrid differential run is red. The SQLite adapter closes its last
connection and removes WAL/SHM files; Bun's reference leaves both files behind.
Bun 1.4's readonly snapshot reader fails with SQLITE_CANTOPEN against that closed
Rust database. Fix this in the storage adapter rather than masking snapshots.
The hybrid wrapper also makes shell-integration snapshots contain the delegated
TypeScript executable path, which the current normalizer does not recognize.

Remaining server parity work includes exact date-fns formatting outside the tested intervals,
and pruning failure-path coverage. Body reading exposes `read_body_with` for an
injected clock and scheduler; normal HTTP requests use the Tokio timer edge.

A declared request body above 32 MiB receives the reference's empty 413 before
request authentication. Hyper still adds `Content-Length: 0` and its automatic
Date header there; Bun's transport-level 413 has neither. Exact transport-header
parity therefore remains unfinished.
