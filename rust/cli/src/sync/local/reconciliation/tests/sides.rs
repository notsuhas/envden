use crate::sync::local::reconciliation::sides::{
    ICopy, ISidesInput, TLocalContent, TServer, derive_file_sides,
};

type TBytes = Option<&'static [u8]>;

struct IScenario {
    store: TBytes,
    recorded: TBytes,
    previous: TBytes,
    server: TServer<'static>,
    copy: TBytes,
    base: TBytes,
    pending: bool,
}

fn reference(input: &IScenario) -> TBytes {
    let live = match input.server {
        TServer::Live(bytes) => Some(bytes),
        _ => None,
    };
    let effective = input.store.or(if input.pending { None } else { live });
    let store_edit = input.store.is_some()
        && (input.store != input.recorded.or(input.previous) || input.store != input.previous);
    let copy_edit = input.copy.is_some()
        && input.copy != effective
        && !(input.copy == live && effective == input.previous)
        && if input.base.is_some() {
            input.copy != input.base
        } else {
            input.copy != input.previous && input.copy != live
        };
    let owner = if input.pending {
        None
    } else if store_edit && (!copy_edit || input.base != effective) {
        input.store
    } else if copy_edit
        || (effective.is_none()
            && input.copy.is_some()
            && input.base.is_some()
            && !matches!(input.server, TServer::Tombstone))
    {
        input.copy
    } else {
        effective
    };
    let on_server = |value: TBytes| match input.server {
        TServer::Live(bytes) => value == Some(bytes),
        TServer::Tombstone => value.is_none(),
        TServer::Absent => false,
    };
    if !on_server(owner) || (input.base.is_some() && input.base == effective) {
        return owner;
    }
    [
        if store_edit { input.store } else { None },
        if copy_edit { input.copy } else { None },
    ]
    .into_iter()
    .find(|edit| edit.is_some() && *edit != owner && !on_server(*edit))
    .flatten()
    .or(owner)
}

#[test]
fn all_6400_reachable_copy_states_match_the_design_reference() {
    let values: [TBytes; 4] = [None, Some(b"A"), Some(b"B"), Some(b"C")];
    let servers = [
        TServer::Absent,
        TServer::Tombstone,
        TServer::Live(b"A"),
        TServer::Live(b"B"),
        TServer::Live(b"C"),
    ];
    let mut count = 0;
    for tuple in 0usize..1024 {
        let value = |shift: usize| values[(tuple >> shift) & 3];
        for server in servers {
            for pending in [false, true] {
                let input = IScenario {
                    store: value(0),
                    recorded: value(2),
                    previous: value(4),
                    copy: value(6),
                    base: value(8),
                    server,
                    pending,
                };
                if pending && input.store.is_some() {
                    continue;
                }
                let result = derive_file_sides(&ISidesInput {
                    store_before_restore: input.store,
                    recorded: input.recorded,
                    previous: input.previous,
                    server,
                    pending_removal: pending,
                    copies: vec![ICopy {
                        bytes: input.copy,
                        base: input.base,
                        tracked: true,
                        link: false,
                        historical: input.base.is_none()
                            && input.copy.is_some()
                            && input.copy == input.previous,
                    }],
                });
                assert_eq!(
                    result.mine,
                    reference(&input),
                    "tuple {tuple}, pending {pending}"
                );
                if pending && !matches!(server, TServer::Tombstone) {
                    assert!(result.mine.is_none());
                }
                let mut saved = vec![result.mine];
                if let TLocalContent::Conflict(variants) = &result.local {
                    saved.extend(variants.iter().copied());
                }
                let store_edit = if input.store.is_some()
                    && !(input.base == input.store
                        && input.copy.is_some()
                        && input.copy != input.base)
                    && (input.store != input.recorded.or(input.previous)
                        || input.store != input.previous)
                {
                    input.store
                } else {
                    None
                };
                let copy_edit =
                    if input.copy.is_some() && input.copy != input.base.or(input.previous) {
                        input.copy
                    } else {
                        None
                    };
                for edit in [store_edit, copy_edit].into_iter().flatten() {
                    let on_server = matches!(server, TServer::Live(bytes) if bytes == edit);
                    if !on_server {
                        assert!(saved.contains(&Some(edit)), "lost edit, tuple {tuple}");
                    }
                }
                if matches!(result.local, TLocalContent::Conflict(_))
                    && !matches!(server, TServer::Absent)
                {
                    assert!(
                        !match server {
                            TServer::Live(bytes) => result.mine == Some(bytes),
                            _ => result.mine.is_none(),
                        },
                        "settled mine, tuple {tuple}"
                    );
                }
                count += 1;
            }
        }
    }
    assert_eq!(count, 6400);
}

#[test]
fn owning_store_edit_is_independent_of_target_order() {
    for reversed in [false, true] {
        let mut copies: Vec<(&[u8], TBytes)> = vec![(b"B", Some(b"A")), (b"C", None)];
        if reversed {
            copies.reverse();
        }
        let result = derive_file_sides(&ISidesInput {
            store_before_restore: Some(b"A"),
            recorded: None,
            previous: None,
            server: TServer::Absent,
            pending_removal: false,
            copies: copies
                .into_iter()
                .map(|(bytes, base)| ICopy {
                    bytes: Some(bytes),
                    base,
                    tracked: true,
                    link: false,
                    historical: false,
                })
                .collect(),
        });
        assert_eq!(result.mine, Some(b"A".as_slice()));
    }
}
