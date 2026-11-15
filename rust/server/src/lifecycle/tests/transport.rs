use super::*;

#[tokio::test]
async fn accept_errors_do_not_end_listener() {
    if std::env::var_os("ENVDEN_TEST_ACCEPT_CHILD").is_none() {
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "lifecycle::transport::tests::accept_errors_do_not_end_listener",
                "--nocapture",
            ])
            .env("ENVDEN_TEST_ACCEPT_CHILD", "1")
            .output()
            .unwrap();
        assert!(output.status.success());
        assert!(
            output.stderr.is_empty(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        return;
    }

    let (stop, receive) = oneshot::channel();
    let mut stop = Some(stop);
    let mut first = true;
    let result = listen_with(
        || {
            let error = if first {
                first = false;
                Some(io::Error::from(io::ErrorKind::ConnectionAborted))
            } else {
                stop.take().unwrap().send(()).unwrap();
                None
            };
            async move {
                match error {
                    Some(error) => Err(error),
                    None => std::future::pending().await,
                }
            }
        },
        Router::new(),
        receive,
        &super::super::scheduler::SystemScheduler,
    )
    .await;
    assert!(result.is_ok());
}

#[derive(Default)]
struct Scheduler {
    ready: tokio::sync::Notify,
    run: Mutex<Option<super::super::scheduler::TJob>>,
}

impl IScheduler for Scheduler {
    fn after(
        &self,
        milliseconds: u64,
        run: super::super::scheduler::TJob,
    ) -> super::super::scheduler::TCancel {
        assert_eq!(milliseconds, 100);
        *self.run.lock().unwrap() = Some(run);
        self.ready.notify_one();
        Box::new(|| {})
    }
    fn every(&self, _: u64, _: super::super::scheduler::TJob) -> super::super::scheduler::TCancel {
        panic!("Unexpected repeating accept timer")
    }
}

#[tokio::test]
async fn descriptor_exhaustion_waits_for_injected_scheduler_before_retry() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let scheduler = Arc::new(Scheduler::default());
    let calls = Arc::new(AtomicUsize::new(0));
    let attempts = calls.clone();
    let timer = scheduler.clone();
    let (stop, receive) = oneshot::channel();
    let mut stop = Some(stop);
    let task = tokio::spawn(async move {
        listen_with(
            || {
                let count = attempts.fetch_add(1, Ordering::SeqCst);
                if count > 0 {
                    stop.take().unwrap().send(()).unwrap();
                }
                async move {
                    if count == 0 {
                        Err(io::Error::from_raw_os_error(24))
                    } else {
                        std::future::pending().await
                    }
                }
            },
            Router::new(),
            receive,
            timer.as_ref(),
        )
        .await
    });
    scheduler.ready.notified().await;
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    scheduler.run.lock().unwrap().take().unwrap()();
    assert!(task.await.unwrap().is_ok());
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[tokio::test(start_paused = true)]
async fn incomplete_headers_have_an_absolute_deadline_despite_activity() {
    use std::time::Duration;
    use tokio::io::AsyncWriteExt;

    let (mut client, server) = tokio::io::duplex(1);
    let (_stop, stopping) = watch::channel(false);
    let task = tokio::spawn(serve_connection(server, Router::new(), stopping));
    client.write_all(b"GET / HTTP/1.1\r\nHost:").await.unwrap();
    tokio::time::advance(Duration::from_secs(7)).await;
    client.write_all(b" local").await.unwrap();
    tokio::time::advance(Duration::from_secs(4)).await;
    tokio::task::yield_now().await;
    assert!(task.is_finished());
}
