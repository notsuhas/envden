use envden_server::{
    IServeOptions,
    lifecycle::scheduler::{IScheduler, TCancel, TJob},
    serve,
};
use std::sync::{Arc, Mutex};

type Jobs = Arc<Mutex<Vec<(bool, u64, bool)>>>;

#[derive(Default)]
struct ManualScheduler {
    jobs: Jobs,
}

impl IScheduler for ManualScheduler {
    fn after(&self, ms: u64, _run: TJob) -> TCancel {
        self.record(false, ms)
    }
    fn every(&self, ms: u64, _run: TJob) -> TCancel {
        self.record(true, ms)
    }
}
impl ManualScheduler {
    fn record(&self, repeating: bool, ms: u64) -> TCancel {
        let mut jobs = self.jobs.lock().unwrap();
        let index = jobs.len();
        jobs.push((repeating, ms, true));
        let jobs = self.jobs.clone();
        Box::new(move || jobs.lock().unwrap()[index].2 = false)
    }
}

#[tokio::test]
async fn injects_time_cancels_jobs_and_closes_storage_on_idempotent_shutdown() {
    let directory = tempfile::tempdir().unwrap();
    let scheduler = Arc::new(ManualScheduler::default());
    let mut running = serve(IServeOptions {
        data_dir: Some(directory.path().into()),
        port: Some(0),
        now: Some(Arc::new(|| 1000)),
        scheduler: Some(scheduler.clone()),
        ..Default::default()
    })
    .await
    .unwrap();
    assert!(running.url.starts_with("http://127.0.0.1:"));
    assert!(!running.url.ends_with(":0/"));
    assert_eq!(
        *scheduler.jobs.lock().unwrap(),
        vec![(false, 60000, true), (true, 3600000, true)]
    );
    running.shutdown().await.unwrap();
    running.shutdown().await.unwrap();
    assert_eq!(
        *scheduler.jobs.lock().unwrap(),
        vec![(false, 60000, false), (true, 3600000, false)]
    );
    assert!(running.storage.vault_ids().is_err());
}
