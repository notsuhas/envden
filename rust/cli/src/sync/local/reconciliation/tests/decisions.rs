use super::*;

#[test]
fn reference_store_sources_and_conflict_gates() {
    for (link, status, tracked, expected) in [
        (true, "missing", false, true),
        (true, "linked", true, true),
        (true, "linked", false, true),
        (true, "detached", true, false),
        (false, "missing", true, false),
        (true, "relinkable", false, false),
    ] {
        assert_eq!(derive_store_source(link, status, tracked), expected);
    }
    for (action, choosing, detached, expected) in [
        (TContentAction::Conflict, false, false, true),
        (TContentAction::RepairConflict, true, true, true),
        (TContentAction::Detached, false, false, true),
        (TContentAction::Detached, true, false, false),
        (TContentAction::Detached, false, true, false),
        (TContentAction::Write(None), false, false, false),
        (TContentAction::Choose, false, false, false),
    ] {
        assert_eq!(needs_conflict(&action, choosing, detached), expected);
    }
}

#[test]
fn reference_content_decisions() {
    let input = IContent {
        linked: true,
        use_store: true,
        mine: Some(A),
        server: Some(B),
        previous: Some(C),
        ..Default::default()
    };
    assert_eq!(derive_content_action(&input), TContentAction::Choose);
    assert_eq!(
        derive_content_action(&IContent {
            previous: Some(B),
            ..input
        }),
        TContentAction::Write(Some(A))
    );
    assert_eq!(
        derive_content_action(&IContent {
            previous: Some(A),
            ..input
        }),
        TContentAction::Write(Some(B))
    );
    assert_eq!(
        derive_content_action(&IContent {
            mine: Some(B),
            ..input
        }),
        TContentAction::Write(Some(B))
    );
    assert_eq!(
        derive_content_action(&IContent {
            repair: true,
            ..input
        }),
        TContentAction::RepairConflict
    );
    assert_eq!(
        derive_content_action(&IContent {
            detached: true,
            previous: Some(B),
            ..input
        }),
        TContentAction::Detached
    );
}
