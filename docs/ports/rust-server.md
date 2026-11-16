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

## Verification

Set `CARGO_TARGET_DIR=$PWD/target/server` before building or checking.

```sh
cargo fmt -p envden-server --check
cargo clippy -p envden-server --all-targets --no-deps -- -D warnings
cargo test -p envden-server
cargo build -p envden-server --release
bun parity/run.ts --impl ts=apps/cli/dist/envden --impl hybrid=parity/hybrid/envden
bun parity/hybrid/transport.ts
```

The TypeScript reference passes 133 cases, with one Windows-only skip on macOS.
The Rust server passes 106 tests; table rows and related assertions are grouped.
Both the TS-vs-TS baseline and the hybrid differential pass all 21 scenarios.
The raw transport comparison checks ordered, case-sensitive headers and exact
status lines and body bytes across 17 cases, excluding Date and connection headers.
It includes the reference's HEAD and 413 responses on fresh and reused connections.

The hybrid launcher uses the release server and delegates other commands to the
compiled TypeScript CLI. On macOS the SQLite adapter uses Apple's system SQLite,
matching Bun's checkpoint and persistent WAL/SHM behavior at shutdown.

`create_app_with_budget` permits shared body budgets in concurrency tests.
Body deadlines use `read_body_with` with an injected clock and scheduler; tests
expire jobs directly. The preserved HEAD and uptime quirks are in `docs/ports/rust-parity.md`.
