use envden_server::{IServeOptions, serve};

#[tokio::main]
async fn main() {
    let mut options = IServeOptions {
        setup_token: std::env::var("ENVDEN_SETUP_TOKEN")
            .ok()
            .filter(|v| !v.is_empty()),
        status_page: std::env::var("ENVDEN_STATUS_PAGE").ok(),
        ..Default::default()
    };
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--version" | "-V" => {
                println!("{}", env!("CARGO_PKG_VERSION"));
                return;
            }
            "--help" | "-h" => {
                println!(
                    "Usage: envden serve [options]\n\nRun the server; ENVDEN_SETUP_TOKEN replaces the setup token\n\nOptions:\n  --restored              Start a restored backup in repair-only mode\n  --min-client <version>  Oldest client version to accept\n  --data-dir <path>       Server data directory\n  --port <port>           Localhost port\n  -h, --help              display help for command"
                );
                return;
            }
            "--restored" => options.restored = true,
            "--min-client" => options.min_client = Some(required(&mut args, &arg)),
            "--data-dir" => options.data_dir = Some(required(&mut args, &arg).into()),
            "--port" => {
                let value = required(&mut args, &arg);
                options.port = Some(match value.parse::<u16>() {
                    Ok(port)
                        if value.len() <= 5
                            && !value.is_empty()
                            && value.bytes().all(|b| b.is_ascii_digit()) =>
                    {
                        port
                    }
                    _ => {
                        eprintln!(
                            "error: option '--port <port>' argument '{value}' is invalid. Expected a port from 0 (any free port) to 65535."
                        );
                        std::process::exit(1);
                    }
                });
            }
            _ => {
                eprintln!("error: unknown option '{arg}'");
                std::process::exit(1);
            }
        }
    }
    let mut server = match serve(options).await {
        Ok(server) => server,
        Err(error) => {
            eprintln!("{}", error.message);
            std::process::exit(1);
        }
    };
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("signal handler");
        tokio::select! {_ = tokio::signal::ctrl_c() => {},_ = term.recv() => {}}
    }
    #[cfg(not(unix))]
    let _ = tokio::signal::ctrl_c().await;
    if let Err(error) = server.shutdown().await {
        eprintln!("{}", error.message);
        std::process::exit(1);
    }
}

fn required(args: &mut impl Iterator<Item = String>, option: &str) -> String {
    args.next().unwrap_or_else(|| {
        eprintln!("error: option '{option}' argument missing");
        std::process::exit(1);
    })
}
