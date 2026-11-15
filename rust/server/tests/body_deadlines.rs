use axum::body::{Body, Bytes};
use envden_core::errors::ErrorCode;
use envden_server::{
    lifecycle::scheduler::{IScheduler, TCancel, TJob},
    middleware::body::read_body_with,
};
use hyper::body::{Body as HttpBody, Frame};
use sha2::{Digest, Sha256};
use std::{
    convert::Infallible,
    pin::Pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    task::{Context, Poll},
};
use tokio::sync::oneshot;

#[derive(Default)]
struct Scheduler {
    deadlines: Arc<Mutex<Vec<u64>>>,
    run: Mutex<Option<TJob>>,
    stopped: Arc<AtomicBool>,
}
impl IScheduler for Scheduler {
    fn after(&self, ms: u64, run: TJob) -> TCancel {
        self.deadlines.lock().unwrap().push(ms);
        *self.run.lock().unwrap() = Some(run);
        let stopped = self.stopped.clone();
        Box::new(move || stopped.store(true, Ordering::SeqCst))
    }
    fn every(&self, _ms: u64, _run: TJob) -> TCancel {
        panic!("Unexpected repeating body timer")
    }
}
struct PendingBody {
    reading: Option<oneshot::Sender<()>>,
    first: Option<Bytes>,
    cancelled: Arc<AtomicBool>,
}
impl HttpBody for PendingBody {
    type Data = Bytes;
    type Error = Infallible;
    fn poll_frame(
        mut self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, Infallible>>> {
        if let Some(first) = self.first.take() {
            return Poll::Ready(Some(Ok(Frame::data(first))));
        }
        if let Some(reading) = self.reading.take() {
            reading.send(()).unwrap();
        }
        Poll::Pending
    }
}
impl Drop for PendingBody {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
}

#[tokio::test]
async fn trickling_cannot_reset_absolute_deadline_and_reader_is_cancelled() {
    let scheduler = Arc::new(Scheduler::default());
    let cancelled = Arc::new(AtomicBool::new(false));
    let (reading, receive) = oneshot::channel();
    let body = Body::new(PendingBody {
        reading: Some(reading),
        first: Some(Bytes::from_static(&[1])),
        cancelled: cancelled.clone(),
    });
    let injected = scheduler.clone();
    let result = tokio::spawn(async move {
        read_body_with(
            body,
            65536,
            &Sha256::digest([1]).into(),
            || 0,
            injected.as_ref(),
        )
        .await
    });
    receive.await.unwrap();
    scheduler.run.lock().unwrap().as_ref().unwrap()();
    assert_eq!(
        result.await.unwrap().unwrap_err().code,
        ErrorCode::InvalidInput
    );
    assert!(cancelled.load(Ordering::SeqCst));
    assert!(scheduler.stopped.load(Ordering::SeqCst));
}

#[tokio::test]
async fn only_received_bytes_extend_body_deadline() {
    let scheduler = Scheduler::default();
    let bytes = vec![0; 65536];
    assert_eq!(
        read_body_with(
            Body::from(bytes.clone()),
            33554432,
            &Sha256::digest(&bytes).into(),
            || 0,
            &scheduler
        )
        .await
        .unwrap()
        .len(),
        65536
    );
    let deadlines = scheduler.deadlines.lock().unwrap();
    assert_eq!(deadlines.first(), Some(&10000));
    assert_eq!(deadlines.last(), Some(&12000));
    assert_eq!(deadlines.iter().max(), Some(&12000));
}

#[tokio::test]
async fn declared_length_is_enforced_while_streaming() {
    let scheduler = Scheduler::default();
    assert_eq!(
        read_body_with(
            Body::from(vec![0; 2]),
            1,
            &Sha256::digest([0; 2]).into(),
            || 0,
            &scheduler
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::InvalidInput
    );
}

#[tokio::test]
async fn repair_body_reader_accepts_maximum_report_list() {
    let bytes = vec![0; 182 + 32 * 100000];
    let scheduler = Scheduler::default();
    assert_eq!(
        read_body_with(
            Body::from(bytes.clone()),
            3200182,
            &Sha256::digest(&bytes).into(),
            || 0,
            &scheduler
        )
        .await
        .unwrap()
        .as_ref(),
        bytes.as_slice()
    );
}
