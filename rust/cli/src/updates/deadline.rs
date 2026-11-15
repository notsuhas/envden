use super::fetch::{IFetcher, IResponse, TRedirect};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{cell::Cell, time::Duration};

pub(super) struct Deadline<'a> {
    fetcher: &'a dyn IFetcher,
    clock: &'a dyn Fn() -> u64,
    expires: u64,
    sent: Cell<bool>,
}

impl<'a> Deadline<'a> {
    pub(super) fn new(fetcher: &'a dyn IFetcher, clock: &'a dyn Fn() -> u64) -> Self {
        Self {
            fetcher,
            clock,
            expires: clock().saturating_add(2000),
            sent: Cell::new(false),
        }
    }

    pub(super) fn sent(&self) -> bool {
        self.sent.get()
    }

    fn remaining(&self) -> Result<Duration> {
        let remaining = self.expires.saturating_sub((self.clock)());
        if remaining == 0 {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Release lookup timed out",
            ));
        }

        Ok(Duration::from_millis(remaining))
    }
}

impl IFetcher for Deadline<'_> {
    fn fetch(&self, url: &str, redirect: TRedirect, timeout: Duration) -> Result<IResponse> {
        let timeout = timeout.min(self.remaining()?);
        self.sent.set(true);
        let result = self.fetcher.fetch(url, redirect, timeout);
        self.remaining()?;

        result
    }
}
