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
handles SIGINT/SIGTERM and installs those handlers before `serve` prints the listening line.
Setup/repair tokens and the listening URL print during `serve`.

For tests, `create_app(IAppOptions, Arc<Mutex<IStatusState>>) -> Result<Router>`
uses the injected storage, clock, keys, versions and status state. All adapter
construction stays in `src/adapters.rs`.

## Verification

```sh
cargo fmt -p envden-server --check
cargo clippy -p envden-server --all-targets --no-deps -- -D warnings
cargo test -p envden-server
```

The raw HTTP comparison against the TypeScript server (status lines, ordered headers except Date and connection, body bytes) runs in CI from the `main` checkout as `bun parity/transport.ts`.

`create_app_with_budget` permits shared body budgets in concurrency tests.
Body deadlines use `read_body_with` with an injected clock and scheduler; tests
expire jobs directly.
