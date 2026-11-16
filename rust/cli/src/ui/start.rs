use super::{
    browser::open_browser,
    server::{app::create_request_dashboard_app, token::new_token},
};
use crate::adapters::{IAdapters, create_adapters};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{future::IntoFuture, sync::Arc};

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
    let user_home = adapters.user_home.clone();
    let now = adapters.now;
    runtime.block_on(async {
        let token = new_token();
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", port.unwrap_or(0.0) as u16))
            .await
            .map_err(failed)?;
        let port = listener.local_addr().map_err(failed)?.port();
        let app = create_request_dashboard_app(
            port,
            token.clone(),
            Arc::new(move |request| {
                let adapters = create_adapters(Some(home.clone()), user_home.clone(), now);
                crate::ui::routes::api::api(
                    &adapters,
                    request,
                    std::rc::Rc::new(crate::client::UreqTransport),
                )
            }),
        );
        let url = format!("http://127.0.0.1:{port}/#{token}");
        println!("envden ui: {url}\nPress Ctrl-C to stop.");
        if open && !open_browser(&url) {
            println!("Could not open a browser; open the link above.");
        }
        serve_dashboard(listener, app, interrupted())
            .await
            .map_err(failed)
    })
}

async fn serve_dashboard(
    listener: tokio::net::TcpListener,
    app: axum::Router,
    stopped: impl std::future::Future<Output = ()> + Send + 'static,
) -> std::io::Result<()> {
    tokio::select! {
        result = axum::serve(listener, app).into_future() => result,
        _ = stopped => Ok(()),
    }
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

#[cfg(test)]
mod shutdown_tests {
    use super::*;
    use tokio::io::AsyncWriteExt;

    #[test]
    fn stop_finishes_with_a_pending_dashboard_request() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let entered = Arc::new(tokio::sync::Notify::new());
                let handler_entered = entered.clone();
                let app = axum::Router::new().route(
                    "/wait",
                    axum::routing::get(move || {
                        let entered = handler_entered.clone();
                        async move {
                            entered.notify_one();
                            std::future::pending::<&'static str>().await
                        }
                    }),
                );
                let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
                let address = listener.local_addr().unwrap();
                let (stop, stopped) = tokio::sync::oneshot::channel();
                let observed = Arc::new(tokio::sync::Notify::new());
                let stop_observed = observed.clone();
                let server = tokio::spawn(serve_dashboard(listener, app, async move {
                    stopped.await.unwrap();
                    stop_observed.notify_one();
                }));
                let mut client = tokio::net::TcpStream::connect(address).await.unwrap();
                client
                    .write_all(b"GET /wait HTTP/1.1\r\nHost: localhost\r\n\r\n")
                    .await
                    .unwrap();
                entered.notified().await;
                stop.send(()).unwrap();
                observed.notified().await;
                assert!(
                    server.is_finished(),
                    "dashboard must force stop pending requests"
                );
                server.await.unwrap().unwrap();
            });
    }
}
