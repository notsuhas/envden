use super::scheduler::IScheduler;
use axum::{Router, body::Body};
use hyper::{Request, server::conn::http1, service::service_fn};
use hyper_util::rt::{TokioIo, TokioTimer};
use std::{
    io,
    sync::{Arc, Mutex},
};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::{oneshot, watch},
    task::JoinSet,
};
use tower::ServiceExt;

pub(super) async fn listen(
    listener: TcpListener,
    app: Router,
    stop: oneshot::Receiver<()>,
    scheduler: Arc<dyn IScheduler>,
) -> io::Result<()> {
    listen_with(
        || async { listener.accept().await.map(|(stream, _)| stream) },
        app,
        stop,
        scheduler.as_ref(),
    )
    .await
}

async fn listen_with<F, Fut>(
    mut accept: F,
    app: Router,
    mut stop: oneshot::Receiver<()>,
    scheduler: &dyn IScheduler,
) -> io::Result<()>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = io::Result<TcpStream>>,
{
    let mut connections = JoinSet::new();
    let (shutdown, _) = watch::channel(false);
    loop {
        tokio::select! {
            _ = &mut stop => break,
            result = accept() => {
                let stream = match result {
                    Ok(stream) => stream,
                    Err(error) => {
                        eprintln!("envden accept failed: {:?}", error.kind());
                        // ENFILE and EMFILE share these values on supported Unix platforms.
                        if matches!(error.raw_os_error(), Some(23 | 24)) {
                            let (ready, wait) = oneshot::channel();
                            let ready = Mutex::new(Some(ready));
                            let cancel = scheduler.after(100, Arc::new(move || {
                                if let Some(ready) = ready.lock().unwrap_or_else(|e| e.into_inner()).take() {
                                    let _ = ready.send(());
                                }
                            }));
                            let stopped = tokio::select! {
                                _ = &mut stop => true,
                                _ = wait => false,
                            };
                            cancel();
                            if stopped { break; }
                        }
                        continue;
                    }
                };
                connections.spawn(serve_connection(stream, app.clone(), shutdown.subscribe()));
            }
            _ = connections.join_next(), if !connections.is_empty() => {}
        }
    }
    let _ = shutdown.send(true);
    while connections.join_next().await.is_some() {}

    Ok(())
}

async fn serve_connection(stream: TcpStream, app: Router, mut stopping: watch::Receiver<bool>) {
    let service = service_fn(move |request: Request<hyper::body::Incoming>| {
        app.clone().oneshot(request.map(Body::new))
    });
    let (activity, idle) = watch::channel(tokio::time::Instant::now());
    let connection = http1::Builder::new()
        .timer(TokioTimer::new())
        .header_read_timeout(None)
        .title_case_headers(true)
        .serve_connection(
            TokioIo::new(super::writer::WireIo::new(stream, activity)),
            service,
        );
    tokio::pin!(connection);

    tokio::select! {
        _ = &mut connection => {},
        _ = super::idle::expired(idle) => {},
        _ = stopping.changed() => {
            connection.as_mut().graceful_shutdown();
            let _ = connection.await;
        }
    }
}

#[cfg(test)]
#[path = "tests/transport.rs"]
mod tests;
