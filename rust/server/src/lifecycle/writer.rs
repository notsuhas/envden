use super::wire::WireFormat;
use std::{
    io,
    pin::Pin,
    task::{Context, Poll, ready},
};
use tokio::{
    io::{AsyncRead, AsyncWrite, ReadBuf},
    sync::watch,
    time::Instant,
};

pub(super) struct WireIo<T> {
    stream: T,
    activity: watch::Sender<Instant>,
    format: WireFormat,
    pending: Vec<u8>,
    offset: usize,
}
impl<T> WireIo<T> {
    pub fn new(stream: T, activity: watch::Sender<Instant>) -> Self {
        Self {
            stream,
            activity,
            format: WireFormat::default(),
            pending: vec![],
            offset: 0,
        }
    }
}
impl<T: AsyncRead + Unpin> AsyncRead for WireIo<T> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buffer: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let before = buffer.filled().len();
        let result = Pin::new(&mut self.stream).poll_read(cx, buffer);
        if buffer.filled().len() > before {
            self.activity.send_replace(Instant::now());
        }
        result
    }
}
impl<T: AsyncWrite + Unpin> AsyncWrite for WireIo<T> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        bytes: &[u8],
    ) -> Poll<io::Result<usize>> {
        ready!(self.as_mut().poll_flush(cx))?;
        self.pending = self.format.encode(bytes);

        Poll::Ready(Ok(bytes.len()))
    }
    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        while this.offset < this.pending.len() {
            let written =
                ready!(Pin::new(&mut this.stream).poll_write(cx, &this.pending[this.offset..]))?;
            if written == 0 {
                return Poll::Ready(Err(io::ErrorKind::WriteZero.into()));
            }
            this.activity.send_replace(Instant::now());
            this.offset += written;
        }
        this.pending.clear();
        this.offset = 0;

        Pin::new(&mut this.stream).poll_flush(cx)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        ready!(self.as_mut().poll_flush(cx))?;
        Pin::new(&mut self.stream).poll_shutdown(cx)
    }
}
