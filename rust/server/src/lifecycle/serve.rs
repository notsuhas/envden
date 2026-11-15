use super::{
    prune_history_safely,
    scheduler::{IScheduler, SystemScheduler, TCancel},
};
use crate::{
    adapters::create_adapters,
    app::create_app,
    http::types::{IAppOptions, TClock},
    identity::{initialize_setup, load_server_keys},
    repair::start_restored,
    status::IStatusState,
};
use envden_core::{
    adapters::storage::IStorageAdapter,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::base32;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::{net::TcpListener, sync::oneshot, task::JoinHandle};

#[derive(Default)]
pub struct IServeOptions {
    pub data_dir: Option<PathBuf>,
    pub port: Option<u16>,
    pub min_client: Option<String>,
    pub setup_token: Option<String>,
    pub restored: bool,
    pub now: Option<TClock>,
    pub scheduler: Option<Arc<dyn IScheduler>>,
    pub status_page: Option<String>,
}

pub struct RunningServer {
    pub url: String,
    pub storage: Arc<dyn IStorageAdapter>,
    jobs: Vec<TCancel>,
    stop: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<std::io::Result<()>>>,
}

impl RunningServer {
    pub async fn shutdown(&mut self) -> Result<()> {
        let Some(stop) = self.stop.take() else {
            return Ok(());
        };
        for cancel in self.jobs.drain(..) {
            cancel();
        }
        let _ = stop.send(());
        if let Some(task) = self.task.take() {
            task.await
                .map_err(|error| {
                    EnvdenError::with_source(ErrorCode::Internal, "Server shutdown failed", error)
                })?
                .map_err(|error| {
                    EnvdenError::with_source(ErrorCode::Internal, "Server shutdown failed", error)
                })?;
        }

        self.storage.close()
    }
}

pub async fn serve(options: IServeOptions) -> Result<RunningServer> {
    let data_dir = options.data_dir.unwrap_or_else(|| {
        PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".envden/server")
    });
    let now = options.now.unwrap_or_else(|| {
        Arc::new(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_millis() as u64
        })
    });
    let server_keys = load_server_keys(&data_dir)?;
    let storage = create_adapters(&data_dir, now())?;
    let app_options = IAppOptions {
        storage: storage.clone(),
        storage_lock: Arc::new(Mutex::new(())),
        now: now.clone(),
        server_keys,
        app_version: env!("CARGO_PKG_VERSION").into(),
        min_client: options.min_client.unwrap_or_else(|| "0.0.0".into()),
    };
    let result = async {
        if let Some(token) = initialize_setup(storage.as_ref(),&app_options.server_keys.public_key,options.setup_token.as_deref())? {
            println!("Setup token. Paste it when `envden setup` or `envden server move` asks:\n  {token}");
        }
        if options.restored {
            for restored in start_restored(&app_options)? {
                let id = base32(&restored.vault_id);
                if let Some(token) = restored.token {println!("Repair token for vault {id}. Paste it when `envden server repair` asks:\n  {token}");}
                else {println!("Vault {id} {}",restored.notice);}
            }
        }
        let status_setting=options.status_page.or_else(||std::env::var("ENVDEN_STATUS_PAGE").ok());
        let status = Arc::new(Mutex::new(IStatusState::new(now(),status_setting.as_deref())));
        let app = create_app(app_options.clone(),status.clone())?;
        let listener = TcpListener::bind(("127.0.0.1",options.port.unwrap_or(4280))).await.map_err(|error| EnvdenError::with_source(ErrorCode::Internal,"Server listen failed",error))?;
        let url = format!("http://{}/",listener.local_addr().map_err(|error| EnvdenError::with_source(ErrorCode::Internal,"Server listen failed",error))?);
        let (stop,receive) = oneshot::channel();
        let task = tokio::spawn(async move {super::transport::listen(listener,app,receive).await});
        println!("envden listening on {url}");
        let scheduler = options.scheduler.unwrap_or_else(|| Arc::new(SystemScheduler));
        let prune: super::scheduler::TJob = Arc::new(move || {
            let _guard = app_options.storage_lock.lock().expect("storage lock");
            status.lock().expect("status lock").last_prune = Some((now(),prune_history_safely(&app_options)));
        });
        let jobs = vec![scheduler.after(60000,prune.clone()),scheduler.every(3600000,prune)];

        Ok(RunningServer {url,storage:storage.clone(),jobs,stop:Some(stop),task:Some(task)})
    }.await;
    if result.is_err() {
        storage.close()?;
    }

    result
}
