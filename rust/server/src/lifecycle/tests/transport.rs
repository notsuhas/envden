use super::*;

#[tokio::test]
async fn accept_errors_do_not_end_listener() {
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
