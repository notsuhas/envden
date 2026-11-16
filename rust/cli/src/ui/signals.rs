pub(super) fn interrupted() -> std::io::Result<impl std::future::Future<Output = ()> + Send> {
    #[cfg(unix)]
    let (mut terminate, mut interrupt) = {
        use tokio::signal::unix::{SignalKind, signal};

        (
            signal(SignalKind::terminate())?,
            signal(SignalKind::interrupt())?,
        )
    };
    #[cfg(not(unix))]
    let mut interrupt = tokio::signal::windows::ctrl_c()?;

    Ok(async move {
        #[cfg(unix)]
        tokio::select! { _ = terminate.recv() => {}, _ = interrupt.recv() => {} }
        #[cfg(not(unix))]
        interrupt.recv().await;
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[tokio::test]
    async fn sigterm_before_first_poll_is_caught() {
        let stopped = interrupted().unwrap();
        nix::sys::signal::raise(nix::sys::signal::Signal::SIGTERM).unwrap();
        stopped.await;
    }
}
