use super::{
    browser::open_browser,
    server::{app::create_dashboard_app, token::new_token},
};
use crate::{adapters::IAdapters, state::repository::load_state};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::sync::Arc;

pub fn run_dashboard(
    adapters: &IAdapters,
    interactive: bool,
    port: Option<f64>,
    open: bool,
) -> Result<()> {
    if !interactive {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "envden ui needs an interactive terminal",
        ));
    }
    if port.is_some_and(|p| p.fract() != 0.0 || !(1.0..65536.0).contains(&p)) {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Port must be 1-65535",
        ));
    }
    let runtime = tokio::runtime::Runtime::new().map_err(failed)?;
    let home = adapters.home.clone();
    runtime.block_on(async {
        let token = new_token();
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", port.unwrap_or(0.0) as u16))
            .await
            .map_err(failed)?;
        let port = listener.local_addr().map_err(failed)?.port();
        let app = create_dashboard_app(
            port,
            token.clone(),
            Arc::new(move |path| {
                if path == "/api/status" {
                    let state = load_state(&home)?;
                    if !state.is_some_and(|s| s["server"].is_object() && s["vaultId"].is_string()) {
                        return Ok(serde_json::json!({"kind":"not-configured"}));
                    }
                }
                Err(EnvdenError::new(
                    ErrorCode::NotImplemented,
                    "Not implemented",
                ))
            }),
        );
        let url = format!("http://127.0.0.1:{port}/#{token}");
        println!("envden ui: {url}\nPress Ctrl-C to stop.");
        if open && !open_browser(&url) {
            println!("Could not open a browser; open the link above.");
        }
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                interrupted().await;
            })
            .await
            .map_err(failed)
    })
}

fn failed(error: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Internal, "Dashboard server failed", error)
}

async fn interrupted() {
    #[cfg(unix)]
    if let Ok(mut terminate) =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
    {
        tokio::select! {_ = tokio::signal::ctrl_c()=>{}, _ = terminate.recv()=>{}}
        return;
    }
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_terminal_and_refuses_invalid_ports_before_listening() {
        let temp = tempfile::tempdir().unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(temp.path().join("envden")),
            temp.path().to_path_buf(),
            || 0,
        );
        assert_eq!(
            run_dashboard(&adapters, false, None, false)
                .unwrap_err()
                .message,
            "envden ui needs an interactive terminal"
        );
        for port in [0.0, -1.0, 1.5, 65536.0, f64::NAN, f64::INFINITY] {
            assert_eq!(
                run_dashboard(&adapters, true, Some(port), false)
                    .unwrap_err()
                    .message,
                "Port must be 1-65535"
            );
        }
    }
}
