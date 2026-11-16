use super::{
    cache::{notice_status, refresh_notice},
    offers::cache_offers,
    pending::report_pending_joins,
    remote::read_remote_notice,
};
use crate::{
    adapters::IAdapters,
    output::sanitize_terminal,
    state::{lock::with_state_lock, repository::load_state},
    updates::{check::run_update_check, fetch::IFetcher, status::update_status},
};
use envden_core::errors::Result;
use serde_json::{Value, json};

pub fn command_notice(
    adapters: &IAdapters,
    now: u64,
    fetcher: &dyn IFetcher,
    refresh: bool,
    cwd: Option<&str>,
    local_only: bool,
) -> Value {
    command_notice_with_transport(
        adapters,
        now,
        fetcher,
        refresh,
        cwd,
        local_only,
        std::rc::Rc::new(crate::client::UreqTransport),
    )
}

pub fn command_notice_with_transport(
    adapters: &IAdapters,
    now: u64,
    fetcher: &dyn IFetcher,
    refresh: bool,
    cwd: Option<&str>,
    local_only: bool,
    transport: std::rc::Rc<dyn crate::client::ITransport>,
) -> Value {
    let result = (|| -> Result<Value> {
        if !refresh {
            with_state_lock(&adapters.home, &adapters.now, || {
                report_pending_joins(&adapters.home, (adapters.now)())
            })?;
        }
        if !local_only
            && let Some(state) = load_state(&adapters.home)?
            && state["checkpoint"].is_string()
        {
            let remote = read_remote_notice(&adapters.home)?;
            if !refresh || remote.is_none_or(|r| now as f64 - r.checked_at >= 60_000.0) {
                let options = crate::sync::remote::context::ISyncOptions {
                    unlock: None,
                    now: std::rc::Rc::new(move || now),
                    cwd: None,
                    all: true,
                    yes: false,
                    interactive: false,
                    choose: None,
                    confirm: None,
                    report: None,
                };
                let bounded = super::deadline::bounded_transport(
                    transport,
                    adapters.now,
                    (adapters.now)().saturating_add(2_000),
                );
                let _ = super::fetch::remote_notice(adapters, options, bounded);
            }
        }
        if !refresh && !local_only {
            run_update_check(adapters, now, false, fetcher)?;
        }
        with_state_lock(&adapters.home, &adapters.now, || {
            let executable = std::env::current_exe().map_err(crate::state::files::failure)?;
            super::cleanup::cleanup_old_binary(&executable, cfg!(windows))?;
            let Some(state) = load_state(&adapters.home)? else {
                return Ok(json!({"repos":[],"update":update_status(&adapters.home)?}));
            };
            if !refresh {
                report_pending_joins(&adapters.home, (adapters.now)())?;
            }
            let remote = read_remote_notice(&adapters.home)?;
            refresh_notice(
                &adapters.home,
                &state,
                |root| adapters.repo.case_insensitive(root, true),
                (adapters.now)(),
            )?;
            let update = update_status(&adapters.home)?;
            cache_offers(adapters, &state, cwd, &update, now)?;
            let mut repos = notice_status(&adapters.home, &state)?;
            if let Some(remote) = remote {
                for repo in remote.repos {
                    if !repos.contains(&repo) {
                        repos.push(repo);
                    }
                }
            }
            let repo = super::current::current_repo_id(&state, cwd);
            repos.retain(|r| Some(r.as_str()) != repo);
            Ok(
                json!({"repos":repos.iter().map(|r|sanitize_terminal(r)).collect::<Vec<_>>(),"update":update}),
            )
        })
    })();
    result.unwrap_or_else(|_| json!({"repos":[],"update":{"available":false,"required":false}}))
}

pub fn report_command_notice(notice: &Value) {
    for repo in notice["repos"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
    {
        eprintln!("envden: {repo} out of sync");
    }
    if notice["update"]["available"] == true {
        eprintln!("envden: update available; run envden update");
    }
    if notice["update"]["required"] == true {
        eprintln!("envden: update required; run envden update");
    }
}
