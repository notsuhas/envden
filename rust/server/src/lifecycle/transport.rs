use axum::{Router, body::Body};
use hyper::{Request, server::conn::http1, service::service_fn};
use hyper_util::rt::TokioIo;
use std::io;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::oneshot,
    task::JoinSet,
};
use tower::ServiceExt;

pub(super) async fn listen(
    listener: TcpListener,
    app: Router,
    mut stop: oneshot::Receiver<()>,
) -> io::Result<()> {
    let mut connections = JoinSet::new();
    loop {
        tokio::select! {
            _ = &mut stop => break,
            result = listener.accept() => {
                let (mut stream, _) = result?;
                let app = app.clone();
                connections.spawn(async move {
                    let mut prefix = Vec::new();
                    while !prefix.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                        let mut chunk = [0; 4096];
                        let size = stream.read(&mut chunk).await?;
                        if size == 0 || prefix.len() + size > 65536 { return Ok(()); }
                        prefix.extend_from_slice(&chunk[..size]);
                    }
                    let end = prefix.windows(4).position(|b| b == b"\r\n\r\n").expect("complete head");
                    let head = String::from_utf8_lossy(&prefix[..end]);
                    if head.lines().any(|line| {
                        line.split_once(':').is_some_and(|(name, value)| {
                            name.eq_ignore_ascii_case("content-length")
                                && value.trim().parse::<u64>().is_ok_and(|n| n > 33554432)
                        })
                    }) {
                        stream.write_all(b"HTTP/1.1 413 Request Entity Too Large\r\n\r\n").await?;
                        return Ok::<_, io::Error>(());
                    }
                    let mut line=head.lines().next().unwrap_or("").split_whitespace();
                    if line.next()==Some("HEAD") && let Some(target)=line.next() && let Some(response)=super::head::head_response(target) {
                        stream.write_all(&response).await?;
                        return Ok(());
                    }
                    let service = service_fn(move |request: Request<hyper::body::Incoming>| {
                        app.clone().oneshot(request.map(Body::new))
                    });
                    let _ = http1::Builder::new()
                        .title_case_headers(true)
                        .serve_connection(TokioIo::new(super::prefix::Prefixed { prefix: io::Cursor::new(prefix), stream }), service)
                        .await;
                    Ok(())
                });
            }
            _ = connections.join_next(), if !connections.is_empty() => {}
        }
    }
    connections.abort_all();
    while connections.join_next().await.is_some() {}

    Ok(())
}
