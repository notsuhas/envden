use crate::lifecycle::scheduler::{IScheduler, SystemScheduler};
use axum::{
    body::{Body, Bytes},
    http::HeaderMap,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use http_body_util::BodyExt;
use sha2::{Digest, Sha256};
use std::sync::Arc;

pub fn declared_body_size(headers: &HeaderMap, limit: usize) -> Result<usize> {
    let Some(value) = headers.get("content-length") else {
        return Ok(limit);
    };
    let value = value.to_str().unwrap_or("");
    let size = value
        .parse::<u64>()
        .ok()
        .filter(|size| *size <= 9007199254740991 && *size <= limit as u64);
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) || size.is_none() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Request too large",
        ));
    }

    size.map(|size| size as usize)
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, "Request too large"))
}

pub async fn read_body(body: Body, capacity: usize, expected: &[u8; 32]) -> Result<Bytes> {
    let start = tokio::time::Instant::now();

    read_body_with(
        body,
        capacity,
        expected,
        || start.elapsed().as_millis() as u64,
        &SystemScheduler,
    )
    .await
}

pub async fn read_body_with(
    mut body: Body,
    capacity: usize,
    expected: &[u8; 32],
    now: impl Fn() -> u64,
    scheduler: &dyn IScheduler,
) -> Result<Bytes> {
    let started = now();
    let mut bytes = Vec::new();
    let mut hasher = Sha256::new();
    loop {
        let total = (10000 + (bytes.len() / 32768) as u64 * 1000).min(600000);
        let remaining = total.saturating_sub(now().saturating_sub(started));
        let (expire, mut deadline) = tokio::sync::mpsc::unbounded_channel();
        let cancel = scheduler.after(
            remaining,
            Arc::new(move || {
                let _ = expire.send(());
            }),
        );
        let frame = tokio::select! {
            frame=body.frame()=>Ok(frame),
            _=deadline.recv()=>Err(EnvdenError::new(ErrorCode::InvalidInput,"Body read deadline exceeded")),
        };
        cancel();
        let Some(frame) = frame? else {
            break;
        };
        let frame = frame.map_err(|error| {
            EnvdenError::with_source(ErrorCode::Internal, "Body read failed", error)
        })?;
        if let Ok(chunk) = frame.into_data() {
            if bytes.len() + chunk.len() > capacity {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Request too large",
                ));
            }
            hasher.update(&chunk);
            bytes.extend_from_slice(&chunk);
        }
    }
    if hasher.finalize().as_slice() != expected {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Request body hash mismatch",
        ));
    }

    Ok(bytes.into())
}
