use axum::{Router, body::Body};
use hyper::{Request, server::conn::http1, service::service_fn};
use hyper_util::rt::TokioIo;
use std::io;
use tokio::{
    net::{TcpListener, TcpStream},
    sync::{oneshot, watch},
    task::JoinSet,
};
use tower::ServiceExt;

pub(super) async fn listen(
    listener: TcpListener,
    app: Router,
    mut stop: oneshot::Receiver<()>,
) -> io::Result<()> {
    let mut connections = JoinSet::new();
    let (shutdown, _) = watch::channel(false);
    loop {
        tokio::select! {
            _ = &mut stop => break,
            result = listener.accept() => {
                let (stream, _) = result?;
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
    let connection = http1::Builder::new()
        .title_case_headers(true)
        .serve_connection(TokioIo::new(super::writer::WireIo::new(stream)), service);
    tokio::pin!(connection);

    tokio::select! {
        _ = &mut connection => {},
        _ = stopping.changed() => {
            connection.as_mut().graceful_shutdown();
            let _ = connection.await;
        }
    }
}
