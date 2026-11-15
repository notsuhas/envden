use super::{
    recovery::add_pending_joins,
    remote::{IRemoteNotice, write_remote_notice},
};
use crate::{
    adapters::IAdapters,
    client::{ITransport, text},
    settings::read_config,
    state::lock::with_state_lock,
    sync::{
        local::{applied::has_applied_entry, receiving::receives_file},
        remote::{
            accept::accept_head,
            content::{entry_name, readable_entries},
            context::{ISyncContext, ISyncOptions, sync_context},
        },
    },
};
use envden_core::{
    adapters::{IEnvFileRules, accepts_env_path},
    errors::Result,
};
use envden_protocol::protocol as p;
use std::rc::Rc;

pub struct IRemoteStatus {
    pub checked_at: u64,
    pub repos: Vec<String>,
    pub files: Vec<p::IFileName>,
}

pub fn remote_notice(
    adapters: &IAdapters,
    options: ISyncOptions,
    transport: Rc<dyn ITransport>,
) -> Result<IRemoteStatus> {
    let mut context = sync_context(adapters, options, transport)?;
    accept_head(&mut context, None, true)?;
    let result = pending_repos(&context)?;
    with_state_lock(&adapters.home, (adapters.now)(), || {
        write_remote_notice(
            &adapters.home,
            &IRemoteNotice {
                checked_at: result.checked_at as f64,
                repos: result.repos.clone(),
            },
            (adapters.now)(),
        )?;
        let entries = context
            .entries
            .iter()
            .map(|e| p::encode(e).map(|b| text(&b)))
            .collect::<Result<Vec<_>>>()?;
        add_pending_joins(
            &adapters.home,
            &entries,
            &context.identity.record.id,
            (adapters.now)(),
        )
    })?;
    Ok(result)
}

pub fn settle_remote_notice(context: &ISyncContext<'_>) -> Result<()> {
    let result = pending_repos(context)?;
    with_state_lock(&context.adapters.home, (context.options.now)(), || {
        write_remote_notice(
            &context.adapters.home,
            &IRemoteNotice {
                checked_at: result.checked_at as f64,
                repos: result.repos,
            },
            (context.options.now)(),
        )
    })
}

fn pending_repos(context: &ISyncContext<'_>) -> Result<IRemoteStatus> {
    let applied = crate::sync::local::applied::applied_files(&context.adapters.home)?;
    let config = read_config(&context.adapters.home)?;
    let patterns = |key| {
        config["env-files"][key].as_array().map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(str::to_owned))
                .collect()
        })
    };
    let rules = IEnvFileRules {
        include: patterns("include"),
        exclude: patterns("exclude"),
        extra_skipped: patterns("extraSkipped"),
    };
    let mut files = Vec::new();
    let mut repos = Vec::new();
    for entry in readable_entries(context)? {
        if has_applied_entry(&context.adapters.home, &entry, Some(&applied))? {
            continue;
        }
        let name = entry_name(context, &entry)?;
        if accepts_env_path(&name.path, Some(&rules)) && receives_file(&context.state, &name) {
            if !repos.contains(&name.repo_id) {
                repos.push(name.repo_id.clone());
            }
            files.push(name);
        }
    }
    Ok(IRemoteStatus {
        checked_at: (context.options.now)(),
        repos,
        files,
    })
}
