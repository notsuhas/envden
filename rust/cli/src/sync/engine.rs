use super::{
    local::{reconcile::reconcile_with_choice, selection::selected_repos},
    remote::{
        accept::accept_head,
        context::{ISyncOptions, sync_context},
        persist::persist_checkpoint,
        upload::upload_changes,
    },
};
use crate::{adapters::IAdapters, client::ITransport, state::lock::with_state_lock};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::{Value, json};
use std::{cell::RefCell, rc::Rc};

pub fn sync(
    adapters: &IAdapters,
    options: ISyncOptions,
    transport: Rc<dyn ITransport>,
    pushing: bool,
) -> Result<Value> {
    sync_with_unlock(adapters, options, transport, pushing, None)
}

pub fn first_sync(
    adapters: &IAdapters,
    options: ISyncOptions,
    transport: Rc<dyn ITransport>,
) -> Result<Value> {
    let choose = options.choose.clone();
    run_sync(adapters, options, transport, false, None, choose)
}

pub fn sync_with_unlock(
    adapters: &IAdapters,
    options: ISyncOptions,
    transport: Rc<dyn ITransport>,
    pushing: bool,
    unlock: Option<&crate::admin::r#move::follow::TMoveUnlock<'_>>,
) -> Result<Value> {
    run_sync(adapters, options, transport, pushing, unlock, None)
}

fn run_sync(
    adapters: &IAdapters,
    mut options: ISyncOptions,
    transport: Rc<dyn ITransport>,
    pushing: bool,
    unlock: Option<&crate::admin::r#move::follow::TMoveUnlock<'_>>,
    choose: Option<super::remote::context::TChoose>,
) -> Result<Value> {
    if pushing && !options.interactive && !options.yes {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Without a terminal, push needs --yes to confirm the changes",
        ));
    }
    let reports = Rc::new(RefCell::new(Vec::<String>::new()));
    let recorded = reports.clone();
    let report = options.report.take();
    options.report = Some(Rc::new(move |message| {
        recorded.borrow_mut().push(message.into());
        if let Some(report) = &report {
            report(message);
        }
    }));
    with_state_lock(&adapters.home, &*options.now.clone(), || {
        let mut context = sync_context(adapters, options, transport)?;
        crate::settings::refuse_configured_patterns(&adapters.home)?;
        let local = super::remote::accept::history::local_history(&context)?;
        let mut history =
            crate::vault::history::read_history(&context.client, &context.vault_id, Some(&local))?;
        if let Some(client) = crate::admin::r#move::follow::follow_server_move(
            adapters,
            &mut context.state,
            &context.client,
            &history,
            unlock,
        )? {
            context.client = client;
            history = crate::vault::history::read_history(
                &context.client,
                &context.vault_id,
                Some(&super::remote::accept::history::local_history(&context)?),
            )?;
        }
        let mut initial_history = Some(history);
        let cwd = context
            .options
            .cwd
            .clone()
            .unwrap_or_else(|| adapters.user_home.clone());
        crate::links::checkout::adopt::adopt_worktree_at(
            adapters,
            &mut context.state,
            &cwd.to_string_lossy(),
            &|m| {
                if let Some(report) = &context.options.report {
                    report(m);
                }
            },
        )?;
        let repos = selected_repos(
            adapters,
            &mut context.state,
            &cwd,
            context.options.all,
            &mut context.skipped_roots,
            &|m| {
                if let Some(report) = &context.options.report {
                    report(m);
                }
            },
        )?;
        for _ in 0..3 {
            let history = match initial_history.take() {
                Some(history) => history,
                None => crate::vault::history::read_history(
                    &context.client,
                    &context.vault_id,
                    Some(&super::remote::accept::history::local_history(&context)?),
                )?,
            };
            let accepted = accept_head(&mut context, Some(history), false)?;
            super::repairs::report_repairs(&context, &accepted.repairs)?;
            persist_checkpoint(&mut context)?;
            super::remote::attempt::record::acknowledge(&context)?;
            let result = reconcile_with_choice(
                &mut context,
                &repos,
                &accepted.no_fast_forward.into_iter().collect(),
                choose.clone(),
            )?;
            persist_checkpoint(&mut context)?;
            let conflicts = if pushing {
                result
                    .conflicts
                    .max(super::local::conflicts::conflict_records(&adapters.home)?.len())
            } else {
                result.conflicts
            };
            let changed = if pushing {
                match upload_changes(&mut context, &repos, &result.failed_stores) {
                    Err(e) if e.code == ErrorCode::HeadMoved => continue,
                    other => other?,
                }
            } else {
                result.changed
            };
            if pushing {
                persist_checkpoint(&mut context)?;
            }
            super::local::retention::prune_backups(&adapters.home, (context.options.now)())?;
            adapters.prune_placement_backups((context.options.now)())?;
            if crate::notice::fetch::settle_remote_notice(&context)
                .and_then(|()| {
                    crate::notice::cache::refresh_notice(
                        &adapters.home,
                        &context.state,
                        |r| adapters.repo.case_insensitive(r, true),
                        &adapters.now,
                    )
                })
                .is_err()
                && let Some(report) = &context.options.report
            {
                report("Notice refresh failed; sync completed");
            }
            crate::output::counts::set_command_counts(crate::output::counts::ICounts {
                changed: Some(changed as u64),
                conflicts: Some(conflicts as u64),
            });
            return Ok(
                json!({"kind":if !pushing {"pulled"} else if conflicts>0 {"conflict"} else {"pushed"},"changed":changed,"conflicts":conflicts,"reports":*reports.borrow()}),
            );
        }
        Err(EnvdenError::new(
            ErrorCode::HeadMoved,
            "Another device kept changing files during sync. Run the command again",
        ))
    })
}

#[cfg(test)]
mod tests;
