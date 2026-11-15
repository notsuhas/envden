use axum::body::{Body, Bytes};
use hyper::body::{Body as HttpBody, Frame};
use std::{
    convert::Infallible,
    future::Future,
    pin::Pin,
    task::{Context, Poll},
};
use tokio::sync::oneshot;

pub struct HeldBody {
    reading: Option<oneshot::Sender<()>>,
    release: oneshot::Receiver<()>,
    bytes: Option<Bytes>,
}

impl HttpBody for HeldBody {
    type Data = Bytes;
    type Error = Infallible;
    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, Infallible>>> {
        if let Some(reading) = self.reading.take() {
            let _ = reading.send(());
        }
        if self.bytes.is_none() {
            return Poll::Ready(None);
        }
        if Pin::new(&mut self.release).poll(cx).is_pending() {
            return Poll::Pending;
        }
        Poll::Ready(self.bytes.take().map(|bytes| Ok(Frame::data(bytes))))
    }
}

pub fn held(bytes: &[u8]) -> (Body, oneshot::Receiver<()>, oneshot::Sender<()>) {
    let (reading, receive) = oneshot::channel();
    let (release, wait) = oneshot::channel();
    (
        Body::new(HeldBody {
            reading: Some(reading),
            release: wait,
            bytes: Some(Bytes::copy_from_slice(bytes)),
        }),
        receive,
        release,
    )
}

struct TrackedBody {
    bytes: Option<Bytes>,
    dropped: std::sync::Arc<std::sync::atomic::AtomicBool>,
}
impl HttpBody for TrackedBody {
    type Data = Bytes;
    type Error = Infallible;
    fn poll_frame(
        mut self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, Infallible>>> {
        Poll::Ready(self.bytes.take().map(|bytes| Ok(Frame::data(bytes))))
    }
}
impl Drop for TrackedBody {
    fn drop(&mut self) {
        self.dropped
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }
}

pub fn tracked(bytes: &[u8], dropped: std::sync::Arc<std::sync::atomic::AtomicBool>) -> Body {
    Body::new(TrackedBody {
        bytes: Some(Bytes::copy_from_slice(bytes)),
        dropped,
    })
}
