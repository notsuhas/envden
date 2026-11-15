use super::{
    local::{reconcile::reconcile, selection::selected_repos},
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
    mut options: ISyncOptions,
    transport: Rc<dyn ITransport>,
    pushing: bool,
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
    with_state_lock(&adapters.home, (options.now)(), || {
        let mut context = sync_context(adapters, options, transport)?;
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
            let accepted = accept_head(&mut context, None, false)?;
            persist_checkpoint(&mut context)?;
            super::remote::attempt::record::acknowledge(&context)?;
            let result = reconcile(
                &mut context,
                &repos,
                &accepted.no_fast_forward.into_iter().collect(),
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
            persist_checkpoint(&mut context)?;
            super::local::retention::prune_backups(&adapters.home, (context.options.now)())?;
            if crate::notice::fetch::settle_remote_notice(&context)
                .and_then(|()| {
                    crate::notice::cache::refresh_notice(
                        &adapters.home,
                        &context.state,
                        |r| adapters.repo.case_insensitive(r, true),
                        (adapters.now)(),
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
mod tests {
    use super::*;
    struct NeverCall;
    impl ITransport for NeverCall {
        fn fetch(&self, _: crate::client::IHttpRequest) -> Result<crate::client::IHttpResponse> {
            panic!("unconfigured sync must not request the server")
        }
    }
    #[test]
    fn piped_push_requires_yes_before_loading_state() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(dir.path().to_owned()),
            dir.path().to_owned(),
            || 1,
        );
        for (pushing, yes, message) in [
            (
                true,
                false,
                "Without a terminal, push needs --yes to confirm the changes",
            ),
            (true, true, crate::state::NOT_SET_UP),
            (false, false, crate::state::NOT_SET_UP),
        ] {
            let options = ISyncOptions {
                now: adapters.now,
                cwd: None,
                all: true,
                yes,
                interactive: false,
                choose: None,
                confirm: None,
                report: None,
            };
            assert_eq!(
                sync(&adapters, options, Rc::new(NeverCall), pushing)
                    .unwrap_err()
                    .message,
                message
            );
        }
    }
}
