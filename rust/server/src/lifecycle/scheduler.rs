use std::{sync::Arc, time::Duration};

pub type TCancel = Box<dyn FnOnce() + Send>;
pub type TJob = Arc<dyn Fn() + Send + Sync>;

pub trait IScheduler: Send + Sync {
    fn after(&self, milliseconds: u64, run: TJob) -> TCancel;
    fn every(&self, milliseconds: u64, run: TJob) -> TCancel;
}

pub struct SystemScheduler;

impl IScheduler for SystemScheduler {
    fn after(&self, milliseconds: u64, run: TJob) -> TCancel {
        let task = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(milliseconds)).await;
            run();
        });

        Box::new(move || task.abort())
    }

    fn every(&self, milliseconds: u64, run: TJob) -> TCancel {
        let task = tokio::spawn(async move {
            let start = tokio::time::Instant::now() + Duration::from_millis(milliseconds);
            let mut interval = tokio::time::interval_at(start, Duration::from_millis(milliseconds));
            loop {
                interval.tick().await;
                run();
            }
        });

        Box::new(move || task.abort())
    }
}
