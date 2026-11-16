use super::{
    decision::{IContent, TContentAction},
    file_decision::{IFileDecisionInput, derive_file_decision},
    operation::resume::{commit_file, resume_file},
    resolution::{IResolutionInput, IResolutionOptions, TResolution, resolve_content},
    sides::{ICopy, ISidesInput, TServer},
    snapshot::snapshots,
};
use crate::{
    client::text,
    sync::{
        local::{
            conflicts::{
                IConflictTarget,
                record::{IConflictSeed, IConflictSides},
            },
            files::{base_path, read_bytes},
        },
        remote::context::ISyncContext,
    },
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use std::collections::HashSet;

pub fn reconcile_file_with_choice(
    context: &mut ISyncContext<'_>,
    targets: &[IConflictTarget],
    store: &str,
    entry: Option<&p::IFileEntry>,
    repairs: &HashSet<String>,
    choose: Option<crate::sync::remote::context::TChoose>,
) -> Result<(usize, usize)> {
    resume_file(context, store)?;
    if targets.is_empty() {
        return Ok((0, 0));
    }
    let base = base_path(&context.adapters.home, store, None);
    let lineage = super::ancestry::ancestry(context, store, targets, entry)?;
    let server = lineage.server;
    let ancestor = lineage.encoded;
    let previous = lineage.previous;
    let stored = lineage.stored;
    let deleting = lineage.deleting;
    let snapshots = snapshots(context, targets, stored.as_deref(), previous.as_deref())?;
    let recorded = read_bytes(&base)?;
    let tombstone = entry.is_some_and(|e| matches!(e.state, 2 | 4));
    let decision = derive_file_decision(IFileDecisionInput {
        content: IContent {
            choosing: choose.is_some() || lineage.invalid,
            reappeared: lineage.reappeared,
            previous: previous.as_deref(),
            server: server.as_deref(),
            recorded: recorded.as_deref(),
            detached: snapshots.iter().any(|s| s.detached),
            tombstone,
            applied: entry.is_some_and(|e| {
                ancestor.as_deref() == p::encode(e).ok().map(|b| text(&b)).as_deref()
            }),
            repair: entry.is_some_and(|e| repairs.contains(&p::base32(&e.file_id))),
            ..Default::default()
        },
        sides: ISidesInput {
            store_before_restore: lineage.before.as_deref(),
            recorded: recorded.as_deref(),
            previous: previous.as_deref(),
            server: TServer::Absent,
            copies: snapshots
                .iter()
                .filter(|s| !s.use_store)
                .map(|s| ICopy {
                    bytes: s.bytes.as_deref(),
                    base: s.base.as_deref(),
                    tracked: s.tracked,
                    link: s.link,
                    historical: s.historical,
                })
                .collect(),
            pending_removal: deleting,
        },
        tracked: snapshots.iter().any(|s| s.tracked),
        published: entry.is_some(),
        deleting,
        store: stored.as_deref(),
    });
    let writable = matches!(decision.action, TContentAction::Write(_))
        && !lineage.invalid
        && !lineage.corrupt
        && stored == server
        && snapshots
            .iter()
            .all(|s| s.bytes.is_none() || s.bytes == server);
    if super::operation::conflict::blocks_file(
        &context.adapters.home,
        store,
        writable,
        (context.options.now)(),
    )? {
        return Ok((usize::from(lineage.restored), 1));
    }
    let mine = decision.sides.mine;
    let chooser = choose.or_else(|| {
        context
            .options
            .choose
            .clone()
            .filter(|_| context.options.interactive && snapshots.iter().any(|s| s.detached))
    });
    let local_conflict = matches!(
        decision.sides.local,
        super::sides::TLocalContent::Conflict(_)
    );
    let resolution = if local_conflict {
        super::resolution::resolve_local_conflict(
            context.options.interactive,
            &targets[0].path,
            mine,
            decision.sides.theirs,
            chooser.as_deref(),
        )?
    } else {
        match &decision.action {
            TContentAction::Write(bytes) if !lineage.invalid && !lineage.corrupt => {
                TResolution::Write(bytes.map(<[u8]>::to_vec))
            }
            _ => resolve_content(
                &IResolutionOptions {
                    interactive: Some(context.options.interactive),
                    yes: context.options.yes,
                    report: context.options.report.as_deref(),
                    confirm: context.options.confirm.as_deref(),
                },
                IResolutionInput {
                    path: &targets[0].path,
                    mine,
                    server: server.as_deref(),
                    previous: previous.as_deref(),
                    choose: chooser.as_deref(),
                    default_content: server.as_deref(),
                },
            )?,
        }
    };
    let resolution = if entry.is_some_and(|e| repairs.contains(&p::base32(&e.file_id)))
        || (!local_conflict
            && (lineage.invalid
                || lineage.corrupt
                || matches!(decision.action, TContentAction::Conflict)))
    {
        TResolution::Conflict
    } else {
        resolution
    };
    let encoded = entry.map(|e| p::encode(e).map(|b| text(&b))).transpose()?;
    match resolution {
        TResolution::Conflict => {
            let first = &targets[0];
            let mut variants = vec![stored.as_deref(), server.as_deref()];
            variants.extend(snapshots.iter().map(|s| s.bytes.as_deref()));
            super::conflict::record_file_conflict(
                context,
                IConflictSeed {
                    cwd: context
                        .options
                        .cwd
                        .as_ref()
                        .map(|p| p.to_string_lossy().into_owned()),
                    entry: encoded,
                    store: store.into(),
                    root: first.root.clone(),
                    path: first.path.clone(),
                    mode: first.mode.clone(),
                    base: base.to_string_lossy().into_owned(),
                    targets: targets.to_vec(),
                },
                &IConflictSides {
                    mine,
                    server: server.as_deref(),
                    previous: previous.as_deref(),
                    tombstone,
                },
                &variants,
                entry,
                entry.is_some_and(|e| repairs.contains(&p::base32(&e.file_id))),
            )?;
            Ok((usize::from(lineage.restored), 1))
        }
        TResolution::Write(next) => {
            let changed = usize::from(
                lineage.restored || stored != next || snapshots.iter().any(|s| s.bytes != next),
            );
            commit_file(
                context,
                targets,
                store,
                next.as_deref(),
                server.as_deref(),
                encoded.as_deref(),
            )?;
            Ok((changed, 0))
        }
    }
}
